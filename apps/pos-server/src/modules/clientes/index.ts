/**
 * Módulo Clientes — API pública (el "puerto"). ADR-0007 / ADR-0010.
 *
 * `consultas.ts` y `credito.ts` son privados.
 *
 * Clientes no depende de nadie (es un módulo de base). Ventas lo usa para el
 * crédito a favor y Facturación para los datos fiscales de la Factura A.
 *
 * Todavía NO implementado: fidelización, alta/edición de cliente por UI, y el
 * CONSUMO del crédito a favor dentro de una venta — hoy el crédito se genera
 * pero no se gasta.
 */
import type { Money } from '@pos/core-domain';
import type { RegistroOperacion, Tx } from '../../shared/operacion.js';
import { clienteDetalle, clientesListado } from './consultas.js';
import { acreditarPorDevolucion as acreditarImpl, type AcreditarInput } from './credito.js';

export type { AcreditarInput } from './credito.js';

export interface ClientesApi {
  /** Búsqueda por nombre. `search` vacío devuelve los primeros. */
  listado(search: string): ReturnType<typeof clientesListado>;
  /** Ficha con historial y talles habituales. `null` si no existe. */
  detalle(id: string): ReturnType<typeof clienteDetalle>;
}

export const clientes: ClientesApi = {
  listado: clientesListado,
  detalle: clienteDetalle,
};

// --- Puerto transaccional (módulo a módulo) ----------------------------------

/**
 * Acredita saldo a favor por una devolución, dentro de la transacción del
 * llamador. Devuelve el saldo resultante.
 */
export type AcreditarPorDevolucion = (
  tx: Tx,
  reg: RegistroOperacion,
  input: AcreditarInput,
) => Promise<Money>;

export const acreditarPorDevolucion: AcreditarPorDevolucion = acreditarImpl;
