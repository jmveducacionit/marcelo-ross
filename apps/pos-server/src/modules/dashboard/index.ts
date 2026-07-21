/**
 * Módulo Dashboard — API pública (puerto). Fase 1: contrato/andamiaje.
 * Estado: pendiente. Implementación en Etapa 9 del roadmap.
 * Solo lectura: consultas sobre read models alimentados por eventos.
 */

export interface DashboardApi {
  kpisVenta(input: unknown): Promise<unknown>;
  rotacion(input: unknown): Promise<unknown>;
  margenes(input: unknown): Promise<unknown>;
  comparativoSucursales(input: unknown): Promise<unknown>;
  stockInmovilizado(input: unknown): Promise<unknown>;
}

export {};
