# Arquitectura

> Documento vivo. Complementa [`../CLAUDE.md`](../CLAUDE.md). Las decisiones no
> triviales se registran como ADR en [`adr/`](adr/).

## 1. Estilo arquitectónico: monolito modular

El sistema es un **monolito modular** desplegado como un único `pos-server`
Fastify por sucursal, con la base de datos PostgreSQL en la misma LAN. No hay
microservicios. Ver [ADR-0007](adr/0007-monolito-modular.md).

**Por qué, y no microservicios:** el negocio son 2 locales, 3 cajas y ~45
tickets/día. El costo de operar N servicios, N deploys y comunicación de red
entre ellos no se paga con ningún beneficio a esta escala. El monolito modular
da los límites lógicos (módulos con API pública) sin el costo operativo de la
distribución. Si algún día un módulo necesitara escalar aparte, la frontera ya
está trazada y se puede extraer.

### Fronteras de módulo

```
apps/pos-server/src/
  modules/
    ventas/         index.ts  ← API pública (el "puerto"). Todo lo demás es privado.
    stock/          index.ts
    caja/           index.ts
    empleados/      index.ts
    clientes/       index.ts
    dashboard/      index.ts
    facturacion/    index.ts
    proveedores/    index.ts
  shared/           auditoría, bus de eventos, tipos Money, acceso a DB, sync
```

Reglas (se hacen cumplir con lint de imports):

1. Un módulo **solo** puede ser importado por su `index.ts`. Nadie importa
   `modules/ventas/internal/...` desde afuera de Ventas.
2. **Sin dependencias circulares.** Si A y B se necesitan mutuamente, al menos
   una dirección va por **evento de dominio**.
3. La comunicación sincrónica entre módulos (cuando hace falta consistencia
   inmediata) va por una **interfaz declarada en `packages/contracts`**, no por
   import del otro módulo.
4. `shared/` contiene preocupaciones transversales (auditoría, eventos, dinero,
   IDs, sync). Los módulos dependen de `shared/`, nunca al revés.

## 2. Mapa de módulos y relaciones

```
                          ┌─────────────┐
                          │  DASHBOARD  │  (solo lee / consume eventos de todos)
                          └──────▲──────┘
                                 │ eventos
   ┌───────────┐  evento   ┌─────┴──────┐   contrato   ┌──────────────┐
   │ PROVEEDOR │──────────►│   STOCK    │◄────────────►│    VENTAS    │
   └─────▲─────┘  ingreso  └─────▲──────┘  reserva/     └──────┬───────┘
         │        de stock       │         descuento           │
         │ OC / consignación     │ transferencias    VentaConfirmada
         │                       │                             │
         │                 ┌─────┴──────┐              ┌────────▼───────┐
         │                 │   CAJA     │◄─────────────│  FACTURACION   │
         │                 └────────────┘  cobros      └────────┬───────┘
         │                                                       │ CAE
   ┌─────┴──────┐                                        ┌───────▼──────┐
   │ EMPLEADOS  │  (identidad, permisos, comisiones)     │     ARCA     │
   └────────────┘                                        │(intermediario)│
                                                          └──────────────┘
         ┌───────────┐
         │ CLIENTES  │  (crédito a favor, datos fiscales, historial)
         └───────────┘
```

### Dependencias principales (dirección de la flecha = "depende de / dispara")

| Origen | Destino | Mecanismo | Motivo |
|--------|---------|-----------|--------|
| Ventas | Stock | Contrato (sincrónico) + evento | Reservar/descontar stock al confirmar |
| Ventas | Facturación | Evento `VentaConfirmada` | Encolar emisión de comprobante |
| Ventas | Caja | Evento / contrato | Registrar cobros en la caja abierta |
| Ventas | Clientes | Contrato | Usar/generar crédito a favor, datos fiscales |
| Facturación | ARCA (ext.) | Adaptador (intermediario) | Obtener CAE |
| Proveedores | Stock | Evento `StockIngresado` | Recepción contra remito |
| Stock | Stock (otra suc.) | Evento `TransferenciaEnviada` + sync | Mover stock entre locales |
| Empleados | (todos) | Contrato | Identidad, permisos, autoría de auditoría |
| Dashboard | (todos) | Consume eventos (read model) | KPIs sin acoplarse a internals |
| Caja | Ventas/Facturación | Consume eventos | Arqueo y conciliación |

**Empleados y Clientes no dependen de nadie** (son de base). **Dashboard no es
dependido por nadie** (es hoja, solo lee). Eso mantiene el grafo acíclico.

## 3. Catálogo de eventos de dominio

Todos los eventos se definen desde el día 1 en `packages/core-domain`, aunque
algunos todavía no tengan consumidor. Convención: **PascalCase, en pasado**.
Todo evento incluye metadata transversal: `eventId` (UUIDv7), `ocurridoEn`
(timestamp), `sucursalId`, `cajaId?`, `usuarioId` (quién), y `correlationId`.

