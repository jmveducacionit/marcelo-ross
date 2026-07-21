# Roadmap de implementación

> Implementación **incremental**. La arquitectura ya contempla los 8 módulos
> (contratos + esquema conceptual); lo que se hace por etapas es la
> implementación real y las migraciones. Ningún módulo se reescribe cuando llega
> el siguiente: los que aún no existen están como **contrato definido**.

## Principios de ordenamiento

1. **De adentro hacia afuera del dinero/stock.** Primero lo que da valor y datos
   (poder registrar productos, stock y una venta), después lo fiscal y analítico.
2. **Cada módulo se apoya en contratos, no en implementaciones ajenas.** Ventas
   puede confirmar una venta contra el *contrato* de Facturación aunque el CAE
   real todavía no esté integrado (el comprobante queda `PENDIENTE`).
3. **Dashboard último**: consume eventos de todos; sin ellos no tiene qué mostrar.

## Etapa 0 — Andamiaje (ESTA FASE, Fase 1) ✅

Documentación + estructura + contratos + esquema conceptual. Sin código de app.

**Terminado cuando:** existen `CLAUDE.md`, `docs/` (arquitectura, modelo-datos,
roadmap, ADRs), estructura de directorios con README por módulo, `packages/
core-domain` con el catálogo de eventos como contrato, `packages/contracts` con
los puertos, y `prisma/schema.prisma` conceptual comentado.

## Etapa 1 — Fundaciones técnicas

Monorepo operativo: Fastify arriba, Prisma conectado, bus de eventos + outbox,
tipo `Money`, generador UUIDv7, auditoría transversal, autenticación básica y
**seed de datos ficticios** (marcas, categorías, escalas de talle, productos,
variantes, stock, clientes, algunas ventas). Docker Compose levanta DB.

**Terminado cuando:** `pnpm dev` levanta server + web; `pnpm db:seed` carga datos
ficticios coherentes; el bus publica un evento de prueba end-to-end con auditoría.

## Etapa 2 — Stock (Módulo 2)

Se implementa **primero** porque Ventas no puede descontar lo que no existe.
Variantes con escalas configurables, códigos de barras propios, ingresos,
ajustes, transferencias, inventario, consignación (marca de propiedad), alertas.

**Depende de:** Etapa 1. **Terminado cuando:** se puede dar de alta un producto
padre con su matriz talle×color, generar códigos de barras, ingresar stock por
remito, transferir entre sucursales (envío + recepción) y ver stock por variante
y sucursal; emite `StockIngresado`, `StockDescontado`, `Transferencia*`.

## Etapa 3 — Ventas (Módulo 1)

Carrito, descuentos (motor auditable), pagos mixtos, cambios/devoluciones,
entrega diferida por ajuste. Descuenta stock por contrato con Stock. Emite
`VentaConfirmada`, `DevolucionRegistrada`, `PrendaEntregada`. La emisión fiscal
queda `PENDIENTE` (contrato de Facturación).

**Depende de:** Stock (contrato + impl), Clientes (contrato), Caja (contrato).
**Terminado cuando:** flujo E2E de venta con Playwright (agregar por código de
barras, aplicar descuento, cobrar mixto, imprimir ticket no fiscal, abrir cajón),
incluyendo venta con ajuste (queda `PENDIENTE_ENTREGA`) y una devolución con
crédito a favor.

## Etapa 4 — Control de Caja (Módulo 3)

Apertura/cierre por turno y caja, arqueo, movimientos de efectivo, diferencias,
conciliación manual de medios electrónicos. Consume eventos de Ventas.

**Depende de:** Ventas (eventos). **Terminado cuando:** se abre y cierra una caja
con arqueo, se registran retiros/gastos, y el cierre cuadra los totales por medio
de pago provenientes de las ventas del turno.

## Etapa 5 — Facturación (Módulo 7)

Integración real con **ARCA vía intermediario**: A/B, NC/ND, CAE con cola de
reintentos (offline-first), múltiples puntos de venta, libro IVA ventas. Al
recuperar conexión, emite los comprobantes de las ventas registradas. Emite
`ComprobanteEmitido`, `CAEObtenido`, `CAERechazado`.

**Depende de:** Ventas (eventos), Clientes (datos fiscales para Factura A).
**Terminado cuando:** una `VentaConfirmada` genera un comprobante que obtiene CAE
(en entorno de homologación del intermediario), la cola reintenta ante corte de
internet, y el libro IVA se exporta para el contador.

## Etapa 6 — Clientes (Módulo 5)

Se puede adelantar en parte (contrato mínimo lo usan Ventas y Facturación desde
antes). Ficha completa, historial, talles habituales, crédito a favor,
fidelización, datos fiscales.

**Depende de:** contrato usado por Ventas/Facturación. **Terminado cuando:** ficha
con historial y talles habituales, crédito a favor operando en ventas y
devoluciones, y datos fiscales habilitando Factura A.

## Etapa 7 — Proveedores (Módulo 8)

Alta, órdenes de compra por temporada, recepción contra remito (genera ingreso de
stock), cuenta corriente, costos y actualización de precios (versionada),
liquidación de consignación.

**Depende de:** Stock (ingresos). **Terminado cuando:** se emite una OC, se recibe
mercadería contra remito (ingresa stock), se actualiza un precio (nueva versión) y
se liquida un período de consignación a partir de ventas de variantes consignadas.

## Etapa 8 — Empleados (Módulo 4)

Roles/permisos ya existen mínimamente desde Etapa 1; acá se completa: comisiones
(sobre venta neta de devoluciones, al liquidar), control de turnos, ranking.

**Depende de:** Ventas y Devoluciones (para base de comisión). **Terminado cuando:**
se liquida comisión de un vendedor por período, neta de devoluciones, y el ranking
refleja la actividad del turno.

## Etapa 9 — Dashboard (Módulo 6)

KPIs, rotación por marca/talle/temporada, márgenes, ranking, stock inmovilizado,
comparativo entre sucursales. Read models sobre los eventos ya emitidos.

**Depende de:** eventos de todos los módulos anteriores. **Terminado cuando:** los
KPIs cargan desde proyecciones de eventos y el comparativo entre sucursales usa
datos consolidados en el nodo central.

## Criterios de "terminado" comunes a todo módulo

- API pública estable en su `index.ts`; sin imports de internals ajenos.
- Emite/consume los eventos de dominio que le corresponden (idempotentes).
- Toda operación de dinero/stock deja auditoría.
- Tests: unitarios del dominio + integración de los flujos clave. Ventas además
  con E2E Playwright.
- README del módulo actualizado a estado `implementado`.
- Multi-sucursal respetado; dinero en enteros; IDs UUIDv7.
