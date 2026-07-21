/**
 * Identidad de entidades — UUIDv7 generado en la aplicación.
 * Sin autoincremental (colisionaría entre sucursales offline).
 * Time-ordered => buena localidad de índice en Postgres.
 * Ver docs/adr/0008-auditoria-transversal-y-uuidv7.md
 *
 * Fase 1: contrato/andamiaje.
 */

/** UUID (v7) como string. Branded para no confundirlo con strings cualquiera. */
export type Uuid = string & { readonly __brand: 'Uuid' };

/** Genera un nuevo UUIDv7 (time-ordered). Implementación en etapa de fundaciones. */
export declare function nuevoUuid(): Uuid;
