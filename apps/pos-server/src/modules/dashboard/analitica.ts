/**
 * Analítica del negocio: márgenes y rotación.
 *
 * El margen recién es calculable desde que existen los remitos: hasta entonces
 * el sistema sabía a cuánto vendía pero no a cuánto había comprado. El costo
 * sale del último remito de cada variante — el mismo criterio que usa la
 * liquidación de consignación, así los dos números cuentan la misma historia.
 *
 * Lo vendido SIN costo conocido se informa aparte en vez de asumir cero, porque
 * un costo cero infla el margen al 100 % y ese número miente hacia arriba, que
 * es la dirección peligrosa.
 *
 * La mercadería en CONSIGNACIÓN se separa siempre (ADR-0006): su costo existe,
 * pero no es inventario propio y mezclarla distorsiona tanto el margen como la
 * valuación.
 */
import { prisma } from '../../db.js';

export interface RangoPeriodo { desde: Date; hasta: Date }

export function rangoDelMes(periodo?: string): RangoPeriodo {
  const h = new Date();
  const m = periodo ? /^(\d{4})-(\d{2})$/.exec(periodo) : null;
  const anio = m ? Number(m[1]) : h.getFullYear();
  const mes = m ? Number(m[2]) : h.getMonth() + 1;
  return { desde: new Date(anio, mes - 1, 1), hasta: new Date(anio, mes, 0, 23, 59, 59, 999) };
}

/** Último costo conocido por variante, tomado del remito más reciente. */
async function costosPorVariante(varianteIds: string[]): Promise<Map<string, bigint>> {
  if (varianteIds.length === 0) return new Map();
  const lineas = await prisma.lineaRemito.findMany({
    where: { varianteId: { in: varianteIds } },
    orderBy: { remito: { fecha: 'desc' } },
    select: { varianteId: true, costoUnitario: true },
  });
  const costo = new Map<string, bigint>();
  for (const l of lineas) if (!costo.has(l.varianteId)) costo.set(l.varianteId, l.costoUnitario);
  return costo;
}

export interface MargenPorMarca {
  marca: string;
  vendido: string;
  costo: string;
  margen: string;
  /** Margen sobre venta, en %. */
  margenPct: number;
  unidades: number;
  esConsignacion: boolean;
}

export async function margenes(rango: RangoPeriodo, sucursalId?: string) {
  const lineas = await prisma.lineaVenta.findMany({
    where: {
      venta: {
        fechaHora: { gte: rango.desde, lte: rango.hasta },
        estadoVenta: 'CONFIRMADA',
        ...(sucursalId ? { sucursalId } : {}),
      },
    },
    select: { varianteId: true, cantidad: true, subtotalLinea: true },
  });
  if (lineas.length === 0) {
    return { porMarca: [] as MargenPorMarca[], totales: { vendido: '0', costo: '0', margen: '0', margenPct: 0 }, sinCosto: { unidades: 0, vendido: '0' } };
  }

  const varianteIds = [...new Set(lineas.map((l) => l.varianteId))];
  const [variantes, costo] = await Promise.all([
    prisma.variante.findMany({
      where: { id: { in: varianteIds } },
      select: { id: true, esConsignacion: true, productoPadre: { select: { marca: { select: { nombre: true } } } } },
    }),
    costosPorVariante(varianteIds),
  ]);
  const infoDe = new Map(variantes.map((v) => [v.id, { marca: v.productoPadre.marca.nombre, esConsignacion: v.esConsignacion }]));

  const acum = new Map<string, { vendido: bigint; costo: bigint; unidades: number; esConsignacion: boolean }>();
  let sinCostoUnidades = 0, sinCostoVendido = 0n;

  for (const l of lineas) {
    const info = infoDe.get(l.varianteId);
    if (!info) continue;
    const c = costo.get(l.varianteId);
    if (c == null) {
      // No se asume costo cero: eso daría 100 % de margen y mentiría hacia arriba.
      sinCostoUnidades += l.cantidad;
      sinCostoVendido += l.subtotalLinea;
      continue;
    }
    const clave = `${info.marca}|${info.esConsignacion}`;
    const prev = acum.get(clave) ?? { vendido: 0n, costo: 0n, unidades: 0, esConsignacion: info.esConsignacion };
    acum.set(clave, {
      vendido: prev.vendido + l.subtotalLinea,
      costo: prev.costo + c * BigInt(l.cantidad),
      unidades: prev.unidades + l.cantidad,
      esConsignacion: info.esConsignacion,
    });
  }

  const porMarca: MargenPorMarca[] = [...acum.entries()].map(([clave, v]) => {
    const margen = v.vendido - v.costo;
    return {
      marca: clave.split('|')[0]!,
      vendido: v.vendido.toString(),
      costo: v.costo.toString(),
      margen: margen.toString(),
      margenPct: v.vendido > 0n ? Number((margen * 1000n) / v.vendido) / 10 : 0,
      unidades: v.unidades,
      esConsignacion: v.esConsignacion,
    };
  }).sort((a, b) => Number(BigInt(b.margen) - BigInt(a.margen)));

  const totVendido = porMarca.reduce((a, m) => a + BigInt(m.vendido), 0n);
  const totCosto = porMarca.reduce((a, m) => a + BigInt(m.costo), 0n);
  const totMargen = totVendido - totCosto;

  return {
    porMarca,
    totales: {
      vendido: totVendido.toString(), costo: totCosto.toString(), margen: totMargen.toString(),
      margenPct: totVendido > 0n ? Number((totMargen * 1000n) / totVendido) / 10 : 0,
    },
    sinCosto: { unidades: sinCostoUnidades, vendido: sinCostoVendido.toString() },
  };
}

