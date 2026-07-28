# Módulo: Stock

- **Estado**: **parcial** — matriz talle×color con stock y precio, e ingreso,
  ajuste y transferencia implementados. Faltan generación de códigos de barras,
  ingreso por remito, recepción de transferencia separada del envío, inventario
  físico y alertas de reposición.
- **Estructura**: primer módulo **materializado** según ADR-0007 (paso 2 de
  ADR-0010). El código vive acá:
  - `index.ts` — API pública tipada. **Única superficie del módulo.**
  - `consultas.ts` — lectura (listado, matriz talle×color). Privado.
  - `movimientos.ts` — escritura (ingreso, ajuste, transferencia). Privado.
- **Etapa de implementación**: 2 (primero — Ventas no descuenta lo que no existe)

## Responsabilidad

Variantes talle/color con **escalas configurables por categoría**; **códigos de
barras propios**; ingresos por remito; ajustes; **transferencias entre sucursales**
(envío + recepción separados); inventario físico; **mercadería en consignación**
(no propia hasta venderse); alertas de reposición. El stock se lleva **siempre a
nivel variante y por sucursal**, nunca al producto padre.

## API pública (`index.ts`)

Se exporta el objeto `stock`, tipado por la interfaz `StockApi`:

| Operación | Qué hace |
|---|---|
| `listado(sucursalId, search)` | productos con su stock total en la sucursal |
| `detalle(productoId, sucursalId)` | matriz talle×color; `null` si no existe |
| `ingresar(varianteId, sucursalId, cantidad, ctx)` | suma unidades → `StockIngresado` |
| `ajustar(varianteId, sucursalId, nuevaCantidad, ctx)` | fija al valor contado → `StockIngresado`/`StockDescontado` |
| `transferir(varianteId, origenId, destinoId, cantidad, ctx)` | → `TransferenciaEnviada` + `TransferenciaRecibida` |

Las operaciones pendientes (`ingresarPorRemito`, `recibirTransferencia`,
`tomarInventario`, `generarCodigoBarras`, alta de producto/variante) **no se
declaran** hasta implementarse: una firma que no hace nada desinforma.

### Puerto transaccional (módulo a módulo)

`descontarPorVenta(tx, reg, input)` — descuenta stock por una venta **dentro de la
transacción del llamador**. Es la única operación que no abre su propia
transacción: vender y descontar tienen que ser un solo commit, así que Ventas pasa
su `tx` y su `reg`. Stock sigue siendo el dueño de la escritura — acá se tocan las
tablas, se emite `StockDescontado` (con `esConsignacion`, que Proveedores necesita
para el cargo de ADR-0006) y se deja la auditoría.

**No valida disponibilidad**: hoy una venta puede dejar el stock en negativo. Es el
comportamiento previo, conservado a propósito; cambiarlo es una decisión de negocio
(¿se bloquea la venta o se permite y se avisa?), no de refactor.

## Fronteras pendientes

El lint de imports todavía no existe (paso 3 de ADR-0010), así que quedan accesos
directos a las tablas de stock que la frontera no impide. Los dos que quedan son
**lecturas**, no comprometen consistencia:

- `services/dashboard.ts` lee `stockPorSucursal` y `movimientoStock` para el KPI de
  stock inmovilizado. (De fondo, Dashboard debería proyectar eventos — Etapa 9.)
- `services/catalogo.ts` lee variantes con su stock para la búsqueda de productos.

La escritura desde Ventas **ya se resolvió**: pasa por `descontarPorVenta`.

Toda escritura de stock pasa por `operacionDeDominio`, así que la auditoría está
garantizada (ADR-0010) aunque la frontera de módulo no lo esté todavía.

## Depende de

- `EventBusPort`, `AuditoriaPort`. (Recepción de mercadería la dispara Proveedores.)

## Eventos

- **Emite**: `StockIngresado`, `StockDescontado`, `TransferenciaEnviada`,
  `TransferenciaRecibida`.
- **Consume**: `VentaConfirmada`/`DevolucionRegistrada` (si el descuento/reingreso
  se hace por evento), `PrendaEntregada`.

## Notas de dominio

- Escalas heterogéneas: ver [ADR-0002](../../../../../docs/adr/0002-producto-padre-variante-escalas.md).
- Consignación: marca `esConsignacion` + cargo al vender. Ver
  [ADR-0006](../../../../../docs/adr/0006-mercaderia-en-consignacion.md).
