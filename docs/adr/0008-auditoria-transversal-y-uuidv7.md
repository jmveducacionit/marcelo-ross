# ADR-0008: Auditoría transversal e IDs UUIDv7

- **Estado**: Aceptado
- **Fecha**: 2026-07-21
- **Decisores**: Arquitecto técnico, dueño

## Contexto

Dos preocupaciones transversales a resolver una sola vez:

1. **Auditoría**: toda operación con impacto en **dinero o stock** debe dejar
   rastro — quién, cuándo, qué cambió, desde qué caja y sucursal. Es un requisito
   explícito y debe diseñarse como preocupación transversal, no por módulo.
2. **Identidad de entidades**: se necesitan IDs que **no colisionen entre
   sucursales offline** (no puede haber autoincremental) y que además sean amables
   con los índices de PostgreSQL.

## Opciones consideradas

Auditoría:
1. **Cada módulo audita a su manera** — inconsistente, se olvida, difícil de
   reportar. Descartada.
2. **Interceptor/decorador transversal en `shared/`** (elegida) — un único
   registro append-only alimentado por todas las operaciones de dinero/stock.
3. Triggers de base de datos — opción de refuerzo, pero se pierde el contexto de
   aplicación (usuario, caja). Se puede sumar como red de seguridad, no como
   mecanismo principal.

IDs:
1. **Autoincremental** — descartado: colisiona entre nodos offline.
2. **UUIDv4** — sin colisión, pero **aleatorio** → mala localidad en índices B-tree
   (fragmentación, inserciones dispersas).
3. **UUIDv7** (elegida) — time-ordered: sin colisión **y** con buena localidad de
   índice (se inserta casi al final, como un secuencial).

## Decisión

- **Auditoría**: tabla `RegistroAuditoria` **append-only** con `{entidad,
  entidadId, accion, antes(json), despues(json), usuarioId, cajaId?, sucursalId,
  ocurridoEn}`. Se completa desde una capa transversal en `shared/` que envuelve
  las operaciones de dominio con impacto en dinero/stock. El contexto (usuario,
  caja, sucursal) viaja en el "request context" de cada operación. Nunca se
  actualiza ni borra: solo se agrega.
- **IDs**: **UUIDv7** generados en la aplicación para todas las entidades. Tipo
  `Uuid` en TS. Esto habilita el modelo offline-first (ver
  [ADR-0001](0001-offline-first-y-sincronizacion.md)) sin colisiones y mantiene los
  índices sanos.
- El **Outbox** de eventos usa el mismo `eventId` UUIDv7, que además sirve para la
  **deduplicación idempotente** en los consumidores y en la sincronización.

## Consecuencias

- **Se gana:** trazabilidad uniforme y completa de dinero/stock lista para
  reportes y control; IDs seguros entre sucursales; buen rendimiento de índices;
  idempotencia natural por `eventId`.
- **Se pierde / se acepta:** la tabla de auditoría crece (se define retención /
  archivado en su momento); UUID ocupa más que un `int` y es menos legible que un
  secuencial (se acepta por los beneficios). Hay que asegurar que **toda** ruta de
  escritura de dinero/stock pase por la capa transversal (se cubre con revisión y
  tests).
- **Seguimiento:** evaluar particionado/archivado de `RegistroAuditoria` y del
  `Outbox` cuando el volumen histórico lo pida.
