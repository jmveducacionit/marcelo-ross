/**
 * Lanzador de la instalación de sucursal.
 *
 * Reemplaza las tres terminales del entorno de desarrollo por un solo proceso:
 * levanta PostgreSQL, prepara la base la primera vez, arranca el servidor y abre
 * el navegador. El empleado hace doble clic y vende.
 *
 * Layout de la instalación (todo relativo a este archivo):
 *
 *   node.exe          runtime propio — el mini-PC no tiene Node instalado
 *   iniciar.mjs       este archivo
 *   app/              server.mjs, seed.mjs, web/, node_modules/
 *   pgsql/            binarios de PostgreSQL (initdb, pg_ctl, postgres)
 *   esquema.sql       esquema consolidado; evita empaquetar el CLI de Prisma
 *   datos/            se crea en el primer arranque: cluster + config.json
 *
 * Primer arranque: initdb → arrancar → CREATE DATABASE → esquema → seed.
 * Siguientes: arrancar → servidor. La marca es la existencia de datos/cluster.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const APP = join(RAIZ, 'app');
const PGBIN = join(RAIZ, 'pgsql', 'bin');
const DATOS = join(RAIZ, 'datos');
const CLUSTER = join(DATOS, 'cluster');
const CONFIG = join(DATOS, 'config.json');
const LOG_PG = join(DATOS, 'postgres.log');

// Puerto alto y propio: no compite con un PostgreSQL que ya esté instalado en la
// máquina, que es exactamente lo que pasó en la de desarrollo con el 5432.
const PUERTO_DB = Number(process.env.POS_DB_PORT ?? 54330);
const PUERTO_APP = Number(process.env.PORT ?? 3000);
const PERFIL = process.env.POS_PERFIL ?? 'zona-oeste';

const log = (msg) => console.log(`  ${msg}`);
const titulo = (msg) => console.log(`\n${msg}`);

function correr(exe, args, opciones = {}) {
  const r = spawnSync(join(PGBIN, exe), args, { encoding: 'utf8', ...opciones });
  if (r.status !== 0) {
    throw new Error(`${exe} falló (código ${r.status}).\n${r.stderr || r.stdout || `Revisá ${LOG_PG}`}`);
  }
  return r.stdout;
}

/**
 * Igual que `correr`, pero SIN capturar la salida.
 *
 * `pg_ctl start` deja corriendo un `postgres.exe` que hereda los descriptores de
 * su padre. Con `stdio: 'pipe'`, spawnSync espera a que se cierren TODOS los
 * extremos de escritura del pipe — y el de postgres no se cierra nunca, porque
 * el servidor queda vivo. Resultado: pg_ctl termina bien, postgres queda
 * andando, y el lanzador se cuelga para siempre sin ningún error.
 *
 * La salida del servidor ya va a `datos/postgres.log` por el flag -l, así que no
 * se pierde nada al descartar los pipes.
 */
function correrSuelto(exe, args) {
  return correr(exe, args, { stdio: 'ignore' });
}

function leerConfig() {
  return JSON.parse(readFileSync(CONFIG, 'utf8'));
}

// --- 1. Preparar el cluster la primera vez ----------------------------------

const primerArranque = !existsSync(CLUSTER);

if (primerArranque) {
  titulo('Primera puesta en marcha. Esto tarda un minuto y pasa una sola vez.');
  mkdirSync(DATOS, { recursive: true });

  // Contraseña propia de esta instalación. No viaja en el instalador: se genera
  // acá, así dos sucursales nunca comparten credencial.
  const password = randomBytes(24).toString('base64url');
  const archivoPass = join(DATOS, '.pw');
  writeFileSync(archivoPass, password, 'utf8');

  log('creando la base de datos...');
  correr('initdb.exe', [
    '-D', CLUSTER,
    '-U', 'pos',
    '--auth-local=scram-sha-256',
    '--auth-host=scram-sha-256',
    '--pwfile', archivoPass,
    '--encoding=UTF8',
    '--locale=C',
  ]);
  rmSync(archivoPass, { force: true });

  writeFileSync(CONFIG, JSON.stringify({ password, puertoDb: PUERTO_DB, perfil: PERFIL }, null, 2), 'utf8');
}

// --- 2. Arrancar PostgreSQL --------------------------------------------------

