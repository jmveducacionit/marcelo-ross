# shared — preocupaciones transversales

Infraestructura común de la que dependen los módulos (nunca al revés). Fase 1:
andamiaje.

## Contenido previsto

- **auditoria/** — registro append-only de operaciones de dinero/stock
  (`AuditoriaPort`). Ver [ADR-0008](../../../../docs/adr/0008-auditoria-transversal-y-uuidv7.md).
- **eventos/** — bus de eventos in-process + **outbox** transaccional
  (`EventBusPort`). Entrega at-least-once; consumidores idempotentes por `eventId`.
- **sync/** — cliente de sincronización con el nodo central y la otra sucursal
  (push/pull del outbox). Ver [ADR-0001](../../../../docs/adr/0001-offline-first-y-sincronizacion.md).
- **db/** — acceso a PostgreSQL vía Prisma; helpers de transacción (negocio +
  outbox + auditoría en la misma transacción).
- **money/**, **ids/** — reexportan/aplican los tipos de `@pos/core-domain`.
- **permisos/** — guardas de autorización según rol de Empleados.
- **context/** — `OperacionContext` (usuario, sucursal, caja) por request.
