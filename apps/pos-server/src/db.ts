// Cargar variables de .env ANTES de construir PrismaClient (lee DATABASE_URL
// al instanciarse). Node 20.12+/22+ tiene process.loadEnvFile.
try {
  // Busca .env en el directorio de trabajo (raíz del monorepo al correr `pnpm dev`).
  process.loadEnvFile();
} catch {
  // Si no hay .env (ej. variables ya inyectadas por el entorno), seguimos.
}

import { PrismaClient } from '@prisma/client';

/** Cliente Prisma único para el server. */
export const prisma = new PrismaClient();
