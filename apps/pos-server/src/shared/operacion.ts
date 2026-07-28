/**
 * Envoltorio transaccional para operaciones de dominio con impacto en DINERO o STOCK.
 *
 * ADR-0008 exige que toda operación de ese tipo deje rastro de auditoría, y advierte
 * que "cada módulo audita a su manera" lleva a que se olvide. Llamar a
 * `registrarAuditoria()` a mano comparte el código pero no garantiza el paso: nada
 * impide escribir un servicio nuevo que se la saltee, y una escritura sin auditar es
 * invisible hasta que alguien necesita el rastro y no está.
 *
 * Acá la garantía es de runtime: si el cuerpo de la operación no registró al menos
 * una entrada de auditoría (o no declaró explícitamente que no hubo cambios), se
 * lanza `AuditoriaFaltanteError` DENTRO de la transacción y todo se revierte.
 * Olvidarse de auditar deja de ser un agujero silencioso y pasa a ser un error ruidoso.
 *
 * Además centraliza lo que hoy se repite en cada servicio:
 *  - abrir la transacción,
 *  - armar la metadata del evento (eventId UUIDv7, ocurridoEn, sucursal, caja, usuario),
 *  - escribir Outbox y RegistroAuditoria en la MISMA transacción (ADR-0001 / ADR-0008),
 *  - publicar a los consumidores in-process DESPUÉS del commit.
 *
 * Uso:
 *
 *   return operacionDeDominio('ingresarStock', ctx, async (tx, reg) => {
 *     ...escrituras con tx...
 *     reg.emitir({ tipo: 'StockIngresado', meta: reg.meta(), payload: {...} });
 *     reg.auditar({ entidad: 'StockPorSucursal', entidadId, accion: 'INGRESO_STOCK',
 *                   antes: { cantidad: actual }, despues: { cantidad: nueva } });
 *     return { nueva };
 *   });
 */
import type { EventoDominio, EventoMeta, TipoEvento } from '@pos/core-domain';
import { nuevoUuid } from '@pos/core-domain';
import { prisma } from '../db.js';
import { encolarEvento, publicarPostCommit, registrarAuditoria, type CtxAuditoria } from './bus.js';

/** Cliente de transacción de Prisma. */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Forma de un evento tal como viaja al Outbox: el payload se persiste como JSON.
 * `EventoDominio` (el contrato tipado de `@pos/core-domain`) sigue siendo la
 * referencia para los consumidores; acá se acepta la forma serializable para no
 * obligar a un cast en cada servicio.
 */
export interface EventoParaOutbox {
  tipo: TipoEvento;
  meta: EventoMeta;
  payload: Record<string, unknown>;
}

export interface EntradaAuditoria {
  entidad: string;
  entidadId: string;
  accion: string;
  antes?: unknown;
  despues?: unknown;
}

/** Se lanza cuando una operación de dominio termina sin dejar rastro. Revierte la tx. */
export class AuditoriaFaltanteError extends Error {
  constructor(public readonly operacion: string) {
    super(
      `La operación de dominio "${operacion}" terminó sin registrar auditoría. ` +
        `Toda operación con impacto en dinero o stock debe llamar a reg.auditar() ` +
        `(ADR-0008). Si legítimamente no hubo cambios, declaralo con reg.sinCambios("motivo"). ` +
        `La transacción se revirtió.`,
    );
    this.name = 'AuditoriaFaltanteError';
  }
}

/**
 * Overrides de metadata. Se aceptan como `string` porque los servicios reciben los
 * ids del borde HTTP sin brandear; el branding a `Uuid` se resuelve acá, en un solo
 * lugar, en vez de con un cast en cada llamada.
 */
export interface MetaOverride {
  ocurridoEn?: string;
  sucursalId?: string;
  cajaId?: string;
  correlationId?: string;
}

export interface RegistroOperacion {
  /** Metadata de evento: eventId UUIDv7 nuevo + contexto de la operación. */
  meta(extra?: MetaOverride): EventoMeta;
  /** Deja rastro de auditoría. Obligatorio: sin al menos uno, la operación se revierte. */
  auditar(entrada: EntradaAuditoria): void;
  /** Encola un evento en el Outbox (misma tx) y lo publica después del commit. */
  emitir(evento: EventoParaOutbox): void;
  /**
   * Declara que la operación terminó sin cambios reales, así que no corresponde
   * auditar. Es explícito a propósito: un no-op se declara, no se omite.
   */
  sinCambios(motivo: string): void;
}

/**
 * Núcleo de la operación, parametrizado por el cliente de Prisma para poder testearlo
 * sin base. Usar `operacionDeDominio` en el código de producción.
 */
export async function ejecutarOperacion<T>(
  cliente: Pick<typeof prisma, '$transaction'>,
  nombre: string,
  ctx: CtxAuditoria,
  cuerpo: (tx: Tx, reg: RegistroOperacion) => Promise<T>,
): Promise<T> {
  const salida = await cliente.$transaction(async (tx: Tx) => {
    const auditorias: EntradaAuditoria[] = [];
    const eventos: EventoParaOutbox[] = [];
    let noOp: string | null = null;

    const reg: RegistroOperacion = {
      meta: (extra) => ({
        eventId: nuevoUuid(),
        ocurridoEn: new Date().toISOString(),
        sucursalId: ctx.sucursalId,
        ...(ctx.cajaId ? { cajaId: ctx.cajaId } : {}),
        usuarioId: ctx.usuarioId,
        ...extra,
      }) as EventoMeta,
      auditar: (entrada) => { auditorias.push(entrada); },
      emitir: (evento) => { eventos.push(evento); },
      sinCambios: (motivo) => { noOp = motivo; },
    };

    const resultado = await cuerpo(tx, reg);

    if (auditorias.length === 0 && noOp === null) {
      throw new AuditoriaFaltanteError(nombre);
    }

    // Outbox y auditoría, en la misma transacción que las escrituras de negocio.
    for (const evento of eventos) {
      await encolarEvento(tx as never, evento as unknown as EventoDominio);
    }
    for (const entrada of auditorias) {
      await registrarAuditoria(tx as never, ctx, entrada);
    }

    return { resultado, eventos };
  });

  // Post-commit: recién acá se notifica a los consumidores in-process (at-least-once).
  for (const evento of salida.eventos) {
    publicarPostCommit(evento as unknown as EventoDominio);
  }
  return salida.resultado;
}

/** Ejecuta una operación de dominio contra la base real. */
export function operacionDeDominio<T>(
  nombre: string,
  ctx: CtxAuditoria,
  cuerpo: (tx: Tx, reg: RegistroOperacion) => Promise<T>,
): Promise<T> {
  return ejecutarOperacion(prisma, nombre, ctx, cuerpo);
}
