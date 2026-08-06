-- AlterTable
ALTER TABLE "LiquidacionConsignacion" ADD COLUMN     "desde" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'EMITIDA',
ADD COLUMN     "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "hasta" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "total" BIGINT NOT NULL,
ADD COLUMN     "usuarioId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OrdenCompra" ADD COLUMN     "numero" TEXT NOT NULL,
ADD COLUMN     "total" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Remito" ADD COLUMN     "numero" TEXT NOT NULL,
ADD COLUMN     "ordenCompraId" TEXT,
ADD COLUMN     "total" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LineaRemito" (
    "id" TEXT NOT NULL,
    "remitoId" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" BIGINT NOT NULL,

    CONSTRAINT "LineaRemito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineaOrdenCompra" (
    "id" TEXT NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "varianteId" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" BIGINT NOT NULL,
    "recibido" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LineaOrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCuentaProveedor" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "monto" BIGINT NOT NULL,
    "motivo" TEXT NOT NULL,
    "remitoId" TEXT,
    "liquidacionId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCuentaProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineaLiquidacion" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "cantidadVendida" INTEGER NOT NULL,
    "costoUnitario" BIGINT NOT NULL,
    "montoALiquidar" BIGINT NOT NULL,

    CONSTRAINT "LineaLiquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoCuentaProveedor_cuentaId_ocurridoEn_idx" ON "MovimientoCuentaProveedor"("cuentaId", "ocurridoEn");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacionConsignacion_proveedorId_periodo_key" ON "LiquidacionConsignacion"("proveedorId", "periodo");

-- CreateIndex
CREATE INDEX "OrdenCompra_proveedorId_fecha_idx" ON "OrdenCompra"("proveedorId", "fecha");

-- CreateIndex
CREATE INDEX "Remito_proveedorId_fecha_idx" ON "Remito"("proveedorId", "fecha");

-- AddForeignKey
ALTER TABLE "LineaRemito" ADD CONSTRAINT "LineaRemito_remitoId_fkey" FOREIGN KEY ("remitoId") REFERENCES "Remito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineaOrdenCompra" ADD CONSTRAINT "LineaOrdenCompra_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCuentaProveedor" ADD CONSTRAINT "MovimientoCuentaProveedor_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaCorrienteProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineaLiquidacion" ADD CONSTRAINT "LineaLiquidacion_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "LiquidacionConsignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

