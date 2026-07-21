/**
 * Identidad de entidades — UUIDv7 generado en la aplicación.
 * Sin autoincremental (colisionaría entre sucursales offline).
 * Time-ordered => buena localidad de índice en Postgres.
 * Ver docs/adr/0008-auditoria-transversal-y-uuidv7.md
 */

import { v7 as uuidv7 } from 'uuid';

/** UUID (v7) como string. Branded para no confundirlo con strings cualquiera. */
export type Uuid = string & { readonly __brand: 'Uuid' };

/** Genera un nuevo UUIDv7 (time-ordered). */
export function nuevoUuid(): Uuid {
  return uuidv7() as Uuid;
}

/** Marca un string existente como Uuid (ej. al leer de la DB). No valida formato. */
export function comoUuid(valor: string): Uuid {
  return valor as Uuid;
}
