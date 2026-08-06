import { CERO, money, multiplicarPorCantidad, nuevoUuid, restar, sumar, type Money } from '@pos/core-domain';
import { registrarCobros } from '../caja/index.js';
import { descontarPorVenta } from '../stock/index.js';
import { operacionDeDominio } from '../../shared/operacion.js';
import { calcularDescuentos, type DefinicionDescuento, type DescuentoPedido } from './descuentos.js';

export interface ConfirmarVentaInput {
  sucursalId: string;
  cajaId: string;
  vendedorId: string;
  clienteId?: string | null;
  /** `indiceLinea` referencia la posición en `lineas`; el id real se genera acá. */
  lineas: Array<{ varianteId: string; cantidad: number; requiereAjuste?: boolean }>;
  pagos: Array<{ medio: string; monto: number }>; // monto en centavos
  /** Descuentos pedidos por el cajero. Ver ADR-0004. */
  descuentos?: Array<{ descuentoId: string; indiceLinea?: number; autorizadoPor?: string }>;
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
      precioUnitario: Money; subtotalLinea: Money; requiereAjuste: boolean;
    }> = [];
    let subtotal: Money = CERO;
    let algunAjuste = false;

    for (const l of input.lineas) {
      const precio = await tx.precioVariante.findFirst({
        where: { varianteId: l.varianteId, vigenteHasta: null },
        orderBy: { vigenteDesde: 'desc' },
      });
      const precioUnitario = money(precio?.precio ?? 0n);
      const sub = multiplicarPorCantidad(precioUnitario, l.cantidad);
      subtotal = sumar(subtotal, sub);
      const requiereAjuste = l.requiereAjuste ?? false;
      algunAjuste ||= requiereAjuste;
      lineasData.push({
        id: nuevoUuid(), varianteId: l.varianteId, cantidad: l.cantidad,
        precioUnitario, subtotalLinea: sub, requiereAjuste,
      });
    }
    // 2. Descuentos (ADR-0004). El catálogo se lee de la base: son datos, no código.
    const pedidos: DescuentoPedido[] = (input.descuentos ?? []).map((d) => {
      const linea = d.indiceLinea != null ? lineasData[d.indiceLinea] : undefined;
      if (d.indiceLinea != null && !linea) {
        throw new Error(`El descuento apunta a la línea ${d.indiceLinea}, que no existe en esta venta.`);
      }
      return {
        descuentoId: d.descuentoId,
        ...(linea ? { lineaId: linea.id } : {}),
        ...(d.autorizadoPor ? { autorizadoPor: d.autorizadoPor } : {}),
      };
    });

    let descuentos = { totalDescuentos: CERO as Money, aplicaciones: [] as ReturnType<typeof calcularDescuentos>['aplicaciones'], porLinea: new Map<string, Money>() };
    if (pedidos.length > 0) {
      const filas = await tx.descuento.findMany({
        where: { id: { in: [...new Set(pedidos.map((p) => p.descuentoId))] } },
      });
      const catalogo = new Map<string, DefinicionDescuento>(
        filas.map((f) => [f.id, {
          id: f.id,
          nombre: f.nombre,
          tipo: f.tipo as DefinicionDescuento['tipo'],
          reglas: (f.reglas ?? {}) as Record<string, unknown>,
          requiereAutorizacion: f.requiereAutorizacion,
          vigenciaDesde: f.vigenciaDesde,
          vigenciaHasta: f.vigenciaHasta,
        }]),
      );
      descuentos = calcularDescuentos(lineasData, pedidos, catalogo, ocurridoEn);
    }

    const totalDescuentos = descuentos.totalDescuentos;
    const total = restar(subtotal, totalDescuentos);

    // 3. Pagos (si no vienen, un EFECTIVO por el total).
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
        subtotal, totalDescuentos, total,
        lineas: { create: lineasData.map(({ id, varianteId, cantidad, precioUnitario, subtotalLinea, requiereAjuste }) => ({ id, varianteId, cantidad, precioUnitario, subtotalLinea, requiereAjuste })) },
        pagos: { create: pagos },
      },
    });

    // Aplicaciones de descuento: se guarda el MONTO, no la fórmula (ADR-0004),
    // para que el ticket sea reproducible aunque las reglas cambien después.
    if (descuentos.aplicaciones.length > 0) {
      await tx.descuentoAplicado.createMany({
        data: descuentos.aplicaciones.map((a) => ({
          id: nuevoUuid(),
          lineaVentaId: a.lineaVentaId ?? null,
          ventaId: a.lineaVentaId ? null : ventaId,
          descuentoId: a.descuentoId,
          tipo: a.tipo,
          montoDescontado: a.montoDescontado,
          autorizadoPor: a.autorizadoPor ?? null,
        })),
      });
    }

    // Cobros -> Caja, en esta misma transacción. Falla si no hay caja abierta:
    // un cobro fuera de sesión no aparece en ningún arqueo.
    await registrarCobros(tx, reg, {
      ventaId, cajaId: input.cajaId, usuarioId: input.vendedorId, ocurridoEn,
      pagos: pagos.map((p) => ({ medio: p.medio, monto: money(p.monto) })),
    });

    // 5. Descontar stock: se lo pedimos a Stock, que es su dueño (ADR-0007).
    //    Va en ESTA transacción, así vender y descontar son un solo commit.
    await descontarPorVenta(tx, reg, {
      ventaId,
      sucursalId: input.sucursalId,
      usuarioId: input.vendedorId,
      ocurridoEn,
      lineas: lineasData.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
    });

    // 6. Evento de dominio -> Outbox (misma tx, lo escribe el envoltorio).
    reg.emitir({
      tipo: 'VentaConfirmada',
      meta: reg.meta({ ocurridoEn: ocurridoEn.toISOString() }),
      payload: {
        ventaId,
        clienteId: input.clienteId ?? undefined,
        lineas: lineasData.map((l) => ({
          varianteId: l.varianteId, cantidad: l.cantidad,
          precioUnitario: l.precioUnitario.toString(), subtotal: l.subtotalLinea.toString(),
          // El descuento efectivo de la línea incluye el prorrateo del de ticket:
          // sin eso el margen por producto sería mentira (ADR-0004).
          descuento: (descuentos.porLinea.get(l.id) ?? CERO).toString(),
        })),
        pagos: pagos.map((p) => ({ medio: p.medio, monto: p.monto.toString() })),
        totalDescuentos: totalDescuentos.toString(),
        total: total.toString(),
      },
    });

    // 7. Auditoría (misma tx, obligatoria: sin esto la operación se revierte).
    reg.auditar({
      entidad: 'Venta', entidadId: ventaId, accion: 'CONFIRMAR_VENTA',
      despues: {
        total: total.toString(), lineas: lineasData.length,
        totalDescuentos: totalDescuentos.toString(),
        descuentos: descuentos.aplicaciones.length,
      },
    });

    return {
      ventaId,
      subtotal: subtotal.toString(),
      totalDescuentos: totalDescuentos.toString(),
      total: total.toString(),
      reintegros: (descuentos as { reintegros?: Array<{ monto: Money }> }).reintegros?.map((r) => r.monto.toString()) ?? [],
      estadoEntrega: algunAjuste ? 'PENDIENTE_AJUSTE' : 'ENTREGADA',
    };
  });
}
