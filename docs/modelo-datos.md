# Modelo de datos (conceptual)

> Modelo conceptual de las **8 áreas**. Anticipa los 8 módulos aunque las
> migraciones se apliquen por etapas (ver [`roadmap.md`](roadmap.md)). El esquema
> Prisma comentado vive en [`../prisma/schema.prisma`](../prisma/schema.prisma).
>
> Convenciones que atraviesan todo el modelo:
> - **IDs**: UUIDv7 (`Uuid`), generados en la app. Sin autoincremental.
> - **Dinero**: enteros en centavos de ARS (`Money = BigInt`). Nunca float.
> - **Multi-sucursal**: toda entidad con stock/caja/venta lleva `sucursalId`.
> - **Auditoría**: toda mutación de dinero/stock deja rastro (tabla `RegistroAuditoria`).

## 0. Entidades base

### Sucursal
`id, nombre, direccion, esDepositoCentral (bool), puntoVentaArca (int)`
Las 2 sucursales (Centro, Shopping). El punto de venta ARCA es uno por sucursal.

### Caja
`id, sucursalId, nombre` — puesto físico de venta (3 en total).

## 1. STOCK — el corazón del modelo

### Matriz talle × color con escalas configurables

El punto más delicado del rubro. Ver [ADR-0002](adr/0002-producto-padre-variante-escalas.md).

```
Categoria ──< EscalaTalle ──< Talle
    │                            │
    │                            │
ProductoPadre ──< Variante(SKU) ─┘  (Variante = Padre × Talle × Color)
    │                 │
   Marca          StockPorSucursal (cantidad, por sucursal)
```

- **Categoria**: `id, nombre` (camisería, denim, calzado, sacos, accesorios…).
  Cada categoría define **qué escala de talle** usa.
- **EscalaTalle**: `id, nombre, categoriaId`. Ej: "Camisería 38-44",
  "Denim 28-36", "Calzado 39-45", "Sacos 46-54", "Talle único".
- **Talle**: `id, escalaTalleId, etiqueta ("40", "M", "42"), orden (int)`.
  El `orden` permite ordenar talles no numéricos. Las escalas **NO son homogéneas**.
- **Color**: `id, nombre, codigoHex?`.
- **ProductoPadre**: `id, nombre, marcaId, categoriaId, temporadaId, descripcion`.
  El stock **nunca** se lleva acá.
- **Variante (SKU)**: `id, productoPadreId, talleId, colorId, codigoBarras (propio),
  codigoProveedor?, esConsignacion (bool)`.
  - `codigoBarras`: **generado por el comercio** al ingresar stock (la mercadería
    llega sin código o con el del proveedor). Único global.
  - Combinación `(productoPadreId, talleId, colorId)` única.
- **StockPorSucursal**: `id, varianteId, sucursalId, cantidad`.
  **El stock se lleva SIEMPRE a nivel variante y por sucursal.** Cantidad puede
  derivarse/validarse contra el ledger de movimientos (ver abajo).

### Movimientos de stock (trazabilidad)

Ledger append-only. La cantidad en `StockPorSucursal` es la proyección.

- **MovimientoStock**: `id, varianteId, sucursalId, tipo, cantidad (+/-),
  motivo, referenciaId?, usuarioId, ocurridoEn`.
  - `tipo`: INGRESO, VENTA, DEVOLUCION, AJUSTE, TRANSFERENCIA_SALIDA,
    TRANSFERENCIA_ENTRADA, INVENTARIO.
  - `referenciaId`: apunta a remito, venta, transferencia, etc. según motivo.

### Ingresos, transferencias, inventario, consignación

- **Remito / IngresoStock**: `id, proveedorId, sucursalId, fecha, estado`, con
  **líneas** `(varianteId, cantidad, costoUnitario Money)`. Genera `StockIngresado`.
- **Transferencia**: `id, sucursalOrigenId, sucursalDestinoId, estado
  (ENVIADA/RECIBIDA/CON_DIFERENCIA), fechaEnvio, fechaRecepcion`, con líneas.
  Envío y recepción son pasos separados (soporta el modelo offline y las
  diferencias de conteo).
- **InventarioFisico**: `id, sucursalId, fecha, estado`, con líneas
  `(varianteId, cantidadSistema, cantidadContada, diferencia)`. Ajusta el ledger.
