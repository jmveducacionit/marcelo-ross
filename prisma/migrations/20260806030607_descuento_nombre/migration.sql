/*
  Warnings:

  - Added the required column `nombre` to the `Descuento` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Descuento" ADD COLUMN     "nombre" TEXT NOT NULL;
