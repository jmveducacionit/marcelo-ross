# Cómo correr el prototipo (Etapa 1 / Slice B)

Prototipo vertical funcionando: **Postgres embebido → Fastify (bus de eventos +
outbox + auditoría) → React (Vite + Tailwind + TanStack Query)**. Sin Docker.

> Pantalla de POS: buscar producto, ver la matriz **talle×color** con stock y
> precio, armar el ticket, elegir medio de pago, marcar **ajuste (entrega
> diferida)** y confirmar. Cada venta descuenta stock, encola el evento
> `VentaConfirmada` en el Outbox y deja auditoría — visible en el panel de
> actividad.

## Requisitos

- Node ≥ 20 (probado con Node 24). pnpm vía corepack.
- **No** necesitás Docker: la base es un Postgres **embebido** (`embedded-postgres`)
  que se levanta desde Node y persiste en `.dev-db/` (gitignored).

> Si `pnpm` no está en el PATH, usá `corepack pnpm@9.15.0 <cmd>` en lugar de `pnpm`,
> o habilitá corepack desde una terminal como administrador: `corepack enable`.

## Puesta en marcha

Necesitás **3 terminales** (la base y cada servidor quedan corriendo).

```bash
# 0) una sola vez: instalar dependencias
pnpm install

# 1) Terminal A — base de datos embebida (dejar corriendo)
pnpm dev:db
#    Levanta Postgres en localhost:54329 (usuario/clave pos/pos, base "pos").
#    La primera vez inicializa el cluster.

# 2) Terminal B — migrar + cargar datos ficticios (una sola vez, con la base arriba)
pnpm setup
#    = prisma migrate deploy && prisma db seed
#    Carga ~458 variantes, stock por sucursal, clientes y ventas de ejemplo.

# 3) Terminal B — API (dejar corriendo)
pnpm dev:server
#    Fastify en http://127.0.0.1:3000

# 4) Terminal C — front (dejar corriendo)
pnpm dev:web
#    Vite en http://127.0.0.1:5173  ← abrí esto en el navegador
```

Listo: abrí **http://127.0.0.1:5173**.

## Notas

- El puerto de la base es **54329** (no 5432) porque en la máquina de desarrollo
  el 5432 ya estaba ocupado. Se configura con `PGPORT` y en `DATABASE_URL` (`.env`).
- Para inspeccionar la base con una UI: `pnpm db:studio` (Prisma Studio).
- Para empezar de cero: borrá la carpeta `.dev-db/` y repetí desde el paso 1.
- El front habla con la API por el proxy de Vite (`/api` → `:3000`). En producción,
  ambos viven en el mini-PC de la sucursal (misma LAN).

## Qué demuestra (mapeo a la arquitectura)

| En pantalla | Concepto |
|---|---|
| Matriz de chips talle×color con stock | Producto padre/variante + escalas configurables ([ADR-0002](adr/0002-producto-padre-variante-escalas.md)) |
| Tag "consignación" en productos | Mercadería en consignación ([ADR-0006](adr/0006-mercaderia-en-consignacion.md)) |
| Precios y total en pesos | Dinero en centavos, formateo en el borde ([ADR-0003](adr/0003-representacion-monetaria-y-versionado-precios.md)) |
| "EFECTIVO, DEBITO" en una venta | Medios de pago mixtos |
| Checkbox "ajuste" → estado PENDIENTE_AJUSTE | Vendido ≠ entregado (entrega diferida) |
| Selector de sucursal / stock por sucursal | Multi-sucursal desde el modelo |
| Panel "Actividad" (evento + auditoría) | Outbox de eventos + auditoría transversal ([ADR-0001](adr/0001-offline-first-y-sincronizacion.md) / [ADR-0008](adr/0008-auditoria-transversal-y-uuidv7.md)) |

## Lo que todavía NO es real (pendiente, por diseño)

- **Auth**: el vendedor se elige de una lista fija; no hay login todavía (Etapa 8).
- **Facturación/CAE**: la venta encola el evento, pero la emisión ante ARCA no está
  integrada (Etapa 5). El comprobante quedaría `PENDIENTE`.
- **Descuentos, devoluciones, caja, transferencias**: contrato definido, aún sin UI.
- La sincronización entre sucursales y con el nodo central no está implementada.