| Evento | Productor | Consumidores previstos | Payload esencial |
|--------|-----------|------------------------|------------------|
| `VentaConfirmada` | Ventas | Facturación, Caja, Stock, Dashboard, Empleados | `ventaId`, líneas (variante, cantidad, precioUnitario snapshot, descuentos), pagos, clienteId?, total |
| `StockDescontado` | Stock | Dashboard, Proveedores (consignación) | `varianteId`, `cantidad`, `sucursalId`, `motivo` (venta/ajuste), `ventaId?` |
| `StockIngresado` | Stock | Dashboard, Proveedores | `varianteId`, `cantidad`, `sucursalId`, `remitoId?`, `costoUnitario?` |
| `TransferenciaEnviada` | Stock | Stock (sucursal destino), Dashboard | `transferenciaId`, `origen`, `destino`, líneas |
| `TransferenciaRecibida` | Stock | Dashboard | `transferenciaId`, `destino`, líneas, diferencias? |
| `CajaAbierta` | Caja | Dashboard, Empleados | `cajaId`, `sucursalId`, `turnoId`, `usuarioId`, `fondoInicial` |
| `CajaCerrada` | Caja | Dashboard, Empleados | `cajaId`, `arqueo`, `diferencia`, totales por medio de pago |
| `DevolucionRegistrada` | Ventas | Stock, Caja, Clientes, Facturación, Dashboard | `devolucionId`, `ventaOrigenId?`, líneas, resolución (NC / crédito a favor) |
| `ComprobanteEmitido` | Facturación | Ventas, Caja, Dashboard | `comprobanteId`, `tipo` (A/B/NC/ND), `ptoVenta`, `numero`, `ventaId?` |
| `CAEObtenido` | Facturación | Ventas, Dashboard | `comprobanteId`, `cae`, `vencimientoCae` |
| `CAERechazado` | Facturación | Ventas (alerta encargado), Dashboard | `comprobanteId`, `motivo`, `intentos` |
| `PrendaEntregada` | Ventas | Stock, Dashboard, Clientes | `ventaId`, líneas entregadas, `fechaEntrega` |
| `CreditoClienteGenerado` | Clientes | Ventas, Dashboard | `clienteId`, `monto` (Money), `origen` (devolucionId) |

### Sobre el bus de eventos
- Es **in-process** dentro de cada `pos-server` (un event emitter con un
  **outbox** persistido en la misma transacción de DB). No es una cola
  distribuida. Ver [ADR-0001](adr/0001-offline-first-y-sincronizacion.md).
- El outbox cumple doble función: (a) desacoplar consumidores dentro del nodo;
  (b) alimentar la **sincronización** con las otras sucursales y el central.
- Entrega **at-least-once**; los consumidores deben ser **idempotentes**
  (deduplicar por `eventId`).

## 4. Estrategia offline-first (resumen)

- La caja **vende siempre**, con o sin internet. El servidor y la DB están en la LAN.
- Lo que requiere internet se **encola y reintenta**:
  - **CAE ante ARCA**: la venta se cierra con ticket **no fiscal**; el comprobante
    fiscal con CAE se emite cuando vuelve la conexión. Ventas separa
    `venta registrada` de `comprobante emitido`.
  - **Sincronización** entre sucursales y con el central: por outbox, cuando hay red.
- **Fuente de verdad de stock**: cada sucursal es dueña de su propio stock. No hay
  escritura concurrente del mismo stock desde dos nodos → **no hay conflictos
  reales** que resolver en el caso normal. Las transferencias son el único flujo
  cross-sucursal y se modelan como envío/recepción explícitos.
- IDs **UUIDv7** generados en el nodo → sin colisión entre sucursales offline.

Detalle completo en [ADR-0001](adr/0001-offline-first-y-sincronizacion.md).

## 5. Decisiones técnicas clave (índice de ADRs)

| ADR | Decisión | Estado |
|-----|----------|--------|
| [0001](adr/0001-offline-first-y-sincronizacion.md) | Offline-first y sincronización entre sucursales | Aceptado |
| [0002](adr/0002-producto-padre-variante-escalas.md) | Producto padre/variante con escalas de talle heterogéneas | Aceptado |
| [0003](adr/0003-representacion-monetaria-y-versionado-precios.md) | Dinero en enteros y versionado de precios | Aceptado |
| [0004](adr/0004-motor-de-descuentos.md) | Motor de descuentos auditable a nivel línea | Aceptado |
| [0005](adr/0005-integracion-arca.md) | Integración con ARCA vía intermediario | Aceptado |
| [0006](adr/0006-mercaderia-en-consignacion.md) | Manejo de mercadería en consignación | Aceptado |
| [0007](adr/0007-monolito-modular.md) | Monolito modular vs. microservicios/packages | Aceptado |
| [0008](adr/0008-auditoria-transversal-y-uuidv7.md) | Auditoría transversal + IDs UUIDv7 | Aceptado |
| [0009](adr/0009-autenticacion-y-autorizacion.md) | Autenticación (Argon2id + sesión revocable) y RBAC por roles | Aceptado |
| [0010](adr/0010-enforcement-de-fronteras-y-auditoria.md) | Enforcement de fronteras de módulo y auditoría obligatoria | Aceptado |

## 6. Preocupaciones transversales (`shared/`)

- **Auditoría**: registro append-only de toda operación de dinero/stock
  (quién, cuándo, qué cambió, caja, sucursal). Ver [ADR-0008](adr/0008-auditoria-transversal-y-uuidv7.md).
  **Se accede por `shared/operacion.ts`** (`operacionDeDominio`), que no deja
  commitear una operación sin rastro; las primitivas de `shared/bus.ts` no se
  llaman directo desde un servicio. Ver [ADR-0010](adr/0010-enforcement-de-fronteras-y-auditoria.md).
- **Dinero** (`Money`): tipo y utilidades. Enteros en centavos. Ver [ADR-0003](adr/0003-representacion-monetaria-y-versionado-precios.md).
- **IDs**: generador UUIDv7.
- **Bus de eventos + outbox**: publicación y consumo idempotente.
- **Sync**: cliente de sincronización con el central (push/pull del outbox).
- **Permisos**: guardas de autorización basadas en el rol de Empleados.
