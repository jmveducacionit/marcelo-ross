/*
  Warnings:

  - Added the required column `total` to the `Devolucion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Devolucion" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "total" BIGINT NOT NULL;

-- CreateTable
CREATE TABLE "LineaDevolucion" (
    "id" TEXT NOT NULL,
    "devolucionId" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" BIGINT NOT NULL,
    "lineaVentaOrigenId" TEXT,

    CONSTRAINT "LineaDevolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCredito" (
    "id" TEXT NOT NULL,
    "creditoClienteId" TEXT NOT NULL,
    "monto" BIGINT NOT NULL,
    "motivo" TEXT NOT NULL,
    "devolucionId" TEXT,
    "ventaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCredito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoCredito_creditoClienteId_ocurridoEn_idx" ON "MovimientoCredito"("creditoClienteId", "ocurridoEn");

-- AddForeignKey
ALTER TABLE "LineaDevolucion" ADD CONSTRAINT "LineaDevolucion_devolucionId_fkey" FOREIGN KEY ("devolucionId") REFERENCES "Devolucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCredito" ADD CONSTRAINT "MovimientoCredito_creditoClienteId_fkey" FOREIGN KEY ("creditoClienteId") REFERENCES "CreditoCliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
