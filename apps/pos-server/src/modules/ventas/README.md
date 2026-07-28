# Módulo: Ventas

- **Estado**: **parcial** — ticket, medios de pago mixtos y venta con ajuste
  (`PENDIENTE_AJUSTE`) implementados. Faltan motor de descuentos, devoluciones,
  cambios y anulación.
- **Dónde está el código**: `apps/pos-server/src/services/ventas.ts` — **no** en
  este directorio. El `index.ts` de al lado es un stub de contrato de la Fase 1 y
  no refleja lo implementado (divergencia conocida respecto de ADR-0007).
- **Etapa de implementación**: 3 (ver [roadmap](../../../../../docs/roadmap.md))

## Responsabilidad

Ticket y carrito; motor de descuentos (auditable a nivel línea); medios de pago
**mixtos** en un mismo ticket; cambios y devoluciones; **venta con entrega
diferida** por ajustes de prenda (distingue `vendido` de `entregado`).

No emite comprobantes fiscales (eso es Facturación) ni maneja el CAE. Al confirmar,
la emisión fiscal queda `PENDIENTE` vía el puerto de Facturación.

## API pública (`index.ts`)

- `confirmarVenta(...)`, `registrarDevolucion(...)`, `entregarPrenda(...)`,
  `anularVenta(...)` (formas en `index.ts`).

## Depende de (por puerto/contrato, no import directo)

- `StockPort` (reservar/descontar), `CajaPort` (cobros), `ClientesPort`
  (crédito a favor, datos fiscales), `EventBusPort`, `AuditoriaPort`.

## Eventos

- **Emite**: `VentaConfirmada`, `DevolucionRegistrada`, `PrendaEntregada`.
- **Consume**: `CAEObtenido` / `CAERechazado` (para reflejar estado fiscal del ticket).

## Notas de dominio

- Precio de línea = **snapshot** al vender (no FK al precio vigente). Ver
  [ADR-0003](../../../../../docs/adr/0003-representacion-monetaria-y-versionado-precios.md).
- Descuentos por línea y por ticket, cada aplicación con su monto en `Money` y
  autoría. Ver [ADR-0004](../../../../../docs/adr/0004-motor-de-descuentos.md).
