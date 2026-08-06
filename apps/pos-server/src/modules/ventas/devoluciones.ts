/**
 * Devoluciones y cambios.
 *
 * En indumentaria la devolución es rutina, no excepción: el talle no era, la
 * prenda no gustó en casa. Por eso tiene que ser tan sólida como la venta.
 *
 * Tres resoluciones, con consecuencias distintas:
 *
 *  - `CREDITO_A_FAVOR`: nace saldo en la cuenta del cliente. Exige cliente
 *    identificado — un crédito anónimo no se le puede pagar a nadie.
 *  - `NOTA_CREDITO`: se devuelve el dinero. Facturación emitirá la NC cuando
 *    exista; hoy queda registrada la devolución.
 *  - `CAMBIO`: la mercadería vuelve y el cliente se lleva otra. Acá se registra
 *    solo el reingreso; la venta nueva se hace aparte.
 *
 * **Con ticket**, el precio devuelto sale del snapshot de la venta original, no
 * del precio de hoy: si la prenda aumentó, no se devuelve más de lo que se pagó,
 * y si bajó, no se devuelve menos. Es el mismo criterio de ADR-0003.
 *
 * **Sin ticket** se usa el precio vigente y queda marcado (`conTicket: false`),
 * porque es el caso que más se presta a abuso y el encargado tiene que poder
 * encontrarlo después.
 */
import { CERO, money, multiplicarPorCantidad, nuevoUuid, sumar, type Money } from '@pos/core-domain';
import { operacionDeDominio } from '../../shared/operacion.js';
import { acreditarPorDevolucion } from '../clientes/index.js';
import { reingresarPorDevolucion } from '../stock/index.js';

export type ResolucionDevolucion = 'NOTA_CREDITO' | 'CREDITO_A_FAVOR' | 'CAMBIO';

export interface RegistrarDevolucionInput {
  sucursalId: string;
  cajaId: string;
  usuarioId: string;
  /** Venta original. Si no viene, es una devolución SIN ticket. */
  ventaOrigenId?: string | null;
  clienteId?: string | null;
  resolucion: ResolucionDevolucion;
  motivo?: string | null;
  lineas: Array<{ varianteId: string; cantidad: number }>;
}

export class ErrorDevolucion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDevolucion';
  }
}

