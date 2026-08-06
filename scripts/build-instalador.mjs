/**
 * Arma el instalable de una sucursal: `build/SetupPOS-ZonaOeste.exe`.
 *
 * Pasos: build de la app → payload (app + runtime de Node + PostgreSQL +
 * lanzador + esquema SQL) → compilación con Inno Setup.
 *
 * Requiere Inno Setup 6 instalado (`winget install JRSoftware.InnoSetup`).
 * Se busca ISCC.exe también en la instalación por usuario, que es donde lo deja
 * winget por defecto y no en Archivos de programa.
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(raiz, 'build');
const payload = join(build, 'payload');
const require_ = createRequire(import.meta.url);

const RUTAS_ISCC = [
  join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
];

async function paso(nombre, fn) {
  process.stdout.write(`→ ${nombre}... `);
  const r = await fn();
  console.log('ok');
  return r;
}

const iscc = RUTAS_ISCC.find((p) => p && existsSync(p));
if (!iscc) {
  console.error('No encontré ISCC.exe (Inno Setup 6).\nInstalalo con:  winget install JRSoftware.InnoSetup');
  process.exit(1);
}

await paso('build de la aplicación', async () => {
  execFileSync(process.execPath, [join(raiz, 'scripts/build-app.mjs')], { stdio: 'pipe' });
});

await paso('limpiar payload', async () => {
  await rm(payload, { recursive: true, force: true });
  await mkdir(payload, { recursive: true });
});

await paso('copiar la aplicación', async () => {
  await cp(join(build, 'app'), join(payload, 'app'), { recursive: true });
});

await paso('copiar el runtime de Node', async () => {
  // El mini-PC de la sucursal no tiene Node instalado: viaja el binario con el
  // que se construyó, así no hay que instalar nada previo en la máquina.
  await cp(process.execPath, join(payload, 'node.exe'));
});

await paso('copiar PostgreSQL', async () => {
  // Los binarios del Postgres embebido. `native/` trae bin, lib y share, que es
  // todo lo que initdb y postgres necesitan.
  //
  // El paquete de plataforma es una dependencia opcional que pnpm deja en su
  // store y no expone en la raíz, así que no se puede resolver por nombre: se
  // busca en .pnpm. Si algún día se cambia de gestor, el require.resolve de
  // abajo lo encuentra igual.
  const store = join(raiz, 'node_modules/.pnpm');
  let base = null;
  if (existsSync(store)) {
    const dir = (await readdir(store)).find((d) => d.startsWith('@embedded-postgres+windows-x64@'));
    if (dir) base = join(store, dir, 'node_modules/@embedded-postgres/windows-x64');
  }
  if (!base) {
    try {
      base = dirname(require_.resolve('@embedded-postgres/windows-x64/package.json'));
    } catch { /* se reporta abajo */ }
  }
  const nativo = base ? join(base, 'native') : null;
  if (!nativo || !existsSync(nativo)) {
    throw new Error('No encontré los binarios de PostgreSQL (@embedded-postgres/windows-x64). ¿Corriste `pnpm install`?');
  }
  await cp(nativo, join(payload, 'pgsql'), { recursive: true, dereference: true });
});

await paso('generar el esquema consolidado', async () => {
  // Un solo SQL en vez del CLI de Prisma dentro del paquete: el Postgres embebido
  // no trae psql y arrastrar el CLI serían decenas de MB para correrlo una vez.
  const prismaBin = join(dirname(require_.resolve('prisma/package.json')), 'build', 'index.js');
  const sql = execFileSync(
    process.execPath,
    [prismaBin, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', join(raiz, 'prisma/schema.prisma'), '--script'],
    { cwd: raiz, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (!sql.includes('CREATE TABLE')) throw new Error('El esquema generado no tiene tablas — revisá el schema de Prisma.');
  await writeFile(join(payload, 'esquema.sql'), sql, 'utf8');
});

await paso('copiar el lanzador', async () => {
  for (const archivo of ['iniciar.mjs', 'iniciar.cmd']) {
    await cp(join(raiz, 'instalador', archivo), join(payload, archivo));
  }
});

const salida = await paso('compilar el instalador (Inno Setup)', async () => {
  execFileSync(iscc, [join(raiz, 'instalador', 'pos-zonaoeste.iss')], { cwd: join(raiz, 'instalador'), stdio: 'pipe' });
  return join(build, 'SetupPOS-ZonaOeste.exe');
});

const mb = (statSync(salida).size / 1024 / 1024).toFixed(1);
console.log(`\nListo: ${salida}  (${mb} MB)`);