- **Consignación**: la variante marca `esConsignacion`. El stock está físicamente
  en el local pero **no es propiedad** del comercio hasta venderse. Ver
  [ADR-0006](adr/0006-mercaderia-en-consignacion.md). Al vender una variante en
  consignación se genera un **cargo de consignación** hacia el proveedor
  (base para la liquidación en el módulo Proveedores).
- **AlertaReposicion**: derivada — `varianteId, sucursalId, stockMinimo`.

## 2. VENTAS

### Venta y líneas

- **Venta**: `id, sucursalId, cajaId, vendedorId, clienteId?, fechaHora,
  estadoVenta (CONFIRMADA/ANULADA), estadoEntrega (ENTREGADA/PENDIENTE_AJUSTE),
  subtotal, totalDescuentos, total (Money), esCambio?`.
  - **`estadoEntrega`** distingue **vendido** de **entregado**: los ajustes de
    prenda (ruedo, entalle) cierran la venta pero la prenda se entrega días
    después. `PrendaEntregada` se emite al retirar.
- **LineaVenta**: `id, ventaId, varianteId, cantidad, precioUnitario (Money,
  **snapshot** al momento de la venta), descuentosAplicados[], subtotalLinea,
  requiereAjuste (bool), detalleAjuste?`.
  - El `precioUnitario` es una **copia** del precio vigente al vender, **no** una
    FK al precio actual. Ver [ADR-0003](adr/0003-representacion-monetaria-y-versionado-precios.md).

### Descuentos (auditables a nivel línea)

Ver [ADR-0004](adr/0004-motor-de-descuentos.md).

- **Descuento (definición)**: `id, tipo (PORCENTAJE/MONTO_FIJO/COMBO/
  LIQUIDACION/EMPLEADO/PROMO_BANCARIA), reglas (json), vigenciaDesde/Hasta,
  requiereAutorizacion`.
- **DescuentoAplicado**: `id, lineaVentaId? | ventaId?, descuentoId, tipo,
  montoDescontado (Money), autorizadoPor?`. Cada descuento aplicado queda
  registrado con su **monto en dinero** y quién lo autorizó → auditable.

### Pagos (mixtos en un mismo ticket)

- **Pago**: `id, ventaId, medio (EFECTIVO/DEBITO/CREDITO/TRANSFERENCIA/QR/
  GIFTCARD/CREDITO_CLIENTE), monto (Money), cuotas?, interes?, referenciaExterna?,
  procesador? (MODO/MercadoPago…)`. Una venta puede tener **varios** pagos.

### Cambios y devoluciones

- **Devolucion**: `id, ventaOrigenId?, sucursalId, cajaId, usuarioId, fecha,
  conTicket (bool), resolucion (NOTA_CREDITO/CREDITO_A_FAVOR/CAMBIO), motivo`,
  con líneas `(varianteId, cantidad)`. Dentro de los 30 días. Genera
  `DevolucionRegistrada`, reingresa stock, y según resolución dispara
  `CreditoClienteGenerado` o una nota de crédito en Facturación.

## 3. CONTROL DE CAJA

- **Turno**: `id, sucursalId, fechaApertura, fechaCierre?`.
- **AperturaCaja / SesionCaja**: `id, cajaId, turnoId, usuarioId, fondoInicial
  (Money), fechaApertura, fechaCierre?, estado (ABIERTA/CERRADA)`.
- **MovimientoCaja**: `id, sesionCajaId, tipo (VENTA/RETIRO/GASTO/INGRESO_MANUAL),
  medio, monto (Money), referenciaId?, usuarioId, fechaHora`.
- **Arqueo**: `id, sesionCajaId, totalesEsperadosPorMedio (json), totalContado
  (Money), diferencia (Money), observaciones`.
- **ConciliacionElectronica**: `id, sucursalId, periodo, medio, montoSistema,
  montoLiquidacionBanco, diferencia`, cargada **manualmente** en V1.

## 4. EMPLEADOS

- **Usuario**: `id, nombre, email, hashPassword, rol, sucursalIdPrincipal, activo`.
- **Rol / Permiso**: `rol (VENDEDOR/ENCARGADO/ADMIN/CONTADOR_RO)` + matriz de
  permisos. El contador es **solo lectura de reportes**.