export async function registrarDevolucion(input: RegistrarDevolucionInput) {
  if (!input.lineas?.length) {
    throw new ErrorDevolucion('La devolución no tiene líneas.');
  }
  for (const l of input.lineas) {
    if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) {
      throw new ErrorDevolucion('Las cantidades a devolver tienen que ser enteros positivos.');
    }
  }
  if (input.resolucion === 'CREDITO_A_FAVOR' && !input.clienteId) {
    throw new ErrorDevolucion('Para dejar crédito a favor hace falta identificar al cliente.');
  }

  const devolucionId = nuevoUuid();
  const ocurridoEn = new Date();
  const ctx = { usuarioId: input.usuarioId, sucursalId: input.sucursalId, cajaId: input.cajaId };

  return operacionDeDominio('registrarDevolucion', ctx, async (tx, reg) => {
    const conTicket = Boolean(input.ventaOrigenId);

    // --- Precio a devolver por línea ---
    const lineasData: Array<{
      id: string; varianteId: string; cantidad: number;
      precioUnitario: Money; lineaVentaOrigenId: string | null;
    }> = [];

    if (conTicket) {
      const venta = await tx.venta.findUnique({
        where: { id: input.ventaOrigenId! },
        include: { lineas: true },
      });
      if (!venta) throw new ErrorDevolucion('No encontré la venta original.');
      if (venta.estadoVenta !== 'CONFIRMADA') {
        throw new ErrorDevolucion('La venta original no está confirmada.');
      }

      // Lo ya devuelto de esta venta acota lo que todavía se puede devolver.
      // Sin este control se puede devolver dos veces la misma prenda.
      const previas = await tx.lineaDevolucion.findMany({
        where: { devolucion: { ventaOrigenId: venta.id } },
        select: { varianteId: true, cantidad: true },
      });
      const yaDevuelto = new Map<string, number>();
      for (const p of previas) yaDevuelto.set(p.varianteId, (yaDevuelto.get(p.varianteId) ?? 0) + p.cantidad);

      for (const l of input.lineas) {
        const original = venta.lineas.find((x) => x.varianteId === l.varianteId);
        if (!original) {
          throw new ErrorDevolucion('Una de las prendas no figura en la venta original.');
        }
        const disponible = original.cantidad - (yaDevuelto.get(l.varianteId) ?? 0);
        if (l.cantidad > disponible) {
          throw new ErrorDevolucion(
            `Se intenta devolver ${l.cantidad} unidad(es) pero solo quedan ${disponible} sin devolver de esa prenda.`,
          );
        }
        lineasData.push({
          id: nuevoUuid(), varianteId: l.varianteId, cantidad: l.cantidad,
          // Snapshot de la venta original: se devuelve lo que se pagó.
          precioUnitario: money(original.precioUnitario),
          lineaVentaOrigenId: original.id,
        });
      }
    } else {
      for (const l of input.lineas) {
        const precio = await tx.precioVariante.findFirst({
          where: { varianteId: l.varianteId, vigenteHasta: null },
          orderBy: { vigenteDesde: 'desc' },
        });
        lineasData.push({
          id: nuevoUuid(), varianteId: l.varianteId, cantidad: l.cantidad,
          precioUnitario: money(precio?.precio ?? 0n),
          lineaVentaOrigenId: null,
        });
      }
    }

    const total = lineasData.reduce(
      (acc, l) => sumar(acc, multiplicarPorCantidad(l.precioUnitario, l.cantidad)),
      CERO,
    );

    // --- Persistir la devolución ---
    await tx.devolucion.create({
      data: {
        id: devolucionId,
        ventaOrigenId: input.ventaOrigenId ?? null,
        clienteId: input.clienteId ?? null,
        sucursalId: input.sucursalId,
        cajaId: input.cajaId,
        usuarioId: input.usuarioId,
        fecha: ocurridoEn,
        conTicket,
        resolucion: input.resolucion,
        motivo: input.motivo ?? null,
        total,
        lineas: {
          create: lineasData.map(({ id, varianteId, cantidad, precioUnitario, lineaVentaOrigenId }) => ({
            id, varianteId, cantidad, precioUnitario, lineaVentaOrigenId,
          })),
        },
      },
    });

    // --- La mercadería vuelve al stock (por el puerto de Stock) ---
    await reingresarPorDevolucion(tx, reg, {
      devolucionId, sucursalId: input.sucursalId, usuarioId: input.usuarioId, ocurridoEn,
      lineas: lineasData.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
    });

    // --- Crédito a favor, si corresponde (por el puerto de Clientes) ---
    let saldoCredito: Money | null = null;
    if (input.resolucion === 'CREDITO_A_FAVOR') {
      saldoCredito = await acreditarPorDevolucion(tx, reg, {
        clienteId: input.clienteId!, monto: total, devolucionId,
        usuarioId: input.usuarioId, ocurridoEn,
      });
    }

    reg.emitir({
      tipo: 'DevolucionRegistrada',
      meta: reg.meta({ ocurridoEn: ocurridoEn.toISOString() }),
      payload: {
        devolucionId,
        ventaOrigenId: input.ventaOrigenId ?? undefined,
        lineas: lineasData.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
        resolucion: input.resolucion,
        total: total.toString(),
        conTicket,
      },
    });

    reg.auditar({
      entidad: 'Devolucion', entidadId: devolucionId, accion: 'REGISTRAR_DEVOLUCION',
      despues: {
        total: total.toString(), resolucion: input.resolucion, conTicket,
        lineas: lineasData.length, ventaOrigenId: input.ventaOrigenId ?? null,
      },
    });

    return {
      devolucionId,
      total: total.toString(),
      resolucion: input.resolucion,
      conTicket,
      saldoCredito: saldoCredito?.toString() ?? null,
    };
  });
}
