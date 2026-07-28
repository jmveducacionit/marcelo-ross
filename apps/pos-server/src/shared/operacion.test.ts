/**
 * La invariante de ADR-0008: una operación de dominio no puede commitear sin dejar
 * rastro de auditoría. Estos tests son la razón de ser de `operacion.ts` — sin
 * ellos, la garantía es un comentario.
 *
 * No tocan la base: se inyecta un cliente falso que emula el rollback descartando
 * lo escrito cuando el cuerpo de la transacción lanza.
 */
import { describe, expect, it } from 'vitest';
import { AuditoriaFaltanteError, ejecutarOperacion } from './operacion.js';
import { bus } from './bus.js';

const ctx = { usuarioId: 'u-1', sucursalId: 's-1', cajaId: 'c-1' };

/** Cliente Prisma falso: registra escrituras y las revierte si la transacción lanza. */
function clienteFalso() {
  const outbox: unknown[] = [];
  const auditoria: unknown[] = [];

  const tx = {
    outbox: { create: async ({ data }: { data: unknown }) => { outbox.push(data); } },
    registroAuditoria: { create: async ({ data }: { data: unknown }) => { auditoria.push(data); } },
  };

  const cliente = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const antesOutbox = outbox.length;
      const antesAuditoria = auditoria.length;
      try {
        return await fn(tx);
      } catch (e) {
        // rollback
        outbox.length = antesOutbox;
        auditoria.length = antesAuditoria;
        throw e;
      }
    },
  };

  return { cliente: cliente as never, outbox, auditoria };
}

/** Captura los eventos publicados post-commit mientras corre `fn`. */
async function capturarPublicados(fn: () => Promise<unknown>) {
  const publicados: unknown[] = [];
  const escucha = (e: unknown) => { publicados.push(e); };
  bus.on('*', escucha);
  try {
    await fn();
  } finally {
    bus.off('*', escucha);
  }
  return publicados;
}

describe('operacionDeDominio', () => {
  it('commitea y publica post-commit cuando la operación audita', async () => {
    const { cliente, outbox, auditoria } = clienteFalso();

    const publicados = await capturarPublicados(() =>
      ejecutarOperacion(cliente, 'opConAuditoria', ctx, async (_tx, reg) => {
        reg.emitir({ tipo: 'StockIngresado', meta: reg.meta(), payload: { varianteId: 'v-1', cantidad: 3 } });
        reg.auditar({ entidad: 'StockPorSucursal', entidadId: 'v-1', accion: 'INGRESO_STOCK', despues: { cantidad: 3 } });
        return { ok: true };
      }),
    );

    expect(outbox).toHaveLength(1);
    expect(auditoria).toHaveLength(1);
    expect(publicados).toHaveLength(1);
  });

  it('revierte la transacción si la operación NO audita', async () => {
    const { cliente, outbox, auditoria } = clienteFalso();

    await expect(
      ejecutarOperacion(cliente, 'opSinAuditoria', ctx, async (_tx, reg) => {
        // Emite el evento pero se "olvida" de auditar: es el error que ADR-0008 quiere
        // hacer imposible.
        reg.emitir({ tipo: 'StockIngresado', meta: reg.meta(), payload: { varianteId: 'v-1', cantidad: 3 } });
        return { ok: true };
      }),
    ).rejects.toBeInstanceOf(AuditoriaFaltanteError);

    expect(outbox).toHaveLength(0);
    expect(auditoria).toHaveLength(0);
  });

  it('no publica nada post-commit si la transacción se revirtió', async () => {
    const { cliente } = clienteFalso();

    const publicados = await capturarPublicados(async () => {
      await ejecutarOperacion(cliente, 'opSinAuditoria', ctx, async (_tx, reg) => {
        reg.emitir({ tipo: 'StockIngresado', meta: reg.meta(), payload: { varianteId: 'v-1', cantidad: 3 } });
      }).catch(() => undefined);
    });

    expect(publicados).toHaveLength(0);
  });

  it('acepta un no-op solo si se declara con sinCambios()', async () => {
    const { cliente, outbox, auditoria } = clienteFalso();

    const r = await ejecutarOperacion(cliente, 'ajusteSinDelta', ctx, async (_tx, reg) => {
      reg.sinCambios('el conteo coincide con el stock registrado');
      return { nueva: 5 };
    });

    expect(r).toEqual({ nueva: 5 });
    expect(outbox).toHaveLength(0);
    expect(auditoria).toHaveLength(0);
  });

  it('propaga el error del cuerpo sin escribir nada', async () => {
    const { cliente, outbox, auditoria } = clienteFalso();

    await expect(
      ejecutarOperacion(cliente, 'opQueFalla', ctx, async (_tx, reg) => {
        reg.auditar({ entidad: 'X', entidadId: 'x-1', accion: 'ALGO' });
        throw new Error('Stock insuficiente en origen (hay 0).');
      }),
    ).rejects.toThrow('Stock insuficiente');

    expect(outbox).toHaveLength(0);
    expect(auditoria).toHaveLength(0);
  });

  it('la metadata del evento lleva el contexto de la operación', async () => {
    const { cliente } = clienteFalso();
    let meta: Record<string, unknown> | undefined;

    await ejecutarOperacion(cliente, 'opMeta', ctx, async (_tx, reg) => {
      meta = reg.meta() as unknown as Record<string, unknown>;
      reg.auditar({ entidad: 'X', entidadId: 'x-1', accion: 'ALGO' });
    });

    expect(meta).toMatchObject({ usuarioId: 'u-1', sucursalId: 's-1', cajaId: 'c-1' });
    expect(typeof meta?.eventId).toBe('string');
  });
});
