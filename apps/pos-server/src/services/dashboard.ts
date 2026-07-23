import { prisma } from '../db.js';

/**
 * KPIs del dashboard, calculados desde los datos reales (ventas, stock, precios).
 * "Hoy" = ventas con fechaHora >= inicio del día actual. Dinero en centavos (string).
 */
export async function kpis() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);

  const [ventasHoy, ventasAyer, sucursales, usuarios] = await Promise.all([
    prisma.venta.findMany({ where: { estadoVenta: 'CONFIRMADA', fechaHora: { gte: hoy } }, include: { lineas: true } }),
    prisma.venta.findMany({ where: { estadoVenta: 'CONFIRMADA', fechaHora: { gte: ayer, lt: hoy } }, select: { total: true } }),
    prisma.sucursal.findMany(),
    prisma.usuario.findMany(),
  ]);

  const sucNombre = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const userInfo = new Map(usuarios.map((u) => [u.id, { nombre: u.nombre, sucursal: sucNombre.get(u.sucursalIdPrincipal) ?? '' }]));

  // Totales del día.
  const totalHoy = ventasHoy.reduce((a, v) => a + v.total, 0n);
  const tickets = ventasHoy.length;
  const ticketProm = tickets > 0 ? totalHoy / BigInt(tickets) : 0n;
  const totalAyer = ventasAyer.reduce((a, v) => a + v.total, 0n);
  const compVsAyer = totalAyer > 0n ? Number(((totalHoy - totalAyer) * 100n) / totalAyer) : null;

  // Por sucursal (para el gráfico comparativo).
  const porSucMap = new Map<string, bigint>();
  for (const v of ventasHoy) porSucMap.set(v.sucursalId, (porSucMap.get(v.sucursalId) ?? 0n) + v.total);
  const porSucursal = sucursales.map((s) => ({ sucursal: s.nombre, monto: (porSucMap.get(s.id) ?? 0n).toString() }));

  // Ranking de vendedores.
  const rankMap = new Map<string, { monto: bigint; tickets: number }>();
  for (const v of ventasHoy) {
    const r = rankMap.get(v.vendedorId) ?? { monto: 0n, tickets: 0 };
    r.monto += v.total; r.tickets += 1; rankMap.set(v.vendedorId, r);
  }
  const ranking = [...rankMap.entries()]
    .map(([id, r]) => ({ nombre: userInfo.get(id)?.nombre ?? id, sucursal: userInfo.get(id)?.sucursal ?? '', monto: r.monto.toString(), tickets: r.tickets, _m: r.monto }))
    .sort((a, b) => (a._m > b._m ? -1 : 1)).slice(0, 5)
    .map(({ _m, ...r }) => r);

  // Marcas top (por facturación del día).
  const varIds = [...new Set(ventasHoy.flatMap((v) => v.lineas.map((l) => l.varianteId)))];
  const marcaDe = new Map<string, string>();
  if (varIds.length) {
    const vars = await prisma.variante.findMany({
      where: { id: { in: varIds } }, include: { productoPadre: { include: { marca: true } } },
    });
    for (const v of vars) marcaDe.set(v.id, v.productoPadre.marca.nombre);
  }
  const marcaMap = new Map<string, bigint>();
  for (const v of ventasHoy) for (const l of v.lineas) {
    const m = marcaDe.get(l.varianteId) ?? '—';
    marcaMap.set(m, (marcaMap.get(m) ?? 0n) + l.subtotalLinea);
  }
  const totalMarcas = [...marcaMap.values()].reduce((a, b) => a + b, 0n);
  const marcasTop = [...marcaMap.entries()]
    .map(([marca, m]) => ({ marca, monto: m.toString(), pct: totalMarcas > 0n ? Number((m * 100n) / totalMarcas) : 0, _m: m }))
    .sort((a, b) => (a._m > b._m ? -1 : 1)).slice(0, 4)
    .map(({ _m, ...r }) => r);

  // Stock inmovilizado: variantes con stock pero sin ninguna venta registrada.
  const conVenta = new Set((await prisma.movimientoStock.findMany({ where: { tipo: 'VENTA' }, select: { varianteId: true } })).map((m) => m.varianteId));
  const stock = await prisma.stockPorSucursal.findMany({ where: { cantidad: { gt: 0 } } });
  const inmoVarIds = [...new Set(stock.filter((s) => !conVenta.has(s.varianteId)).map((s) => s.varianteId))];
  const precioDe = new Map<string, bigint>();
  if (inmoVarIds.length) {
    const precios = await prisma.precioVariante.findMany({ where: { varianteId: { in: inmoVarIds }, vigenteHasta: null } });
    for (const p of precios) precioDe.set(p.varianteId, p.precio);
  }
  let valorInmo = 0n; let articulosInmo = 0;
  for (const s of stock) if (!conVenta.has(s.varianteId)) { articulosInmo += s.cantidad; valorInmo += (precioDe.get(s.varianteId) ?? 0n) * BigInt(s.cantidad); }

  return {
    ventasHoy: totalHoy.toString(),
    tickets,
    ticketPromedio: ticketProm.toString(),
    compVsAyer,
    porSucursal,
    ranking,
    marcasTop,
    inmovilizado: { articulos: articulosInmo, valor: valorInmo.toString(), variantes: inmoVarIds.length },
  };
}
