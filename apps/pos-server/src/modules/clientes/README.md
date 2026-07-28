# Módulo: Clientes

- **Estado**: **parcial** — ficha e historial de compras implementados. Faltan
  talles habituales, crédito a favor, fidelización y datos fiscales para Factura A.
- **Dónde está el código**: `apps/pos-server/src/services/clientes.ts` — **no** en
  este directorio. El `index.ts` de al lado es un stub de contrato de la Fase 1
  (divergencia conocida respecto de ADR-0007).
- **Etapa de implementación**: 6 (contrato mínimo usado antes por Ventas/Facturación)

## Responsabilidad

Ficha del cliente; historial de compras (incluye **talles habituales** por
categoría); **crédito a favor** (por devoluciones); fidelización; **datos fiscales**
para Factura A.

## API pública (`index.ts`)

- Provee `ClientesPort` (datos fiscales, saldo/uso/generación de crédito) a
  Ventas y Facturación.
- Gestión de ficha, talles habituales, historial, fidelización.

## Depende de

- `EventBusPort`, `AuditoriaPort`.

## Eventos

- **Emite**: `CreditoClienteGenerado`.
- **Consume**: `VentaConfirmada` (historial, talles habituales),
  `DevolucionRegistrada` (crédito a favor).

## Notas

- El crédito a favor es `Money`. Datos fiscales habilitan Factura A (CUIT, razón
  social, condición IVA, domicilio fiscal).
