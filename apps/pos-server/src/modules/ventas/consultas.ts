/**
 * Lecturas del módulo Ventas.
 *
 * El detalle sirve para armar una devolución: por cada línea informa cuánto se
 * compró y cuánto ya se devolvió, así la pantalla nunca ofrece devolver más de
 * lo que queda. El servidor lo vuelve a validar igual —la UI no es una garantía—
 * pero mostrar el límite evita el error antes de que ocurra.
 */
import { prisma } from '../../db.js';

export async function ventaDetalle(ventaId: string) {
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: {
      lineas: true,
      pagos: true,
      cliente: true,
    },
  });
  if (!venta) return null;

  const variantes = await prisma.variante.findMany({
    where: { id: { in: venta.lineas.map((l) => l.varianteId) } },
    include: { productoPadre: { include: { marca: true } }, talle: true, color: true },
  });
  const varianteDe = new Map(variantes.map((v) => [v.id, v]));

  // Lo ya devuelto de ESTA venta, por variante.
  const devueltas = await prisma.lineaDevolucion.findMany({
    where: { devolucion: { ventaOrigenId: ventaId } },
    select: { varianteId: true, cantidad: true },
  });
  const yaDevuelto = new Map<string, number>();
  for (const d of devueltas) yaDevuelto.set(d.varianteId, (yaDevuelto.get(d.varianteId) ?? 0) + d.cantidad);

  return {
    id: venta.id,
    fechaHora: venta.fechaHora,
    sucursalId: venta.sucursalId,
    cajaId: venta.cajaId,
    estadoEntrega: venta.estadoEntrega,
    subtotal: venta.subtotal.toString(),
    totalDescuentos: venta.totalDescuentos.toString(),
    total: venta.total.toString(),
    cliente: venta.cliente ? { id: venta.cliente.id, nombre: venta.cliente.nombre } : null,
    pagos: venta.pagos.map((p) => ({ medio: p.medio, monto: p.monto.toString() })),
    lineas: venta.lineas.map((l) => {
      const v = varianteDe.get(l.varianteId);
      const devuelto = yaDevuelto.get(l.varianteId) ?? 0;
      return {
        lineaId: l.id,
        varianteId: l.varianteId,
        producto: v?.productoPadre.nombre ?? '(producto eliminado)',
        marca: v?.productoPadre.marca.nombre ?? '',
        talle: v?.talle.etiqueta ?? '',
        color: v?.color.nombre ?? '',
        cantidad: l.cantidad,
        devuelto,
        /** Lo que todavía se puede devolver de esta línea. */
        disponible: l.cantidad - devuelto,
        precioUnitario: l.precioUnitario.toString(),
        subtotalLinea: l.subtotalLinea.toString(),
      };
    }),
  };
}
