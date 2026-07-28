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

Falta todavía proveer `StockPort` (disponibilidad/reservar/descontar/reingresar)
a Ventas — ver "Fronteras pendientes".

## Fronteras pendientes

El módulo ya está materializado, pero **el lint de imports todavía no existe**
(paso 3 de ADR-0010), así que hay accesos directos a las tablas de stock desde
afuera que la frontera no impide:

- `services/ventas.ts` **escribe** `stockPorSucursal` y `movimientoStock` al
  confirmar una venta, en vez de pedírselo a este módulo. Es el cruce que más
  importa: el descuento de stock por venta no pasa por acá.
- `services/dashboard.ts` **lee** `stockPorSucursal` y `movimientoStock` para el
  KPI de stock inmovilizado.
- `services/catalogo.ts` lee variantes con su stock para la búsqueda de productos.

Toda escritura de stock sí pasa por `operacionDeDominio`, así que la auditoría
está garantizada (ADR-0010) aunque la frontera de módulo no lo esté.

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
