/**
 * Módulo Empleados — API pública (el "puerto"). ADR-0007 / ADR-0009 / ADR-0010.
 *
 * `comisiones.ts` es privado. La autenticación y el RBAC viven en `src/auth/`
 * desde ADR-0009 y son anteriores a la materialización de módulos: quedan ahí
 * porque los usa todo el servidor, no solo este módulo.
 *
 * Todavía NO implementado: alta/baja de usuarios y cambio de contraseña por UI
 * (hoy se siembran), control de turnos, y escalas de comisión por objetivo.
 */
import {
  calcularComisiones, listarEmpleados, liquidarComisiones, rankingVendedores,
  type LiquidarComisionesInput,
} from './comisiones.js';

export { ErrorComision, PORCENTAJE_COMISION } from './comisiones.js';
export type { FilaComision, LiquidarComisionesInput } from './comisiones.js';

export interface EmpleadosApi {
  listar(): ReturnType<typeof listarEmpleados>;
  /** Comisiones del período. No escribe: se devengan al liquidar. */
  comisiones(periodo: string, sucursalId?: string): ReturnType<typeof calcularComisiones>;
  /** Ranking con ticket promedio y participación. */
  ranking(periodo: string, sucursalId?: string): ReturnType<typeof rankingVendedores>;
  /** Devenga las comisiones del período. Idempotente por vendedor y período. */
  liquidar(input: LiquidarComisionesInput): ReturnType<typeof liquidarComisiones>;
}

export const empleados: EmpleadosApi = {
  listar: listarEmpleados,
  comisiones: calcularComisiones,
  ranking: rankingVendedores,
  liquidar: liquidarComisiones,
};
