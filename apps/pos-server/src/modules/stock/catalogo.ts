import { prisma } from '../../db.js';

/** Busca productos con su matriz talle×color, stock (de la sucursal) y precio vigente. */
export async function buscarProductos(sucursalId: string, search: string) {
  const productos = await prisma.productoPadre.findMany({
    where: search ? { nombre: { contains: search, mode: 'insensitive' } } : {},
    take: 24,
    orderBy: { nombre: 'asc' },
    include: {
      marca: true,
      categoria: true,
      variantes: {
        include: {
          talle: true,
          color: true,
          stock: { where: { sucursalId } },
          precios: { where: { vigenteHasta: null }, orderBy: { vigenteDesde: 'desc' }, take: 1 },
        },
      },
    },
  });

  return productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    marca: p.marca.nombre,
    categoria: p.categoria.nombre,
    variantes: p.variantes
      .map((v) => ({
        id: v.id,
        talle: v.talle.etiqueta,
        talleOrden: v.talle.orden,
        color: v.color.nombre,
        colorHex: v.color.codigoHex,
        codigoBarras: v.codigoBarras,
        esConsignacion: v.esConsignacion,
        stock: v.stock[0]?.cantidad ?? 0,
        // Money en centavos, como string (BigInt serializado).
        precio: (v.precios[0]?.precio ?? 0n).toString(),
      }))
      .sort((a, b) => a.talleOrden - b.talleOrden || a.color.localeCompare(b.color)),
  }));
}
