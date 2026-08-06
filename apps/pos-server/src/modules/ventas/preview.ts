/**
 * Previsualización de una venta: los mismos números que va a dar `confirmar`,
 * sin escribir nada.
 *
 * Existe para que el front pueda mostrar el total con descuentos mientras el
 * cajero arma el ticket, **sin reimplementar la aritmética de dinero en el
 * navegador**. Duplicar el motor sería la forma más rápida de que la pantalla y
 * el ticket dejen de coincidir: dos implementaciones del mismo redondeo divergen
 * en el primer caso raro, y el cliente ve un número distinto del que paga.
 *
 * Es de solo lectura: no abre `operacionDeDominio` porque no hay nada que
 * auditar. Mirar un precio no es un hecho de negocio.
 */
import { CERO, money, multiplicarPorCantidad, sumar, type Money } from '@pos/core-domain';
import { prisma } from '../../db.js';
import { calcularDescuentos, type DefinicionDescuento, type DescuentoPedido } from './descuentos.js';

export interface PreviewVentaInput {
  lineas: Array<{ varianteId: string; cantidad: number }>;
  descuentos?: Array<{ descuentoId: string; indiceLinea?: number; autorizadoPor?: string }>;
}

export interface PreviewVentaResultado {
  subtotal: string;
  totalDescuentos: string;
  total: string;
  /** Reintegros bancarios: se informan, NO se restan del total. */
  reintegros: Array<{ descuentoId: string; monto: string }>;
  /** Descuento efectivo por línea, en el mismo orden que `lineas`. */
  porLinea: string[];
}

export async function previsualizarVenta(input: PreviewVentaInput): Promise<PreviewVentaResultado> {
  const lineasData: Array<{ id: string; cantidad: number; precioUnitario: Money; subtotalLinea: Money }> = [];
  let subtotal: Money = CERO;

  for (const [i, l] of input.lineas.entries()) {
    const precio = await prisma.precioVariante.findFirst({
      where: { varianteId: l.varianteId, vigenteHasta: null },
      orderBy: { vigenteDesde: 'desc' },
    });
    const precioUnitario = money(precio?.precio ?? 0n);
    const sub = multiplicarPorCantidad(precioUnitario, l.cantidad);
    subtotal = sumar(subtotal, sub);
    // El id es posicional: acá no hay filas todavía.
    lineasData.push({ id: String(i), cantidad: l.cantidad, precioUnitario, subtotalLinea: sub });
  }

  const pedidos: DescuentoPedido[] = (input.descuentos ?? []).map((d) => ({
    descuentoId: d.descuentoId,
    ...(d.indiceLinea != null ? { lineaId: String(d.indiceLinea) } : {}),
    ...(d.autorizadoPor ? { autorizadoPor: d.autorizadoPor } : {}),
  }));

  if (pedidos.length === 0) {
    return {
      subtotal: subtotal.toString(), totalDescuentos: '0', total: subtotal.toString(),
      reintegros: [], porLinea: lineasData.map(() => '0'),
    };
  }

  const filas = await prisma.descuento.findMany({
    where: { id: { in: [...new Set(pedidos.map((p) => p.descuentoId))] } },
  });
  const catalogo = new Map<string, DefinicionDescuento>(
    filas.map((f) => [f.id, {
      id: f.id, nombre: f.nombre, tipo: f.tipo as DefinicionDescuento['tipo'],
      reglas: (f.reglas ?? {}) as Record<string, unknown>,
      requiereAutorizacion: f.requiereAutorizacion,
      vigenciaDesde: f.vigenciaDesde, vigenciaHasta: f.vigenciaHasta,
    }]),
  );

  const r = calcularDescuentos(lineasData, pedidos, catalogo);
  return {
    subtotal: subtotal.toString(),
    totalDescuentos: r.totalDescuentos.toString(),
    total: (subtotal - r.totalDescuentos).toString(),
    reintegros: r.reintegros.map((x) => ({ descuentoId: x.descuentoId, monto: x.monto.toString() })),
    porLinea: lineasData.map((l) => (r.porLinea.get(l.id) ?? CERO).toString()),
  };
}
