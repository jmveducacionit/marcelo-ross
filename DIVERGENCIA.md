# Qué difiere entre el instalable y la nube

Este archivo se lee desde el repo del **instalable**. Hay uno espejo en el repo
de la nube.

Todo lo que **no** está en esta lista es código compartido y debería ser
idéntico en los dos repos. Si tocás algo compartido, tocalo en los dos.

## Archivos que existen solo en el INSTALABLE (acá)

| Archivo | Para qué |
|---|---|
| `instalador/` | Lanzador y script de Inno Setup |
| `scripts/build-app.mjs` | Bundle del servidor + front |
| `scripts/build-instalador.mjs` | Arma el `SetupPOS-*.exe` |
| `scripts/dev-db.mjs` | Postgres embebido para desarrollo |
| `docs/instalable.md` | Cómo se construye y qué lleva adentro |
| `docker-compose.yml` | Referencia para el despliegue en sucursal |

## Archivos que existen solo en la NUBE

`render.yaml`, `netlify.toml`.

## Diferencias dentro de archivos compartidos

Son cuatro, y todas tienen su comentario explicándolas en el código del repo de
la nube:

1. **`prisma/schema.prisma`** — la nube agrega `directUrl` al `datasource`. El
   pooler de Supabase (6543) no soporta las sentencias de migración; la conexión
   directa (5432) se usa solo en el build. Acá no hace falta: la base es local.

2. **`apps/pos-server/src/main.ts`** — en la nube, CORS toma el origen de
   `POS_ORIGEN_WEB` y la cookie de sesión va `secure` con `NODE_ENV=production`.
   Acá la cookie NO va `secure` porque en la LAN de la sucursal es HTTP.
   **Las dos versiones mantienen `SameSite=Lax`** (ADR-0009): acá porque un solo
   proceso sirve API y front, allá por el proxy de Netlify.

3. **`apps/pos-server/src/main.ts`** — acá el bloque de `@fastify/static` SÍ se
   activa: el servidor empaquetado sirve la SPA en el mismo puerto que la API,
   que es lo que permite dejar un único servicio corriendo en el mini-PC.

4. **`package.json`** — acá está `embedded-postgres` y los scripts del
   instalable (`dev:db`, `setup`, `build:app`, `build:instalador`); allá están
   `deploy:migrate` y `start:server`.

## Lo que NO difiere y no debería

El esquema (salvo el `datasource`), los ocho módulos, `core-domain`,
`contracts`, el seed, el front entero y los tests. **43 tests** tienen que pasar
igual en los dos repos: si pasan acá y fallan allá, algo divergió.
