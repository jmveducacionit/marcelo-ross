/**
 * Módulo Facturación — API pública (puerto). Fase 1: contrato/andamiaje.
 * Estado: pendiente. Implementación en Etapa 5 del roadmap.
 * Usa FacturacionArcaPort (@pos/contracts) como adaptador al intermediario ARCA.
 */

export interface FacturacionApi {
  emitirComprobante(input: unknown): Promise<unknown>;
  emitirNotaCredito(input: unknown): Promise<unknown>;
  reintentarCae(comprobanteId: unknown): Promise<unknown>;
  exportarLibroIva(periodo: unknown): Promise<unknown>;
}

export {};
