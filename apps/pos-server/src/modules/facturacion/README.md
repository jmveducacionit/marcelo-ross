# Módulo: Facturación

- **Estado**: pendiente
- **Etapa de implementación**: 5

## Responsabilidad

Comprobantes fiscales electrónicos ante **ARCA** (vía **intermediario**): Facturas
A/B, notas de crédito y débito; gestión del **CAE** con cola de reintentos
(offline-first); **múltiples puntos de venta** (uno por sucursal); **libro IVA
ventas** exportable para el contador.

## API pública (`index.ts`)

- `emitirComprobante(...)`, `emitirNotaCredito(...)`, `reintentarCae(...)`,
  `exportarLibroIva(periodo)`.
- Consume `FacturacionArcaPort` (adaptador al intermediario; aísla al proveedor).

## Depende de

- `FacturacionArcaPort` (externo), `ClientesPort` (datos fiscales Factura A),
  `EventBusPort`, `AuditoriaPort`.

## Eventos

- **Emite**: `ComprobanteEmitido`, `CAEObtenido`, `CAERechazado`.
- **Consume**: `VentaConfirmada` (encolar emisión), `DevolucionRegistrada`
  (nota de crédito).

## Notas

- **Offline-first**: la venta cierra con ticket no fiscal; el comprobante con CAE
  se encola y se emite al recuperar conexión. Ver
  [ADR-0005](../../../../../docs/adr/0005-integracion-arca.md) y
  [ADR-0001](../../../../../docs/adr/0001-offline-first-y-sincronizacion.md).
- Impresora Epson TM-T20III **no fiscal** → comprobante = factura electrónica
  (PDF/ticket 80mm con CAE + QR de ARCA).
