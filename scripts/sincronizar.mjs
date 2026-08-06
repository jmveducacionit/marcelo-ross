/**
 * Trae el código compartido desde el repo de origen (el instalable).
 *
 * La opción elegida fue dos repos independientes con código duplicado. Este
 * script existe para que la duplicación sea MANTENIBLE en vez de silenciosa:
 * copia lo común y después muestra qué cambió, para revisarlo antes de commitear.
 *
 * NO toca los archivos con diferencias declaradas en DIVERGENCIA.md: los deja
 * como están y avisa para que los mires a mano.
 *
 *   node scripts/sincronizar.mjs "C:/ruta/al/repo/instalable"
 */
import { execFileSync } from 'node:child_process';
import { cp, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origen = process.argv[2];

if (!origen || !existsSync(join(origen, 'package.json'))) {
  console.error('Uso: node scripts/sincronizar.mjs "<ruta al repo del instalable>"');
  process.exit(1);
}

/** Rutas que se copian tal cual: son 100 % compartidas. */
const COMPARTIDO = [
  'packages/core-domain/src',
  'packages/contracts/src',
  'apps/pos-server/src/modules',
  'apps/pos-server/src/shared',
  'apps/pos-server/src/auth',
  'apps/pos-web/src',
  'prisma/migrations',
  'prisma/seed.ts',
  'docs/adr',
];

/** Archivos compartidos CON diferencias declaradas: no se tocan. */
const NO_TOCAR = [
  'prisma/schema.prisma',
  'apps/pos-server/src/main.ts',
  'package.json',
  'apps/pos-server/package.json',
];

for (const ruta of COMPARTIDO) {
  const desde = join(origen, ruta);
  if (!existsSync(desde)) { console.warn(`  (no existe en el origen: ${ruta})`); continue; }
  const info = await stat(desde);
  await cp(desde, join(raiz, ruta), { recursive: info.isDirectory() });
  console.log(`  copiado ${ruta}`);
}

console.log('\nArchivos con divergencia declarada — revisalos A MANO si cambiaron:');
for (const f of NO_TOCAR) {
  try {
    const d = execFileSync('git', ['diff', '--stat', '--no-index', join(origen, f), join(raiz, f)], { encoding: 'utf8' });
    console.log(d.trim() ? `  ${f}: DIFIERE` : `  ${f}: igual`);
  } catch {
    console.log(`  ${f}: DIFIERE (esperado — ver DIVERGENCIA.md)`);
  }
}

console.log('\nAhora revisá con `git diff` antes de commitear. Y corré `pnpm test`.');
