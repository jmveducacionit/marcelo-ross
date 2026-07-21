# Módulo: Proveedores

- **Estado**: pendiente
- **Etapa de implementación**: 7

## Responsabilidad

Alta de proveedores y **marcas**; **órdenes de compra por temporada**; recepción de
mercadería contra remito (genera ingreso de stock); **cuenta corriente**; costos y
**actualización de precios** (versionada); **liquidación de consignación**.

## API pública (`index.ts`)

- `altaProveedor(...)`, `altaMarca(...)`, `crearOrdenCompra(...)`,
  `recibirMercaderia(remito)`, `actualizarPrecios(...)`, `liquidarConsignacion(...)`,
  cuenta corriente.

## Depende de

- Stock (para ingresar mercadería recibida), `EventBusPort`, `AuditoriaPort`.

## Eventos

- **Emite**: dispara `StockIngresado` (vía Stock) al recibir mercadería.
- **Consume**: `StockDescontado` de variantes en **consignación** (acumula cargos
  para la liquidación).

## Notas

- Actualización de precio = **nueva versión** de `PrecioVariante`, no pisa el
  anterior. Ver [ADR-0003](../../../../../docs/adr/0003-representacion-monetaria-y-versionado-precios.md).
- Márgenes por marca entre 55% y 130% de markup. Liquidación de consignación a
  partir de ventas reales. Ver [ADR-0006](../../../../../docs/adr/0006-mercaderia-en-consignacion.md).
