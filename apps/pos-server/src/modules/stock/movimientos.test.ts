/**
 * `descontarPorVenta` es la frontera entre Ventas y Stock: Ventas pide, Stock
 * escribe. Estos tests fijan lo que el contrato promete — que el descuento sea
 * atómico (usa `decrement`, no escribe un valor leído), que emita `StockDescontado`
 * con la marca de consignación que Proveedores necesita, y que deje auditoría por
 * variante.
 *
 * Sin base: `tx` y `reg` son dobles.
 */
import { describe, expect, it } from 'vitest';
import { descontarPorVenta } from './index.js';
import type { RegistroOperacion, Tx } from '../../shared/operacion.js';

const OCURRIDO = new Date('2026-07-28T15:00:00.000Z');

/** Doble de transacción: registra lo escrito y devuelve stock/variantes fijos. */
function txFalsa(opciones: { stock: Array<{ varianteId: string; cantidad: number }>; consignacion: string[] }) {
  const updates: Array<{ varianteId: string; decrement: number }> = [];
  const movimientos: Array<Record<string, unknown>> = [];

  const tx = {
    stockPorSucursal: {
      findMany: async () => opciones.stock,
      updateMany: async ({ where, data }: { where: { varianteId: string }; data: { cantidad: { decrement: number } } }) => {
        updates.push({ varianteId: where.varianteId, decrement: data.cantidad.decrement });
      },
    },
    variante: {
      findMany: async () => opciones.stock.map((s) => ({ id: s.varianteId, esConsignacion: opciones.consignacion.includes(s.varianteId) })),
    },
    movimientoStock: {
      create: async ({ data }: { data: Record<string, unknown> }) => { movimientos.push(data); },
    },
  };

  return { tx: tx as unknown as Tx, updates, movimientos };
}

/** Doble del registro de la operación. */
function regFalso() {
  const eventos: Array<{ tipo: string; payload: Record<string, unknown> }> = [];
  const auditorias: Array<Record<string, unknown>> = [];
  const reg = {
    meta: () => ({ eventId: 'ev-1', ocurridoEn: OCURRIDO.toISOString(), sucursalId: 's-1', usuarioId: 'u-1' }),
    emitir: (e: { tipo: string; payload: Record<string, unknown> }) => { eventos.push(e); },
    auditar: (a: Record<string, unknown>) => { auditorias.push(a); },
    sinCambios: () => undefined,
  };
  return { reg: reg as unknown as RegistroOperacion, eventos, auditorias };
}

describe('descontarPorVenta', () => {
  it('descuenta con decrement atómico, no escribiendo el valor leído', async () => {
    const { tx, updates } = txFalsa({ stock: [{ varianteId: 'v-1', cantidad: 10 }], consignacion: [] });
    const { reg } = regFalso();

    await descontarPorVenta(tx, reg, {
      ventaId: 'venta-1', sucursalId: 's-1', usuarioId: 'u-1', ocurridoEn: OCURRIDO,
      lineas: [{ varianteId: 'v-1', cantidad: 3 }],
    });

    expect(updates).toEqual([{ varianteId: 'v-1', decrement: 3 }]);
  });

  it('emite StockDescontado por línea, con la marca de consignación', async () => {
    const { tx } = txFalsa({
      stock: [{ varianteId: 'v-propia', cantidad: 10 }, { varianteId: 'v-consig', cantidad: 4 }],
      consignacion: ['v-consig'],
    });
    const { reg, eventos } = regFalso();

    await descontarPorVenta(tx, reg, {
      ventaId: 'venta-1', sucursalId: 's-1', usuarioId: 'u-1', ocurridoEn: OCURRIDO,
      lineas: [{ varianteId: 'v-propia', cantidad: 1 }, { varianteId: 'v-consig', cantidad: 2 }],
    });

    expect(eventos).toHaveLength(2);
    expect(eventos.every((e) => e.tipo === 'StockDescontado')).toBe(true);
    expect(eventos[0]!.payload).toMatchObject({ varianteId: 'v-propia', cantidad: 1, motivo: 'VENTA', ventaId: 'venta-1', esConsignacion: false });
    // Proveedores depende de este flag para generar el cargo de consignación (ADR-0006).
    expect(eventos[1]!.payload).toMatchObject({ varianteId: 'v-consig', esConsignacion: true });
  });

  it('deja auditoría por variante con antes y después', async () => {
    const { tx } = txFalsa({ stock: [{ varianteId: 'v-1', cantidad: 10 }], consignacion: [] });
    const { reg, auditorias } = regFalso();

    await descontarPorVenta(tx, reg, {
      ventaId: 'venta-1', sucursalId: 's-1', usuarioId: 'u-1', ocurridoEn: OCURRIDO,
      lineas: [{ varianteId: 'v-1', cantidad: 3 }],
    });

    expect(auditorias).toEqual([{
      entidad: 'StockPorSucursal', entidadId: 'v-1', accion: 'DESCUENTO_POR_VENTA',
      antes: { cantidad: 10 }, despues: { cantidad: 7 },
    }]);
  });

  it('escribe el ledger de movimientos con la referencia a la venta', async () => {
    const { tx, movimientos } = txFalsa({ stock: [{ varianteId: 'v-1', cantidad: 10 }], consignacion: [] });
    const { reg } = regFalso();

    await descontarPorVenta(tx, reg, {
      ventaId: 'venta-1', sucursalId: 's-1', usuarioId: 'u-1', ocurridoEn: OCURRIDO,
      lineas: [{ varianteId: 'v-1', cantidad: 3 }],
    });

    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({
      varianteId: 'v-1', sucursalId: 's-1', tipo: 'VENTA', cantidad: -3,
      referenciaId: 'venta-1', usuarioId: 'u-1',
    });
  });

  it('no escribe nada si la venta no tiene líneas', async () => {
    const { tx, updates, movimientos } = txFalsa({ stock: [], consignacion: [] });
    const { reg, eventos, auditorias } = regFalso();

    await descontarPorVenta(tx, reg, {
      ventaId: 'venta-1', sucursalId: 's-1', usuarioId: 'u-1', ocurridoEn: OCURRIDO, lineas: [],
    });

    expect([updates, movimientos, eventos, auditorias].every((a) => a.length === 0)).toBe(true);
  });
});
