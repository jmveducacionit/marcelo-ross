-- AlterTable
ALTER TABLE "Arqueo" ADD COLUMN     "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "totalEsperado" BIGINT NOT NULL,
ADD COLUMN     "totalesPorMedio" JSONB NOT NULL,
ADD COLUMN     "usuarioId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SesionCaja" ADD COLUMN     "sucursalId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Arqueo_sesionCajaId_key" ON "Arqueo"("sesionCajaId");

-- CreateIndex
CREATE INDEX "SesionCaja_cajaId_estado_idx" ON "SesionCaja"("cajaId", "estado");

-- AddForeignKey
ALTER TABLE "Arqueo" ADD CONSTRAINT "Arqueo_sesionCajaId_fkey" FOREIGN KEY ("sesionCajaId") REFERENCES "SesionCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

