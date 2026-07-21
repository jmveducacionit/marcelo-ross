# ADR-0004: Motor de descuentos auditable a nivel línea

- **Estado**: Aceptado
- **Fecha**: 2026-07-21
- **Decisores**: Arquitecto técnico, dueño

## Contexto

Los descuentos son frecuentes y variados: **porcentaje, monto fijo, combo (2x1,
3x2), liquidación de temporada, descuento de empleado, promoción bancaria con
reintegro**. Deben ser **auditables a nivel línea de ticket**: hay que poder decir,
para cada línea, qué descuento se aplicó, cuánto dinero representó y quién lo
autorizó (algunos requieren autorización de encargado).

## Opciones consideradas

1. **Descuento como un solo campo `%` en la venta** — insuficiente: no soporta
   combos, ni descuentos por línea, ni auditoría, ni apilar promociones.
2. **Motor de reglas genérico tipo "rules engine" configurable con DSL** — potente
   pero sobre-diseñado para el catálogo acotado de descuentos de este comercio.
3. **Catálogo tipado de descuentos + registro de aplicación por línea/venta**
   (elegida) — un conjunto cerrado de **tipos** de descuento con sus reglas, y cada
   aplicación se materializa con su **monto en `Money`** y su autoría.

## Decisión

- **`Descuento` (definición)**: `{tipo, reglas(json), vigenciaDesde/Hasta,
  requiereAutorizacion}` con `tipo ∈ {PORCENTAJE, MONTO_FIJO, COMBO, LIQUIDACION,
  EMPLEADO, PROMO_BANCARIA}`. Las `reglas` guardan los parámetros propios del tipo
  (ej. combo: "3x2 sobre categoría denim"; promo bancaria: "% reintegro, tope").
- **`DescuentoAplicado`**: `{lineaVentaId? | ventaId?, descuentoId, tipo,
  montoDescontado(Money), autorizadoPor?}`. Cada descuento aplicado deja registro
  con el **monto exacto en dinero** (snapshot, no fórmula) y quién autorizó.
  - Descuentos por línea (ej. liquidación de una prenda) → `lineaVentaId`.
  - Descuentos de nivel ticket (ej. promo bancaria por medio de pago) → `ventaId`,
    prorrateados a las líneas para el cálculo de márgenes.
- **Orden de aplicación** determinístico y documentado (ej. primero por línea,
  después de nivel ticket) para que el total sea reproducible.
- **Reintegro bancario**: se modela como descuento que **no** baja el precio de
  venta cobrado en el ticket sino el costo financiero/beneficio — se registra para
  reporting y conciliación, distinguiéndolo de una rebaja de precio directa.
- El motor vive **dentro del módulo Ventas** (calcula), pero las **definiciones**
  de descuento son datos (editables por Admin/Encargado según permiso).

## Consecuencias

- **Se gana:** auditoría real a nivel línea (qué, cuánto, quién autorizó);
  soporta todos los tipos actuales; márgenes correctos por prorrateo; tickets
  reproducibles.
- **Se pierde / se acepta:** agregar un tipo de descuento radicalmente nuevo puede
  requerir código (no es un DSL abierto) — trade-off deliberado a favor de la
  simplicidad. La lógica de combos exige tests cuidadosos.
- **Seguimiento:** si el catálogo de promociones se vuelve muy dinámico, se evalúa
  mover `reglas` a algo más declarativo; hoy no se justifica.