const { password } = leerConfig();
const URL_ADMIN = `postgresql://pos:${encodeURIComponent(password)}@127.0.0.1:${PUERTO_DB}/postgres`;
const URL_POS = `postgresql://pos:${encodeURIComponent(password)}@127.0.0.1:${PUERTO_DB}/pos`;

titulo('Iniciando el sistema...');
log('base de datos...');

// Si la ventana se cerró de golpe (o se cortó la luz), PostgreSQL puede haber
// quedado corriendo: en Windows no hay forma confiable de correr el apagado
// ordenado cuando se cierra la consola. Arrancarlo de nuevo fallaría por puerto
// ocupado, así que primero se pregunta. `pg_ctl status` devuelve 0 si está vivo.
const yaCorriendo = spawnSync(join(PGBIN, 'pg_ctl.exe'), ['-D', CLUSTER, 'status'], { stdio: 'ignore' }).status === 0;

if (yaCorriendo) {
  log('(ya estaba en ejecución, se reutiliza)');
} else {
  correrSuelto('pg_ctl.exe', [
    '-D', CLUSTER,
    '-l', LOG_PG,
    // Solo localhost: la demo corre en esta máquina y no se expone a la red.
    '-o', `-p ${PUERTO_DB} -h 127.0.0.1`,
    '-w', // esperar a que acepte conexiones
    'start',
  ]);
}

let detenido = false;
function detenerTodo() {
  if (detenido) return;
  detenido = true;
  try {
    spawnSync(join(PGBIN, 'pg_ctl.exe'), ['-D', CLUSTER, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  } catch { /* si ya se cayó, no hay nada que hacer */ }
}
process.on('exit', detenerTodo);
for (const señal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(señal, () => { detenerTodo(); process.exit(0); });
}

// --- 3. Preparar el esquema y los datos la primera vez -----------------------

if (primerArranque) {
  // pathToFileURL, no la ruta pelada: en Windows `import('C:\...')` no falla con
  // un error claro, se queda colgado. Costó encontrarlo.
  const { PrismaClient } = await import(
    pathToFileURL(join(APP, 'node_modules/@prisma/client/default.js')).href
  );

  log('creando el esquema...');
  const admin = new PrismaClient({ datasources: { db: { url: URL_ADMIN } } });
  await admin.$executeRawUnsafe('CREATE DATABASE "pos"');
  await admin.$disconnect();

  const db = new PrismaClient({ datasources: { db: { url: URL_POS } } });
  const sql = readFileSync(join(RAIZ, 'esquema.sql'), 'utf8');
  // El esquema consolidado es DDL generado: sin funciones ni bloques DO, así que
  // separar por ';' es seguro. Se ejecuta sentencia por sentencia porque el
  // protocolo extendido de Prisma no acepta múltiples sentencias por consulta.
  const sentencias = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.split('\n').every((l) => l.trim().startsWith('--')));
  for (const sentencia of sentencias) await db.$executeRawUnsafe(sentencia);
  await db.$disconnect();

  log('cargando el catálogo y los datos de demostración...');
  const seed = spawnSync(process.execPath, [join(APP, 'seed.mjs')], {
    cwd: APP,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: URL_POS, POS_PERFIL: PERFIL },
  });
  if (seed.status !== 0) {
    throw new Error(`La carga de datos falló.\n${seed.stderr || seed.stdout}`);
  }
  log(seed.stdout.trim().split('\n').pop() ?? 'datos cargados');
}

// --- 4. Arrancar el servidor -------------------------------------------------

log('servidor...');
const servidor = spawn(process.execPath, [join(APP, 'server.mjs')], {
  cwd: APP,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: URL_POS,
    PORT: String(PUERTO_APP),
    POS_WEB_DIR: join(APP, 'web'),
  },
});

servidor.on('exit', (codigo) => {
  detenerTodo();
  process.exit(codigo ?? 0);
});

// --- 5. Abrir el navegador ---------------------------------------------------

const url = `http://127.0.0.1:${PUERTO_APP}`;
setTimeout(() => {
  titulo(`Sistema listo en ${url}`);
  console.log('  Para cerrar el sistema, cerrá esta ventana.\n');
  // POS_NO_ABRIR_NAVEGADOR: para probar la instalación sin interrumpir a quien
  // esté usando la máquina, y para cuando esto corra como servicio.
  if (!process.env.POS_NO_ABRIR_NAVEGADOR) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
}, 1500);
