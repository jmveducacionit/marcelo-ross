/**
 * Build de producción de la aplicación de una sucursal.
 *
 * Produce `build/app/`, que es lo que el instalador empaqueta:
 *
 *   build/app/
 *     server.mjs        bundle del pos-server (un solo archivo)
 *     web/              front compilado por Vite (lo sirve el propio server)
 *     prisma/           schema + migraciones (para `migrate deploy` en la instalación)
 *     node_modules/     SOLO las dependencias que no se pueden bundlear
 *
 * Por qué esbuild y no `tsc`: el servidor queda en un único archivo, así no hay
 * que arrastrar el árbol de node_modules de pnpm (que son symlinks y no se copian
 * bien). Lo único que queda afuera es lo que tiene binarios nativos o generación
 * de código propia: Prisma y Argon2.
 */
import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'build', 'app');
const require_ = createRequire(import.meta.url);

/** Dependencias que NO se bundlean: binarios nativos o código generado. */
const EXTERNOS = ['@prisma/client', '.prisma/client', '@node-rs/argon2'];

async function paso(nombre, fn) {
  process.stdout.write(`→ ${nombre}... `);
  const r = await fn();
  console.log('ok');
  return r;
}

await paso('limpiar build/app', async () => {
  await rm(salida, { recursive: true, force: true });
  await mkdir(salida, { recursive: true });
});

await paso('bundlear el servidor', async () => {
  await build({
    entryPoints: [join(raiz, 'apps/pos-server/src/main.ts')],
    outfile: join(salida, 'server.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    external: EXTERNOS,
    sourcemap: false,
    minify: false, // legible: si la demo falla en la sucursal, el stack trace sirve
    banner: {
      // Prisma y algunas deps esperan `require` disponible en el scope ESM.
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
  });
});

await paso('copiar el front compilado', async () => {
  const dist = join(raiz, 'apps/pos-web/dist');
  if (!existsSync(dist)) throw new Error('Falta apps/pos-web/dist — corré primero el build del front.');
  await cp(dist, join(salida, 'web'), { recursive: true });
});

await paso('copiar schema y migraciones de Prisma', async () => {
  await cp(join(raiz, 'prisma'), join(salida, 'prisma'), {
    recursive: true,
    filter: (src) => !src.includes('seed.ts'), // el seed de demo se compila aparte
  });
});

await paso('copiar dependencias no bundleables', async () => {
  // Se resuelven por su ruta real (pnpm usa symlinks) y se copian aplanadas.
  const aCopiar = [
    ['@prisma/client', require_.resolve('@prisma/client/package.json')],
    ['@node-rs/argon2', require_.resolve('@node-rs/argon2/package.json')],
  ];
  for (const [nombre, pkgJson] of aCopiar) {
    await cp(dirname(pkgJson), join(salida, 'node_modules', nombre), { recursive: true, dereference: true });
  }

  // Argon2 carga su binario por nombre de paquete de plataforma (no por ruta
  // relativa), así que el .node no viene dentro de @node-rs/argon2 y hay que
  // copiarlo aparte. pnpm no lo expone en la raíz: se busca en el store.
  // El instalador es para Windows x64 — si algún día hay otro target, esto se
  // parametriza.
  const nativoArgon = join(raiz, 'node_modules/.pnpm/@node-rs+argon2-win32-x64-msvc@2.0.2/node_modules/@node-rs/argon2-win32-x64-msvc');
  if (!existsSync(nativoArgon)) {
    throw new Error(`No encontré el binario de Argon2 para Windows en ${nativoArgon}. Si cambió la versión, actualizá la ruta en este script.`);
  }
  await cp(nativoArgon, join(salida, 'node_modules/@node-rs/argon2-win32-x64-msvc'), { recursive: true, dereference: true });
  // El cliente generado de Prisma (.prisma/client) incluye el query engine nativo.
  // Con pnpm no vive en la raíz de node_modules sino al lado de @prisma/client
  // dentro del store, así que se resuelve desde ahí.
  // .../node_modules/@prisma/client/package.json → .../node_modules/.prisma/client
  const nodeModulesDePrisma = dirname(dirname(dirname(require_.resolve('@prisma/client/package.json'))));
  const generado = join(nodeModulesDePrisma, '.prisma', 'client');
  if (!existsSync(generado)) {
    throw new Error(`No encontré el cliente generado de Prisma en ${generado} — corré \`pnpm db:generate\`.`);
  }
  await cp(generado, join(salida, 'node_modules/.prisma/client'), {
    recursive: true,
    dereference: true,
    filter: (src) => !/\.tmp\d+$/.test(src), // restos de la generación de Prisma
  });
});

await paso('escribir package.json del paquete', async () => {
  await writeFile(
    join(salida, 'package.json'),
    JSON.stringify({ name: 'pos-sucursal', private: true, type: 'module', main: 'server.mjs' }, null, 2) + '\n',
    'utf8',
  );
});

console.log(`\nListo: ${salida}`);