- **Comision**: `id, vendedorId, ventaId?, periodo, base (Money, neta de
  devoluciones), porcentaje, monto (Money), estado (PENDIENTE/LIQUIDADA)`.
  Se calcula **al liquidar**, sobre venta **neta de devoluciones**.
- **RegistroTurnoEmpleado**: control de turnos / presencia (para ranking).

## 5. CLIENTES

- **Cliente**: `id, nombre, documento, condicionIva, cuit?, razonSocial?,
  domicilioFiscal?, email?, telefono?`. Los datos fiscales habilitan **Factura A**.
- **TalleHabitual**: `id, clienteId, categoriaId, talleId` — historial de talles
  por categoría (para asesorar en piso).
- **CreditoCliente**: `id, clienteId, saldo (Money), origen`. Movimientos
  `(+devolucion / -uso en venta)`. Nace de `CreditoClienteGenerado`.
- **HistorialCompra**: proyección de las ventas del cliente (para fidelización).

## 6. DASHBOARD

Sin tablas propias de escritura: **read models / proyecciones** construidas a
partir de los eventos de dominio. KPIs: venta por período/sucursal/vendedor,
rotación por marca/talle/temporada, márgenes (precio − costo), stock inmovilizado,
comparativo entre sucursales. Se materializan en vistas o tablas de solo lectura.

## 7. FACTURACIÓN

- **PuntoVenta**: `id, sucursalId, numeroArca` — uno por sucursal.
- **Comprobante**: `id, tipo (FACTURA_A/FACTURA_B/NOTA_CREDITO/NOTA_DEBITO),
  puntoVentaId, numero, ventaId?, clienteId?, fechaEmision, neto, iva, total
  (Money), estadoCae (PENDIENTE/OBTENIDO/RECHAZADO), cae?, vencimientoCae?,
  intentos`. La numeración es por punto de venta y tipo.
- **ColaCae**: `id, comprobanteId, estado, ultimoIntento, proximoIntento,
  error?`. Reintentos del CAE ante el intermediario. Ver
  [ADR-0005](adr/0005-integracion-arca.md).
- **LibroIvaVenta**: proyección exportable para el contador (por período).

## 8. PROVEEDORES

- **Proveedor**: `id, razonSocial, cuit, condicionIva, esConsignatario (bool),
  datosContacto`.
- **Marca**: `id, nombre, proveedorId?, markupObjetivo (55%–130%)`.
- **OrdenCompra**: `id, proveedorId, temporadaId, fecha, estado`, con líneas
  `(varianteId | descripcion, cantidad, costoUnitario Money)`.
- **RecepcionMercaderia**: contra remito → genera ingreso de stock.
- **CuentaCorrienteProveedor**: `id, proveedorId, saldo (Money)`, con movimientos.
- **ListaCosto / ActualizacionPrecio**: costos por variante versionados; la
  actualización de precio de venta se propaga como **nueva versión de precio**
  (no pisa el anterior). Ver [ADR-0003](adr/0003-representacion-monetaria-y-versionado-precios.md).
- **LiquidacionConsignacion**: `id, proveedorId, periodo, líneas (variante,
  cantidadVendida, montoALiquidar Money)`. Nace de las ventas de variantes en
  consignación. Ver [ADR-0006](adr/0006-mercaderia-en-consignacion.md).

## 9. Precios versionados (transversal Stock/Ventas/Proveedores)

- **PrecioVariante**: `id, varianteId, precio (Money), vigenteDesde, vigenteHasta?,
  motivo`. El precio de venta **nunca se pisa**: cada cambio es una fila nueva.
  El precio "vigente" es el de mayor `vigenteDesde` sin `vigenteHasta`.
- La **LineaVenta guarda el `precioUnitario` como snapshot**, así el ticket es
  reproducible aunque el precio cambie después (inflación → precios cambian seguido).

## 10. Auditoría (transversal)

- **RegistroAuditoria** (append-only): `id, entidad, entidadId, accion, antes
  (json), despues (json), usuarioId, cajaId?, sucursalId, ocurridoEn`.
  Cubre toda operación con impacto en **dinero o stock**. Ver
  [ADR-0008](adr/0008-auditoria-transversal-y-uuidv7.md).
- **Outbox** (para sync + eventos): `id (=eventId UUIDv7), tipoEvento, payload
  (json), sucursalId, estado (PENDIENTE/PUBLICADO/SINCRONIZADO), ocurridoEn`.
