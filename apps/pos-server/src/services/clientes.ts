import { prisma } from '../db.js';

/** Lista de clientes (columna izquierda), con búsqueda por nombre. */
export async function clientesListado(search: string) {
  const clientes = await prisma.cliente.findMany({
    where: search ? { nombre: { contains: search, mode: 'insensitive' } } : {},
    orderBy: { nombre: 'asc' },
    take: 100,
  });
  return clientes.map((c) => ({
    id: c.id, nombre: c.nombre, condicionIva: c.condicionIva, esFacturaA: !!c.cuit,
  }));
}

/** Ficha completa: identidad, crédito, talles habituales, datos fiscales, historial. */
export async function clienteDetalle(id: string) {
  const c = await prisma.cliente.findUnique({
    where: { id },
    include: { tallesHabituales: true, credito: true },
  });
  if (!c) return null;

  // Talles habituales: resolver nombres de categoría y talle (sin relación directa en el modelo).
  const catIds = [...new Set(c.tallesHabituales.map((t) => t.categoriaId))];
  const talleIds = [...new Set(c.tallesHabituales.map((t) => t.talleId))];
  const [cats, talles] = await Promise.all([
    prisma.categoria.findMany({ where: { id: { in: catIds } } }),
    prisma.talle.findMany({ where: { id: { in: talleIds } } }),
  ]);
  const catNombre = new Map(cats.map((x) => [x.id, x.nombre]));
  const talleEtq = new Map(talles.map((x) => [x.id, x.etiqueta]));
  const tallesHabituales = c.tallesHabituales.map((t) => ({
    categoria: catNombre.get(t.categoriaId) ?? '—', talle: talleEtq.get(t.talleId) ?? '—',
  }));

  // Historial de compras.
  const ventas = await prisma.venta.findMany({
    where: { clienteId: id, estadoVenta: 'CONFIRMADA' },
    orderBy: { fechaHora: 'desc' }, include: { lineas: true },
  });
  // Marca por variante (para "marcas / artículos principales").
  const varIds = [...new Set(ventas.flatMap((v) => v.lineas.map((l) => l.varianteId)))];
  const marcaDe = new Map<string, string>();
  if (varIds.length) {
    const vars = await prisma.variante.findMany({ where: { id: { in: varIds } }, include: { productoPadre: { include: { marca: true } } } });
    for (const v of vars) marcaDe.set(v.id, v.productoPadre.marca.nombre);
  }
  const historial = ventas.map((v) => ({
    ventaId: v.id, fecha: v.fechaHora, total: v.total.toString(),
    items: v.lineas.reduce((n, l) => n + l.cantidad, 0),
    marcas: [...new Set(v.lineas.map((l) => marcaDe.get(l.varianteId) ?? '—'))].slice(0, 3),
  }));

  const totalComprado = ventas.reduce((a, v) => a + v.total, 0n);
  const clienteDesde = ventas.length ? ventas[ventas.length - 1]!.fechaHora : null;

  return {
    cliente: {
      id: c.id, nombre: c.nombre, documento: c.documento, condicionIva: c.condicionIva,
      cuit: c.cuit, razonSocial: c.razonSocial, domicilioFiscal: c.domicilioFiscal,
      email: c.email, telefono: c.telefono, esFacturaA: !!c.cuit,
    },
    creditoAFavor: (c.credito?.saldo ?? 0n).toString(),
    totalComprado: totalComprado.toString(),
    clienteDesde,
    tallesHabituales,
    historial,
  };
}
