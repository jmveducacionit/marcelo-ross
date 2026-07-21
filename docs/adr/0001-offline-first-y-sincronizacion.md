# ADR-0001: Offline-first y sincronización entre sucursales

- **Estado**: Aceptado
- **Fecha**: 2026-07-21
- **Decisores**: Arquitecto técnico, dueño

## Contexto

La venta no puede frenarse por una caída de internet. El servidor de aplicación y
la base de datos viven en la LAN de cada sucursal, así que operan sin internet. Lo
que sí depende de internet es: (a) obtener el CAE ante ARCA; (b) sincronizar stock
y ventas entre las 2 sucursales y con el nodo central. Necesitamos IDs que no
colisionen entre sucursales offline y una estrategia de conflictos que no sea más
compleja de lo que el problema amerita (2 locales, ~45 tickets/día).

## Opciones consideradas

1. **DB central en la nube, sucursales como clientes** — simple de razonar, pero
   la venta depende de internet. Descartada: viola el requisito offline-first.
2. **DB por sucursal + sincronización multi-master con resolución de conflictos
   genérica (CRDT / vector clocks)** — robusto ante escritura concurrente de la
   misma entidad desde varios nodos, pero es sobre-ingeniería para este volumen.
3. **DB por sucursal + "dueño único" por entidad + outbox hacia el central**
   (elegida) — cada dato tiene un nodo autoritativo; la sincronización es
   propagación de hechos, no merge de estados en conflicto.

## Decisión

- **Una PostgreSQL por sucursal**, autoritativa sobre **su propio stock, sus
  cajas y sus ventas**. El VPS central **consolida** (para Dashboard y reportes) y
  hace **backup**; no es fuente de verdad operativa.
- **Patrón outbox transaccional**: cada operación relevante escribe, en la misma
  transacción, sus filas de negocio y un registro en `Outbox` (= el evento de
  dominio). Un proceso de sync empuja el outbox al central y a la otra sucursal
  cuando hay internet. Entrega **at-least-once**; consumidores **idempotentes**
  (dedupe por `eventId`).
- **Sin conflictos en el caso normal**: como el stock tiene dueño único por
  sucursal, dos nodos nunca escriben el mismo contador de stock. El único flujo
  cross-sucursal es la **transferencia**, modelada como **envío** (baja en origen)
  y **recepción** (alta en destino) explícitos y separados — tolerante a demoras y
  a diferencias de conteo.
- **Datos maestros** (catálogo de productos, marcas, precios): editados
  primordialmente en el **central/Depósito Centro** y replicados a las sucursales;
  ante edición concurrente rara, **last-write-wins por timestamp** es suficiente y
  queda auditado.
- **CAE offline**: la venta se cierra con **ticket no fiscal**; el comprobante
  fiscal se encola (`ColaCae`) y se emite al recuperar conexión. Ventas separa
  `venta registrada` de `comprobante emitido`. Ver [ADR-0005](0005-integracion-arca.md).
- **IDs UUIDv7** generados en el nodo → sin colisión offline. Ver
  [ADR-0008](0008-auditoria-transversal-y-uuidv7.md).

## Consecuencias

- **Se gana:** la caja vende siempre; sincronización simple sin merges complejos;
  escalabilidad de sobra para el volumen real; backup centralizado.
- **Se pierde / se acepta:** el stock de la **otra** sucursal se ve con latencia
  (no en tiempo real) — aceptable, y explícitamente elegido (no vender stock ajeno
  desde la caja). Los datos maestros tienen una ventana de propagación. Requiere
  disciplina de **idempotencia** en los consumidores de eventos.
- **Seguimiento:** si en el futuro se quisiera stock cross-sucursal en tiempo real
  o venta online con stock unificado, se reevalúa (probablemente promoviendo el
  central a autoritativo para un subconjunto).
