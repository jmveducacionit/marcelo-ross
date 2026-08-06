/**
 * Módulo Control de Caja — API pública (el "puerto"). ADR-0007 / ADR-0010.
 *
 * `sesiones.ts` es privado.
 *
 * Caja consume los cobros de Ventas por un puerto transaccional, no por evento:
 * si la venta commitea y el cobro no, el arqueo arranca roto. Ver
 * `registrarCobros`.
 *
 * Todavía NO implementado: conciliación de medios electrónicos contra la
 * liquidación del procesador (manual en V1, ver la decisión registrada), y el
 * cierre de turno completo del local con varias cajas.
 */
import type { RegistroOperacion, Tx } from '../../shared/operacion.js';
import {
  abrirCaja, cerrarCaja, estadoDeCaja, registrarCobros as registrarCobrosImpl, registrarMovimiento,
  type AbrirCajaInput, type CerrarCajaInput, type CobroDeVenta, type MovimientoManualInput,
} from './sesiones.js';

export { ErrorCaja, MEDIO_EFECTIVO } from './sesiones.js';
export type {
  AbrirCajaInput, CerrarCajaInput, CobroDeVenta, MovimientoManualInput, TipoMovimientoCaja,
} from './sesiones.js';

export interface CajaApi {
  /** Abre una sesión. Falla si esa caja ya tiene una abierta. */
  abrir(input: AbrirCajaInput): ReturnType<typeof abrirCaja>;
  /** Cierra con arqueo: contado vs esperado, con la diferencia firmada. */
  cerrar(input: CerrarCajaInput): ReturnType<typeof cerrarCaja>;
  /** Retiro, gasto o ingreso manual de efectivo. */
  movimiento(input: MovimientoManualInput): ReturnType<typeof registrarMovimiento>;
  /** Estado de la sesión abierta de una caja. `null` si no hay ninguna. */
  estado(cajaId: string): ReturnType<typeof estadoDeCaja>;
}

export const caja: CajaApi = {
  abrir: abrirCaja,
  cerrar: cerrarCaja,
  movimiento: registrarMovimiento,
  estado: estadoDeCaja,
};

// --- Puerto transaccional (módulo a módulo) ----------------------------------

/**
 * Registra los cobros de una venta en la caja abierta, dentro de la transacción
 * de Ventas. **Falla si no hay caja abierta**: un cobro que no cae en ninguna
 * sesión es plata que después no aparece en ningún arqueo.
 */
export type RegistrarCobros = (
  tx: Tx,
  reg: RegistroOperacion,
  input: CobroDeVenta,
) => Promise<void>;

export const registrarCobros: RegistrarCobros = registrarCobrosImpl;
