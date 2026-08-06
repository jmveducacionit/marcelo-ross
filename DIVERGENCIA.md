# Qué difiere entre la nube y el instalable

Este archivo se lee desde el repo de la **nube**. Hay uno espejo en el repo
del instalable.

Todo lo que **no** está en esta lista es código compartido y debería ser
idéntico en los dos repos. Si tocás algo compartido, tocalo en los dos.

## Archivos que existen solo en la NUBE (acá)

| Archivo | Para qué |
|---|---|
| `render.yaml` | Despliegue del servidor en Render |
| `netlify.toml` | Build del front y **proxy `/api/*` hacia Render** |
| `ORIGEN.md`, `DIVERGENCIA.md` | Trazabilidad de la separación |
| `scripts/sincronizar.mjs` | Traer lo compartido desde el otro repo |

## Archivos que existen solo en el INSTALABLE

`instalador/`, `scripts/build-app.mjs`, `scripts/build-instalador.mjs`,
`scripts/dev-db.mjs`, `docs/instalable.md`, `docker-compose.yml`.

## Diferencias dentro de archivos compartidos

Son cuatro, y todas tienen su comentario explicándolas en el código:

1. **`prisma/schema.prisma`** — el `datasource` agrega `directUrl`. El pooler de
   Supabase (6543) no soporta las sentencias de migración; la conexión directa
   (5432) se usa solo en el build.

2. **`apps/pos-server/src/main.ts`** — CORS toma el origen de `POS_ORIGEN_WEB`,
   y la cookie de sesión va `secure` cuando `NODE_ENV=production`.
   **Se mantiene `SameSite=Lax`** gracias al proxy de Netlify: sin él habría que
   pasar a `None` y sumar un token CSRF, debilitando ADR-0009.

3. **`apps/pos-server/src/main.ts`** — el bloque que sirve el front estático
   queda inerte: acá lo sirve Netlify.

4. **`package.json`** — sin `embedded-postgres` (107 MB inútiles en la nube) y
   sin los scripts del instalable; con `deploy:migrate` y `start:server`.

## Lo que NO difiere y no debería

El esquema (salvo el `datasource`), los ocho módulos, `core-domain`,
`contracts`, el seed, el front entero y los tests. **43 tests** tienen que pasar
igual en los dos repos: si pasan acá y fallan allá, algo divergió.
