/**
 * Módulo Empleados — API pública (puerto). Fase 1: contrato/andamiaje.
 * Estado: pendiente. Roles/permisos mínimos en Etapa 1; completo en Etapa 8.
 */

export interface EmpleadosApi {
  autenticar(input: unknown): Promise<unknown>;
  autorizar(rol: string, permiso: string): boolean;
  liquidarComisiones(periodo: unknown): Promise<unknown>;
  rankingVendedores(input: unknown): Promise<unknown>;
}

export {};
