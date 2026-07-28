import { nuevoUuid } from '@pos/core-domain';
import { descontarPorVenta } from '../modules/stock/index.js';
import { operacionDeDominio } from '../shared/operacion.js';

export interface ConfirmarVentaInput {
  sucursalId: string;
  cajaId: string;
  vendedorId: string;
  clienteId?: string | null;
  lineas: Array<{ varianteId: string; cantidad: number; requiereAjuste?: boolean }>;
  pagos: Array<{ medio: string; monto: number }>; // monto en centavos
}

/**
 * Confirma una venta de forma transaccional:
 *  - snapshot del precio vigente en cada línea (ADR-0003)
 *  - descuenta stock a nivel variante + ledger de movimiento
 *  - encola el evento VentaConfirmada en el Outbox y deja auditoría (misma tx)
 * El envoltorio `operacionDeDominio` garantiza que no pueda commitear sin auditoría
 * y publica el evento a los consumidores in-process después del commit.
 */
export async function confirmarVenta(input: ConfirmarVentaInput) {
  const ventaId = nuevoUuid();
  const ocurridoEn = new Date();
  const ctx = { usuarioId: input.vendedorId, sucursalId: input.sucursalId, cajaId: input.cajaId };

  return operacionDeDominio('confirmarVenta', ctx, async (tx, reg) => {
    // 1. Snapshot de precios vigentes y armado de líneas.
    const lineasData: Array<{
      id: string; varianteId: string; cantidad: number;
      precioUnitario: bigint; subtotalLinea: bigint; requiereAjuste: boolean;
    }> = [];
    let subtotal = 0n;
    let algunAjuste = false;

    for (const l of input.lineas) {
      const precio = await tx.precioVariante.findFirst({
        where: { varianteId: l.varianteId, vigenteHasta: null },
        orderBy: { vigenteDesde: 'desc' },
      });
      const precioUnitario = precio?.precio ?? 0n;
      const sub = precioUnitario * BigInt(l.cantidad);
      subtotal += sub;
      const requiereAjuste = l.requiereAjuste ?? false;
      algunAjuste ||= requiereAjuste;
      lineasData.push({
        id: nuevoUuid(), varianteId: l.varianteId, cantidad: l.cantidad,
        precioUnitario, subtotalLinea: sub, requiereAjuste,
      });
    }
    const total = subtotal;

    // 2. Pagos (si no vienen, un EFECTIVO por el total).
    const pagos =
      input.pagos.length > 0
        ? input.pagos.map((p) => ({ id: nuevoUuid(), medio: p.medio, monto: BigInt(Math.round(p.monto)) }))
        : [{ id: nuevoUuid(), medio: 'EFECTIVO', monto: total }];

    // 3. Crear la venta con sus líneas y pagos.
    await tx.venta.create({
      data: {
        id: ventaId,
        sucursalId: input.sucursalId,
        cajaId: input.cajaId,
        vendedorId: input.vendedorId,
        clienteId: input.clienteId ?? null,
        fechaHora: ocurridoEn,
        estadoVenta: 'CONFIRMADA',
        estadoEntrega: algunAjuste ? 'PENDIENTE_AJUSTE' : 'ENTREGADA',
        subtotal, totalDescuentos: 0n, total,
        lineas: { create: lineasData.map(({ id, varianteId, cantidad, precioUnitario, subtotalLinea, requiereAjuste }) => ({ id, varianteId, cantidad, precioUnitario, subtotalLinea, requiereAjuste })) },
        pagos: { create: pagos },
      },
    });

    // 4. Descontar stock: se lo pedimos a Stock, que es su dueño (ADR-0007).
    //    Va en ESTA transacción, así vender y descontar son un solo commit.
    await descontarPorVenta(tx, reg, {
      ventaId,
      sucursalId: input.sucursalId,
      usuarioId: input.vendedorId,
      ocurridoEn,
      lineas: lineasData.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
    });

    // 5. Evento de dominio -> Outbox (misma tx, lo escribe el envoltorio).
    reg.emitir({
      tipo: 'VentaConfirmada',
      meta: reg.meta({ ocurridoEn: ocurridoEn.toISOString() }),
      payload: {
        ventaId,
        clienteId: input.clienteId ?? undefined,
        lineas: lineasData.map((l) => ({
          varianteId: l.varianteId, cantidad: l.cantidad,
          precioUnitario: l.precioUnitario.toString(), subtotal: l.subtotalLinea.toString(),
        })),
        pagos: pagos.map((p) => ({ medio: p.medio, monto: p.monto.toString() })),
        total: total.toString(),
      },
    });

    // 6. Auditoría (misma tx, obligatoria: sin esto la operación se revierte).
    reg.auditar({
      entidad: 'Venta', entidadId: ventaId, accion: 'CONFIRMAR_VENTA',
      despues: { total: total.toString(), lineas: lineasData.length },
    });

    return {
      ventaId,
      total: total.toString(),
      estadoEntrega: algunAjuste ? 'PENDIENTE_AJUSTE' : 'ENTREGADA',
    };
  });
}
