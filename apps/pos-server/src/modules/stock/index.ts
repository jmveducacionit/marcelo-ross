/**
 * Módulo Stock — API pública (puerto). Fase 1: contrato/andamiaje.
 * Estado: pendiente. Implementación en Etapa 2 del roadmap.
 * Provee la implementación de StockPort (@pos/contracts) a Ventas.
 */

export interface StockApi {
  altaProducto(input: unknown): Promise<unknown>;
  generarCodigoBarras(varianteId: unknown): Promise<string>;
  ingresarPorRemito(input: unknown): Promise<unknown>;
  ajustar(input: unknown): Promise<unknown>;
  transferir(input: unknown): Promise<unknown>;
  recibirTransferencia(input: unknown): Promise<unknown>;
  tomarInventario(input: unknown): Promise<unknown>;
}

export {};
