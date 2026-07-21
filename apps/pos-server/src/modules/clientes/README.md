# Módulo: Clientes

- **Estado**: pendiente
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
