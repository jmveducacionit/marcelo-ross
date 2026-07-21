# @pos/contracts

**Puertos** (interfaces públicas) para la comunicación **sincrónica** entre
módulos, cuando un evento de dominio no alcanza porque se necesita consistencia
inmediata (ej. Ventas necesita reservar stock y saber ya si hay disponibilidad).

- **Estado**: contrato definido (sin implementación — Fase 1).

## Por qué existe

Las reglas de arquitectura prohíben que un módulo importe los internals de otro
([`docs/arquitectura.md`](../../docs/arquitectura.md) §1). Cuando A necesita algo de
B de forma sincrónica, A depende de una **interfaz declarada acá**, y B provee la
implementación. Así se evita el acoplamiento y las dependencias circulares.

## Puertos definidos

- `StockPort` — reservar/descontar/consultar disponibilidad (usado por Ventas).
- `CajaPort` — registrar cobros/movimientos en la caja abierta (usado por Ventas).
- `ClientesPort` — leer datos fiscales, usar/generar crédito a favor (Ventas/Facturación).
- `FacturacionArcaPort` — emitir comprobante y obtener CAE vía intermediario
  (usado por Facturación; aísla al proveedor ARCA, ver
  [ADR-0005](../../docs/adr/0005-integracion-arca.md)).
- `EventBusPort` — publicar/suscribir eventos de dominio con outbox (transversal).
- `AuditoriaPort` — registrar rastro de operaciones de dinero/stock (transversal,
  ver [ADR-0008](../../docs/adr/0008-auditoria-transversal-y-uuidv7.md)).

Regla: un puerto describe **qué** necesita el consumidor, no **cómo** lo hace el
proveedor. El consumidor es dueño de la forma del puerto.
