# Módulo: Stock

- **Estado**: **parcial** — matriz talle×color con stock y precio, e ingreso,
  ajuste y transferencia implementados. Faltan generación de códigos de barras,
  inventario físico, recepción de transferencia y alertas de reposición.
- **Dónde está el código**: `apps/pos-server/src/services/stock.ts` y
  `stockMov.ts` — **no** en este directorio. El `index.ts` de al lado es un stub
  de contrato de la Fase 1 (divergencia conocida respecto de ADR-0007).
- **Etapa de implementación**: 2 (primero — Ventas no descuenta lo que no existe)

## Responsabilidad

Variantes talle/color con **escalas configurables por categoría**; **códigos de
barras propios**; ingresos por remito; ajustes; **transferencias entre sucursales**
(envío + recepción separados); inventario físico; **mercadería en consignación**
(no propia hasta venderse); alertas de reposición. El stock se lleva **siempre a
nivel variante y por sucursal**, nunca al producto padre.

## API pública (`index.ts`)

- Provee `StockPort` (disponibilidad/reservar/descontar/reingresar) a Ventas.
- `ingresarPorRemito(...)`, `ajustar(...)`, `transferir(...)`, `recibirTransferencia(...)`,
  `tomarInventario(...)`, `generarCodigoBarras(...)`, alta de producto/variante.

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