/**
 * Rotación: qué se mueve y qué no.
 *
 * Se mide en unidades vendidas contra stock disponible. Un talle con mucho stock
 * y poca venta es plata parada; uno con poco stock y mucha venta es venta
 * perdida. Los dos extremos importan y por eso se devuelven juntos.
 */
export async function rotacion(rango: RangoPeriodo, sucursalId?: string) {
  const movimientos = await prisma.movimientoStock.groupBy({
    by: ['varianteId'],
    where: { tipo: 'VENTA', ocurridoEn: { gte: rango.desde, lte: rango.hasta }, ...(sucursalId ? { sucursalId } : {}) },
    _sum: { cantidad: true },
  });
  const vendidasDe = new Map(movimientos.map((m) => [m.varianteId, Math.abs(m._sum.cantidad ?? 0)]));

  const stock = await prisma.stockPorSucursal.findMany({
    where: { ...(sucursalId ? { sucursalId } : {}) },
    select: { varianteId: true, cantidad: true },
  });
  const stockDe = new Map<string, number>();
  for (const s of stock) stockDe.set(s.varianteId, (stockDe.get(s.varianteId) ?? 0) + s.cantidad);

  const ids = [...new Set([...vendidasDe.keys(), ...stockDe.keys()])];
  const variantes = await prisma.variante.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      talle: { select: { etiqueta: true } },
      productoPadre: { select: { marca: { select: { nombre: true } }, temporada: { select: { nombre: true, anio: true } } } },
    },
  });

  const porTalle = new Map<string, { vendidas: number; stock: number }>();
  const porTemporada = new Map<string, { vendidas: number; stock: number }>();

  for (const v of variantes) {
    const vendidas = vendidasDe.get(v.id) ?? 0;
    const st = stockDe.get(v.id) ?? 0;
    const talle = v.talle.etiqueta;
    const temp = v.productoPadre.temporada ? `${v.productoPadre.temporada.nombre} ${v.productoPadre.temporada.anio}` : 'Sin temporada';

    const t = porTalle.get(talle) ?? { vendidas: 0, stock: 0 };
    porTalle.set(talle, { vendidas: t.vendidas + vendidas, stock: t.stock + st });
    const s = porTemporada.get(temp) ?? { vendidas: 0, stock: 0 };
    porTemporada.set(temp, { vendidas: s.vendidas + vendidas, stock: s.stock + st });
  }

  const armar = (m: Map<string, { vendidas: number; stock: number }>) =>
    [...m.entries()]
      .map(([clave, v]) => ({
        clave, vendidas: v.vendidas, stock: v.stock,
        // Unidades vendidas por unidad en stock. Alto = se mueve.
        indice: v.stock > 0 ? Math.round((v.vendidas / v.stock) * 100) / 100 : (v.vendidas > 0 ? 999 : 0),
      }))
      .sort((a, b) => b.vendidas - a.vendidas);

  return { porTalle: armar(porTalle), porTemporada: armar(porTemporada) };
}
