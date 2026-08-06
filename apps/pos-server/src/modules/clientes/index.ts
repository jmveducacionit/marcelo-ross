/**
 * Módulo Clientes — API pública (el "puerto"). ADR-0007 / ADR-0010.
 *
 * `consultas.ts` y `credito.ts` son privados.
 *
 * Clientes no depende de nadie (es un módulo de base). Ventas lo usa para el
 * crédito a favor y Facturación para los datos fiscales de la Factura A.
 *
 * Todavía NO implementado: fidelización y alta/edición de cliente por UI.
 */
import type { Money } from '@pos/core-domain';
import type { RegistroOperacion, Tx } from '../../shared/operacion.js';
import { clienteDetalle, clientesListado } from './consultas.js';
import {
  acreditarPorDevolucion as acreditarImpl, consumirCredito as consumirImpl,
  type AcreditarInput, type ConsumirInput,
} from './credito.js';

export { ErrorCredito } from './credito.js';
export type { AcreditarInput, ConsumirInput } from './credito.js';

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

/**
 * Gasta crédito a favor en una venta, dentro de la transacción del llamador.
 * Devuelve el saldo restante. Falla si no alcanza.
 */
export type ConsumirCredito = (
  tx: Tx,
  reg: RegistroOperacion,
  input: ConsumirInput,
) => Promise<Money>;

export const consumirCredito: ConsumirCredito = consumirImpl;
