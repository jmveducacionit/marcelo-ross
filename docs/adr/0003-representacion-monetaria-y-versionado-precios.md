# ADR-0003: Representación monetaria y versionado de precios

- **Estado**: Aceptado
- **Fecha**: 2026-07-21
- **Decisores**: Arquitecto técnico, dueño

## Contexto

Reglas del proyecto: **el dinero nunca se representa con coma flotante**. Además,
en Argentina los precios se actualizan seguido (inflación), así que el precio debe
estar **versionado** y el ticket debe guardar el **precio al momento de la venta**,
no una referencia al precio actual.

## Opciones consideradas

Representación del dinero:
1. **`number` (float64)** — descartada: errores de redondeo, inaceptable para dinero.
2. **Decimal (Postgres `NUMERIC`, Prisma `Decimal`)** — exacto, pero arrastra una
   librería decimal en toda operación en JS y es más fácil equivocarse mezclando
   con `number`.
3. **Enteros en la mínima unidad (centavos), `BigInt`** (elegida) — exacto,
   aritmética entera trivial, imposible mezclar accidentalmente con floats.

Versionado de precios:
1. **Un solo campo `precio` que se pisa** — descartada: se pierde el histórico y
   los tickets viejos quedarían mal si se recalcularan.
2. **Historial de precios + snapshot en la línea de venta** (elegida).

## Decisión

- **Canónico: enteros en centavos de ARS.** En DB `BigInt` (Postgres `BIGINT`); en
  TS un tipo `Money` (bigint, idealmente *branded* para evitar mezclarlo con otros
  números). El formateo a "$" ocurre **solo en presentación**.
- **Convención única** (documentada también en `CLAUDE.md` §4.1): toda cantidad de
  dinero — precios, costos, descuentos, pagos, saldos, comisiones — es `Money`.
- **Precios versionados**: tabla `PrecioVariante {variante, precio, vigenteDesde,
  vigenteHasta?, motivo}`. Cambiar un precio = **insertar una fila nueva**, nunca
  actualizar. El vigente es el de mayor `vigenteDesde` sin `vigenteHasta`.
- **Snapshot en el ticket**: `LineaVenta.precioUnitario` es una **copia** del
  precio vigente al momento de vender. El ticket es reproducible aunque el precio
  cambie después. Lo mismo aplica a descuentos aplicados (se guarda el monto en
  `Money`, no una fórmula que recalcule).
- **Redondeo**: las operaciones intermedias (ej. porcentajes de descuento, IVA)
  se calculan y se **redondean a centavos** con una regla única y documentada
  (redondeo bancario / half-up a definir en implementación), guardando el
  resultado entero. Nunca se propagan fracciones de centavo.

## Consecuencias

- **Se gana:** exactitud garantizada; tickets históricos fieles; auditoría de
  cambios de precio; robustez ante inflación.
- **Se pierde / se acepta:** hay que formatear/parsear en los bordes (UI, ARCA,
  importaciones); `BigInt` requiere cuidado en serialización JSON (se serializa
  como string en las APIs). El versionado agrega filas, pero son baratas.
- **Seguimiento:** si se operara en otra moneda (importaciones), se agrega
  `moneda` al tipo `Money`; hoy es ARS implícito.
