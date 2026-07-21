/**
 * Módulo Ventas — API pública (puerto). Fase 1: contrato/andamiaje.
 * Todo lo demás dentro de este directorio es privado del módulo.
 * Estado: pendiente. Implementación en Etapa 3 del roadmap.
 */

// Contrato público del módulo. Las firmas se refinan al implementar.
export interface VentasApi {
  confirmarVenta(input: unknown): Promise<unknown>;
  registrarDevolucion(input: unknown): Promise<unknown>;
  entregarPrenda(input: unknown): Promise<unknown>;
  anularVenta(input: unknown): Promise<unknown>;
}

export {};
