# Instalable de sucursal

Cómo se construye y qué contiene `SetupPOS-ZonaOeste.exe`, el instalador de una
sucursal aislada. Primer destino: **franquicia Zona Oeste** (demo comercial).

> **Alcance de esta versión: demostración.** Vende, controla stock, ficha de
> cliente y KPIs, con datos ficticios y **ticket no fiscal**. No emite
> comprobantes con CAE (Facturación es Etapa 5) ni tiene control de caja
> (Etapa 4). No sirve para operar un comercio: sirve para mostrarlo.

## Construir

```bash
node scripts/build-instalador.mjs
```

Requiere **Inno Setup 6** (`winget install JRSoftware.InnoSetup`). El script lo
busca también en `%LOCALAPPDATA%\Programs`, que es donde winget lo deja por
defecto — no en Archivos de programa.

Salida: `build/SetupPOS-ZonaOeste.exe` (~64 MB comprimido, ~300 MB instalado).

Para construir solo la aplicación sin empaquetar: `node scripts/build-app.mjs`
→ `build/app/`.

## Qué lleva adentro

| Pieza | Por qué |
|---|---|
| `node.exe` | El mini-PC de la sucursal no tiene Node. Es el binario con el que se construyó. |
| `app/server.mjs` | Servidor bundleado con esbuild, un solo archivo. |
| `app/seed.mjs` | Seed bundleado: en el paquete no hay `tsx` para correr el `.ts`. |
| `app/web/` | Front de Vite. **Lo sirve el propio servidor**, mismo puerto, sin Vite. |
| `app/node_modules/` | Solo Prisma y Argon2: binarios nativos y código generado, no bundleables. |
| `pgsql/` | PostgreSQL 18 embebido (initdb, pg_ctl, postgres). ~107 MB. |
| `esquema.sql` | Esquema consolidado con `prisma migrate diff`. Evita empaquetar el CLI de Prisma, que serían decenas de MB para usarlo una vez. |
| `iniciar.cmd` / `iniciar.mjs` | El lanzador. |

## Qué hace el lanzador

**Primer arranque** (tarda ~1 minuto): `initdb` → arrancar PostgreSQL →
`CREATE DATABASE` → aplicar `esquema.sql` → seed con `POS_PERFIL=zona-oeste` →
arrancar el servidor → abrir el navegador.

**Siguientes**: arrancar PostgreSQL → arrancar el servidor → abrir el navegador.
La marca de "ya inicializado" es la existencia de `datos/cluster`.

Cada instalación genera **su propia contraseña** de base de datos en el primer
arranque (`datos/config.json`). No viaja en el instalador: dos sucursales nunca
comparten credencial.

### Variables de entorno

| Variable | Default | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto de la aplicación. |
| `POS_DB_PORT` | `54330` | Puerto de PostgreSQL. Alto y propio para no competir con un PostgreSQL ya instalado. |
| `POS_PERFIL` | `zona-oeste` | Perfil de datos del primer arranque. |
| `POS_HOST` | `127.0.0.1` | `0.0.0.0` para varias cajas en la LAN de la sucursal. |
| `POS_NO_ABRIR_NAVEGADOR` | — | No abrir el navegador. Para pruebas y para correr como servicio. |

## Instalación

Se instala **sin privilegios de administrador**, en el perfil del usuario. No es
comodidad: la aplicación escribe su base de datos dentro del directorio de
instalación, y en `Archivos de programa` eso exigiría elevación en cada arranque.

El desinstalador **no borra `datos/`**: ahí quedan las ventas y el stock
cargados durante la demostración. Borrarlo sin avisar sería destructivo. Si se
quiere empezar de cero, se borra esa carpeta a mano.

## Trampas encontradas al construirlo

Tres cosas que costaron y que conviene no volver a pisar:

1. **`@node-rs/argon2` carga su `.node` por nombre de paquete de plataforma**, no
   por ruta relativa. El binario no viene dentro del paquete principal: hay que
   copiar `@node-rs/argon2-win32-x64-msvc` aparte. Sin eso el bundle arranca
   perfecto y **explota en el primer login**.

2. **`spawnSync` con `stdio: 'pipe'` no vuelve de `pg_ctl start`.** El
   `postgres.exe` que queda corriendo hereda los descriptores del padre y nunca
   cierra su extremo del pipe, así que `spawnSync` espera para siempre: pg_ctl
   termina bien, PostgreSQL queda andando, y el lanzador se cuelga **sin ningún
   error**. Se resuelve con `stdio: 'ignore'`; la salida del servidor ya va a
   `datos/postgres.log`.

3. **`await import()` con una ruta de Windows** (`C:\...`) en vez de una URL
   `file://` no falla con un mensaje claro. Va `pathToFileURL(...).href`.

Además, el lanzador tolera que PostgreSQL haya quedado huérfano: en Windows no
hay forma confiable de correr el apagado ordenado cuando se cierra la consola,
así que antes de arrancar pregunta con `pg_ctl status` y reutiliza el que esté
vivo.

## Verificado

Sobre una copia limpia del payload, sin nada preinstalado:

- primer arranque completo desde cero (initdb → esquema → seed → servidor);
- login real con Argon2 y sesión, con los usuarios de la franquicia;
- `/api/contexto` devolviendo **una sola** sucursal ("Sucursal Zona Oeste") con
  sus dos cajas;
- dashboard y stock respondiendo (435 variantes, 12 ventas de demo);
- la SPA y el fallback de rutas del front en el mismo puerto que la API;
- segundo arranque reutilizando la base, con los datos persistidos.

**No verificado todavía**: la instalación real vía `SetupPOS-ZonaOeste.exe` en
una máquina limpia. Se probó el payload, que es la parte con riesgo; falta
ejecutar el instalador de punta a punta.
