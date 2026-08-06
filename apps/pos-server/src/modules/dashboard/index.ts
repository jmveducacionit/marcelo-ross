/**
 * Módulo Dashboard — API pública (el "puerto"). ADR-0007 / ADR-0010.
 *
 * `kpis.ts` y `analitica.ts` son privados.
 *
 * Dashboard es hoja del grafo: solo LEE. Nadie depende de él, y por eso puede
 * consultar libremente sin romper el aciclismo.
 *
 * Deuda conocida: lee las tablas directamente en vez de proyectar sobre el
 * Outbox, porque se construyó antes que los eventos que debía consumir. El read
 * model de la Etapa 9 implica rehacer esta parte; hasta entonces los números son
 * correctos pero se calculan cada vez.
 */
import { kpis } from './kpis.js';
import { margenes, rangoDelMes, rotacion, type RangoPeriodo } from './analitica.js';

export { rangoDelMes } from './analitica.js';
export type { MargenPorMarca, RangoPeriodo } from './analitica.js';

export interface DashboardApi {
  /** KPIs del día: ventas, tickets, ranking, marcas top, inmovilizado. */
  kpis(): ReturnType<typeof kpis>;
  /** Margen por marca del período. Separa consignación de mercadería propia. */
  margenes(rango: RangoPeriodo, sucursalId?: string): ReturnType<typeof margenes>;
  /** Rotación por talle y por temporada. */
  rotacion(rango: RangoPeriodo, sucursalId?: string): ReturnType<typeof rotacion>;
}

export const dashboard: DashboardApi = { kpis, margenes, rotacion };
