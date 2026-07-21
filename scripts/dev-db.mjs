/**
 * Postgres embebido para desarrollo/demo — NO requiere Docker.
 * Levanta un Postgres real desde Node, persistido en .dev-db/ (gitignored).
 * Coincide con DATABASE_URL: postgresql://pos:pos@localhost:5432/pos
 *
 * Uso:
 *   node scripts/dev-db.mjs         -> arranca y queda corriendo (Ctrl+C para frenar)
 *   node scripts/dev-db.mjs --once  -> arranca, espera señal, igual (mismo comportamiento)
 *
 * La primera vez inicializa el cluster; las siguientes reutiliza los datos.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '.dev-db');
const yaInicializado = existsSync(dataDir);

const PORT = Number(process.env.PGPORT ?? 54329);
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'pos',
  password: 'pos',
  port: PORT,
  persistent: true,
});

async function main() {
  if (!yaInicializado) {
    console.log('[dev-db] inicializando cluster por primera vez...');
    await pg.initialise();
  }
  await pg.start();
  console.log(`[dev-db] Postgres arriba en localhost:${PORT}`);

  // Garantizar la base "pos" (ignorar si ya existe).
  try {
    await pg.createDatabase('pos');
    console.log('[dev-db] base "pos" creada');
  } catch (e) {
    console.log('[dev-db] base "pos" ya existe (ok)');
  }
  console.log(`[dev-db] listo. DATABASE_URL=postgresql://pos:pos@localhost:${PORT}/pos`);

  const cerrar = async () => {
    console.log('\n[dev-db] deteniendo Postgres...');
    try { await pg.stop(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main().catch((e) => {
  console.error('[dev-db] error:', e);
  process.exit(1);
});
