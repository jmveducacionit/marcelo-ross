/**
 * Módulo Proveedores — API pública (puerto). Fase 1: contrato/andamiaje.
 * Estado: pendiente. Implementación en Etapa 7 del roadmap.
 */

export interface ProveedoresApi {
  altaProveedor(input: unknown): Promise<unknown>;
  altaMarca(input: unknown): Promise<unknown>;
  crearOrdenCompra(input: unknown): Promise<unknown>;
  recibirMercaderia(remito: unknown): Promise<unknown>;
  actualizarPrecios(input: unknown): Promise<unknown>;
  liquidarConsignacion(input: unknown): Promise<unknown>;
}

export {};
