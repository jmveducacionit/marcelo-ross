# POS Marcelo Ross — versión en la nube

Despliegue del POS como **vitrina**: se muestra sin instalar nada.
Front en **Netlify**, servidor en **Render**, base en **Supabase**.

> **Esto no es el producto.** El producto es la instalación local
> offline-first: la venta no se frena por falta de internet y cada sucursal es
> dueña de su stock (ADR-0001). Esta versión contradice ese diseño a propósito,
> para poder mostrar el sistema desde un link. Ver `ORIGEN.md`.

## Por qué el servidor no va en Netlify Functions

`pos-server` es un proceso Fastify **con estado**: tiene un bus de eventos
in-process y workers que empujan la cola de CAE. Las funciones serverless son
efímeras —se despiertan, responden y mueren—, así que los listeners no
sobreviven y la cola no la procesaría nadie. Por eso hace falta un host siempre
encendido, y de ahí Render.

## Puesta en marcha

### 1. Supabase

Crear el proyecto y anotar las dos cadenas de conexión:

- **Pooler** (puerto `6543`, con `?pgbouncer=true&connection_limit=1`) → `DATABASE_URL`
- **Directa** (puerto `5432`) → `DIRECT_URL`

Las dos hacen falta: el pooler para el runtime, la directa para las migraciones
(el pooler en modo transacción no soporta las sentencias que emite Prisma).

### 2. Render

Importar este repo. `render.yaml` ya define el servicio. Cargar como variables
de entorno: `DATABASE_URL`, `DIRECT_URL` y `POS_ORIGEN_WEB`.

El build corre `prisma migrate deploy`. Para cargar los datos de demostración,
una vez:

```bash
pnpm db:seed
```

### 3. Netlify

Importar este repo. En `netlify.toml`, reemplazar `POS_API_URL` por la URL real
del servicio de Render.

**Ese proxy no es opcional.** Hace que el navegador vea front y API en el mismo
origen, y por eso la cookie de sesión puede seguir siendo `SameSite=Lax` —la
protección CSRF que ADR-0009 obtuvo gratis—. Sin el proxy habría que pasar a
`SameSite=None` y sumar un token CSRF.

## Limitaciones conocidas

- **El plan free de Render duerme** tras 15 minutos sin tráfico. El primer
  request después tarda ~30 s. Para una vitrina alcanza; para operar, no.
- Los **CAE son simulados** (ADR-0005): no valen ante ARCA.
- Los datos son **ficticios** y cualquiera con el link puede modificarlos.
- No hay sincronización entre sucursales: acá hay una sola base.

## Desarrollo local

Igual que el repo de origen, pero **sin Postgres embebido**: apuntá
`DATABASE_URL` a un Postgres propio o a Supabase.

```bash
pnpm install
pnpm db:deploy && pnpm db:seed
pnpm dev:server   # :3000
pnpm dev:web      # :5173
pnpm test         # 43 tests
```

## Relación con el repo del instalable

Ver `ORIGEN.md` y `DIVERGENCIA.md`. Antes de tocar código de dominio, leelos:
los dos repos comparten casi todo y **un arreglo acá no llega al otro solo**.
