/**
 * Módulo Control de Caja — API pública (puerto). Fase 1: contrato/andamiaje.
 * Estado: pendiente. Implementación en Etapa 4 del roadmap.
 * Provee la implementación de CajaPort (@pos/contracts) a Ventas.
 */

export interface CajaApi {
  abrirCaja(input: unknown): Promise<unknown>;
  cerrarCaja(input: unknown): Promise<unknown>;
  registrarMovimiento(input: unknown): Promise<unknown>;
  arquear(input: unknown): Promise<unknown>;
  conciliarElectronicos(input: unknown): Promise<unknown>;
}

export {};
