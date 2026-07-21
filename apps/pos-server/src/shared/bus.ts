/**
 * Bus de eventos + Outbox + Auditoría (versión mínima para el prototipo).
 *
 * Diseño (ADR-0001 / ADR-0008): en la MISMA transacción de negocio se escribe:
 *  - la fila de Outbox (= el evento de dominio, para el bus y la sincronización)
 *  - la fila de RegistroAuditoria (quién, cuándo, qué, caja, sucursal)
 * Los consumidores in-process se notifican DESPUÉS del commit (at-least-once,
 * idempotencia por eventId). Acá el emitter solo hace log; lo importante visible
 * es que Outbox y Auditoría quedan persistidos transaccionalmente.
 */
import { EventEmitter } from 'node:events';
import type { EventoDominio } from '@pos/core-domain';

/** Cliente de transacción de Prisma (subset que usamos). */
type Tx = {
  outbox: { create: (args: { data: any }) => Promise<unknown> };
  registroAuditoria: { create: (args: { data: any }) => Promise<unknown> };
};

export const bus = new EventEmitter();

/** Escribe el evento en el Outbox dentro de la transacción `tx`. */
export async function encolarEvento(tx: Tx, evento: EventoDominio): Promise<void> {
  await tx.outbox.create({
    data: {
      id: evento.meta.eventId,
      tipoEvento: evento.tipo,
      payload: evento.payload as any,
      sucursalId: evento.meta.sucursalId,
      estado: 'PENDIENTE',
      ocurridoEn: new Date(evento.meta.ocurridoEn),
    },
  });
}

export interface CtxAuditoria {
  usuarioId: string;
  sucursalId: string;
  cajaId?: string;
}

/** Registra auditoría dentro de la transacción `tx`. */
export async function registrarAuditoria(
  tx: Tx,
  ctx: CtxAuditoria,
  input: { entidad: string; entidadId: string; accion: string; antes?: unknown; despues?: unknown },
): Promise<void> {
  await tx.registroAuditoria.create({
    data: {
      id: crypto.randomUUID(),
      entidad: input.entidad,
      entidadId: input.entidadId,
      accion: input.accion,
      antes: (input.antes ?? null) as any,
      despues: (input.despues ?? null) as any,
      usuarioId: ctx.usuarioId,
      cajaId: ctx.cajaId ?? null,
      sucursalId: ctx.sucursalId,
    },
  });
}

/** Notifica a los consumidores in-process DESPUÉS del commit. */
export function publicarPostCommit(evento: EventoDominio): void {
  bus.emit(evento.tipo, evento);
  bus.emit('*', evento);
}
