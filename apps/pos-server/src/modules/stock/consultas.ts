import { prisma } from '../../db.js';

function estadoStock(total: number): 'ok' | 'bajo' | 'agotado' {
  if (total <= 0) return 'agotado';
  if (total <= 5) return 'bajo';
  return 'ok';
}

/** Lista de productos con su stock total en la sucursal (columna izquierda). */
export async function stockListado(sucursalId: string, search: string) {
  const productos = await prisma.productoPadre.findMany({
    where: search ? { nombre: { contains: search, mode: 'insensitive' } } : {},
    orderBy: { nombre: 'asc' },
    take: search ? 60 : 80,
    include: {
      marca: true, categoria: true,
      variantes: { include: { stock: { where: { sucursalId } } } },
    },
  });

  return productos.map((p) => {
    const totalStock = p.variantes.reduce((n, v) => n + (v.stock[0]?.cantidad ?? 0), 0);
    return {
      id: p.id,
      nombre: p.nombre,
      marca: p.marca.nombre,
      categoria: p.categoria.nombre,
      codigo: `${p.marca.nombre.slice(0, 2).toUpperCase()}-${p.id.slice(0, 6)}`,
      variantes: p.variantes.length,
      totalStock,
      esConsignacion: p.variantes.some((v) => v.esConsignacion),
      estado: estadoStock(totalStock),
    };
  });
}

/** Detalle de un producto: matriz talle×color con stock por celda (panel derecho). */
export async function stockDetalle(productoId: string, sucursalId: string) {
  const p = await prisma.productoPadre.findUnique({
    where: { id: productoId },
    include: {
      marca: true,
      categoria: { include: { escalaTalle: { include: { talles: { orderBy: { orden: 'asc' } } } } } },
      variantes: {
        include: { talle: true, color: true, stock: { where: { sucursalId } } },
      },
    },
  });
  if (!p) return null;

  const talles = (p.categoria.escalaTalle?.talles ?? []).map((t) => ({ id: t.id, etiqueta: t.etiqueta, orden: t.orden }));

  // Colores presentes en las variantes (orden alfabético).
  const coloresMap = new Map<string, { id: string; nombre: string; hex: string | null }>();
  for (const v of p.variantes) if (!coloresMap.has(v.colorId)) coloresMap.set(v.colorId, { id: v.colorId, nombre: v.color.nombre, hex: v.color.codigoHex });
  const colores = [...coloresMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Celdas [colorId][talleId] = { stock, varianteId, codigoBarras } | null
  const celdas: Record<string, Record<string, { stock: number; varianteId: string; codigoBarras: string } | null>> = {};
  const totalPorTalle: Record<string, number> = {};
  const totalPorColor: Record<string, number> = {};
  let total = 0;
  for (const c of colores) { celdas[c.id] = {}; totalPorColor[c.id] = 0; for (const t of talles) celdas[c.id]![t.id] = null; }
  for (const t of talles) totalPorTalle[t.id] = 0;

  for (const v of p.variantes) {
    const stock = v.stock[0]?.cantidad ?? 0;
    if (celdas[v.colorId]) {
      celdas[v.colorId]![v.talleId] = { stock, varianteId: v.id, codigoBarras: v.codigoBarras };
      totalPorColor[v.colorId] = (totalPorColor[v.colorId] ?? 0) + stock;
      totalPorTalle[v.talleId] = (totalPorTalle[v.talleId] ?? 0) + stock;
      total += stock;
    }
  }

  return {
    producto: {
      id: p.id, nombre: p.nombre, marca: p.marca.nombre, categoria: p.categoria.nombre,
      totalStock: total, totalVariantes: p.variantes.length,
      esConsignacion: p.variantes.some((v) => v.esConsignacion),
      estado: estadoStock(total),
    },
    talles, colores, celdas, totalPorTalle, totalPorColor, total,
  };
}
