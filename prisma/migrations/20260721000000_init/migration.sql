-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Sucursal" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "esDepositoCentral" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "escalaTalleId" TEXT,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalaTalle" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "EscalaTalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Talle" (
    "id" TEXT NOT NULL,
    "escalaTalleId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Talle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Color" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigoHex" TEXT,

    CONSTRAINT "Color_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoPadre" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marcaId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "temporadaId" TEXT,
    "descripcion" TEXT,

    CONSTRAINT "ProductoPadre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variante" (
    "id" TEXT NOT NULL,
    "productoPadreId" TEXT NOT NULL,
    "talleId" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "codigoBarras" TEXT NOT NULL,
    "codigoProveedor" TEXT,
    "esConsignacion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Variante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPorSucursal" (
    "id" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "StockPorSucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoStock" (
    "id" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" TEXT,
    "referenciaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioVariante" (
    "id" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "precio" BIGINT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "vigenteHasta" TIMESTAMP(3),
    "motivo" TEXT,

    CONSTRAINT "PrecioVariante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remito" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL,

    CONSTRAINT "Remito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transferencia" (
    "id" TEXT NOT NULL,
    "sucursalOrigenId" TEXT NOT NULL,
    "sucursalDestinoId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "fechaEnvio" TIMESTAMP(3) NOT NULL,
    "fechaRecepcion" TIMESTAMP(3),

    CONSTRAINT "Transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioFisico" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL,

    CONSTRAINT "InventarioFisico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "clienteId" TEXT,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estadoVenta" TEXT NOT NULL,
    "estadoEntrega" TEXT NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "totalDescuentos" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "esCambio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineaVenta" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" BIGINT NOT NULL,
    "subtotalLinea" BIGINT NOT NULL,
    "requiereAjuste" BOOLEAN NOT NULL DEFAULT false,
    "detalleAjuste" TEXT,

    CONSTRAINT "LineaVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Descuento" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "reglas" JSONB NOT NULL,
    "vigenciaDesde" TIMESTAMP(3),
    "vigenciaHasta" TIMESTAMP(3),
    "requiereAutorizacion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Descuento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DescuentoAplicado" (
    "id" TEXT NOT NULL,
    "lineaVentaId" TEXT,
    "ventaId" TEXT,
    "descuentoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "montoDescontado" BIGINT NOT NULL,
    "autorizadoPor" TEXT,

    CONSTRAINT "DescuentoAplicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "medio" TEXT NOT NULL,
    "monto" BIGINT NOT NULL,
    "cuotas" INTEGER,
    "interes" BIGINT,
    "procesador" TEXT,
    "referenciaExterna" TEXT,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devolucion" (
    "id" TEXT NOT NULL,
    "ventaOrigenId" TEXT,
    "sucursalId" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conTicket" BOOLEAN NOT NULL,
    "resolucion" TEXT NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "Devolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turno" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "fechaApertura" TIMESTAMP(3) NOT NULL,
    "fechaCierre" TIMESTAMP(3),

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionCaja" (
    "id" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fondoInicial" BIGINT NOT NULL,
    "fechaApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" TIMESTAMP(3),
    "estado" TEXT NOT NULL,

    CONSTRAINT "SesionCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "sesionCajaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "medio" TEXT NOT NULL,
    "monto" BIGINT NOT NULL,
    "referenciaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arqueo" (
    "id" TEXT NOT NULL,
    "sesionCajaId" TEXT NOT NULL,
    "totalContado" BIGINT NOT NULL,
    "diferencia" BIGINT NOT NULL,
    "observaciones" TEXT,

    CONSTRAINT "Arqueo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacionElectronica" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "medio" TEXT NOT NULL,
    "montoSistema" BIGINT NOT NULL,
    "montoLiquidacionBanco" BIGINT NOT NULL,
    "diferencia" BIGINT NOT NULL,

    CONSTRAINT "ConciliacionElectronica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashPassword" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "sucursalIdPrincipal" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comision" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "ventaId" TEXT,
    "periodo" TEXT NOT NULL,
    "base" BIGINT NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "monto" BIGINT NOT NULL,
    "estado" TEXT NOT NULL,

    CONSTRAINT "Comision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "condicionIva" TEXT NOT NULL,
    "cuit" TEXT,
    "razonSocial" TEXT,
    "domicilioFiscal" TEXT,
    "email" TEXT,
    "telefono" TEXT,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalleHabitual" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "talleId" TEXT NOT NULL,

    CONSTRAINT "TalleHabitual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "saldo" BIGINT NOT NULL,

    CONSTRAINT "CreditoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntoVenta" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "numeroArca" INTEGER NOT NULL,

    CONSTRAINT "PuntoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "puntoVentaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ventaId" TEXT,
    "clienteId" TEXT,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "neto" BIGINT NOT NULL,
    "iva" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "estadoCae" TEXT NOT NULL,
    "cae" TEXT,
    "vencimientoCae" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColaCae" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "ultimoIntento" TIMESTAMP(3),
    "proximoIntento" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "ColaCae_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "condicionIva" TEXT NOT NULL,
    "esConsignatario" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marca" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "proveedorId" TEXT,
    "markupObjetivo" DOUBLE PRECISION,

    CONSTRAINT "Marca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Temporada" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,

    CONSTRAINT "Temporada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompra" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "temporadaId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL,

    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaCorrienteProveedor" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "saldo" BIGINT NOT NULL,

    CONSTRAINT "CuentaCorrienteProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionConsignacion" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,

    CONSTRAINT "LiquidacionConsignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "usuarioId" TEXT NOT NULL,
    "cajaId" TEXT,
    "sucursalId" TEXT NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Talle_escalaTalleId_etiqueta_key" ON "Talle"("escalaTalleId", "etiqueta");

-- CreateIndex
CREATE UNIQUE INDEX "Variante_codigoBarras_key" ON "Variante"("codigoBarras");

-- CreateIndex
CREATE UNIQUE INDEX "Variante_productoPadreId_talleId_colorId_key" ON "Variante"("productoPadreId", "talleId", "colorId");

-- CreateIndex
CREATE UNIQUE INDEX "StockPorSucursal_varianteId_sucursalId_key" ON "StockPorSucursal"("varianteId", "sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CreditoCliente_clienteId_key" ON "CreditoCliente"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "PuntoVenta_sucursalId_numeroArca_key" ON "PuntoVenta"("sucursalId", "numeroArca");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_puntoVentaId_tipo_numero_key" ON "Comprobante"("puntoVentaId", "tipo", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ColaCae_comprobanteId_key" ON "ColaCae"("comprobanteId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaCorrienteProveedor_proveedorId_key" ON "CuentaCorrienteProveedor"("proveedorId");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_entidad_entidadId_idx" ON "RegistroAuditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_sucursalId_ocurridoEn_idx" ON "RegistroAuditoria"("sucursalId", "ocurridoEn");

-- CreateIndex
CREATE INDEX "Outbox_estado_ocurridoEn_idx" ON "Outbox"("estado", "ocurridoEn");

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_escalaTalleId_fkey" FOREIGN KEY ("escalaTalleId") REFERENCES "EscalaTalle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Talle" ADD CONSTRAINT "Talle_escalaTalleId_fkey" FOREIGN KEY ("escalaTalleId") REFERENCES "EscalaTalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoPadre" ADD CONSTRAINT "ProductoPadre_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "Marca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoPadre" ADD CONSTRAINT "ProductoPadre_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoPadre" ADD CONSTRAINT "ProductoPadre_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "Temporada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variante" ADD CONSTRAINT "Variante_productoPadreId_fkey" FOREIGN KEY ("productoPadreId") REFERENCES "ProductoPadre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variante" ADD CONSTRAINT "Variante_talleId_fkey" FOREIGN KEY ("talleId") REFERENCES "Talle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variante" ADD CONSTRAINT "Variante_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPorSucursal" ADD CONSTRAINT "StockPorSucursal_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "Variante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPorSucursal" ADD CONSTRAINT "StockPorSucursal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "Variante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioVariante" ADD CONSTRAINT "PrecioVariante_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "Variante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineaVenta" ADD CONSTRAINT "LineaVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescuentoAplicado" ADD CONSTRAINT "DescuentoAplicado_lineaVentaId_fkey" FOREIGN KEY ("lineaVentaId") REFERENCES "LineaVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescuentoAplicado" ADD CONSTRAINT "DescuentoAplicado_descuentoId_fkey" FOREIGN KEY ("descuentoId") REFERENCES "Descuento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_sesionCajaId_fkey" FOREIGN KEY ("sesionCajaId") REFERENCES "SesionCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalleHabitual" ADD CONSTRAINT "TalleHabitual_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditoCliente" ADD CONSTRAINT "CreditoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntoVenta" ADD CONSTRAINT "PuntoVenta_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_puntoVentaId_fkey" FOREIGN KEY ("puntoVentaId") REFERENCES "PuntoVenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColaCae" ADD CONSTRAINT "ColaCae_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marca" ADD CONSTRAINT "Marca_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaCorrienteProveedor" ADD CONSTRAINT "CuentaCorrienteProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

