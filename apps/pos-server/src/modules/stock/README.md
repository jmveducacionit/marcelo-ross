# Módulo: Stock

- **Estado**: pendiente
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
