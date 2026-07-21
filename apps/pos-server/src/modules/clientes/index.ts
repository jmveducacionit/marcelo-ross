/**
 * Módulo Clientes — API pública (puerto). Fase 1: contrato/andamiaje.
 * Estado: pendiente. Implementación en Etapa 6 del roadmap.
 * Provee la implementación de ClientesPort (@pos/contracts).
 */

export interface ClientesApi {
  altaCliente(input: unknown): Promise<unknown>;
  registrarTalleHabitual(input: unknown): Promise<unknown>;
  historial(clienteId: unknown): Promise<unknown>;
}

export {};
