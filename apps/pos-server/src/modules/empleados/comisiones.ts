/**
 * Comisiones y ranking de vendedores.
 *
 * La decisión de negocio, registrada: **la comisión se calcula sobre la venta
 * NETA de devoluciones y se devenga AL LIQUIDAR el período, no al vender.**
 *
 * Las dos mitades importan. Si se devengara al vender, habría que revertir
 * comisiones ya "ganadas" cuando el cliente devuelve —conflictivo con el
 * empleado, y peor si ya se pagó—. Y si la base fuera la venta bruta, el sistema
 * premiaría la venta que no se sostiene, que en un rubro con devolución
 * frecuente es exactamente el incentivo equivocado.
 *
 * La devolución se imputa al período en que OCURRE, no al de la venta original.
 * Es la regla más simple de explicar y la única que no obliga a reabrir un
 * período ya pagado.
 */
import { CERO, aplicarPorcentaje, money, nuevoUuid, restar, sumar, type Money } from '@pos/core-domain';
import { prisma } from '../../db.js';
import { operacionDeDominio } from '../../shared/operacion.js';

/**
 * Porcentaje único por ahora. Cuando haya escalas por rol o por objetivo, esto
 * pasa a ser un dato del empleado; hoy tenerlo como constante es honesto y
 * evita una tabla de configuración que nadie tocaría.
 */
export const PORCENTAJE_COMISION = 3;

export class ErrorComision extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorComision';
  }
}

function rangoDePeriodo(periodo: string): { desde: Date; hasta: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) throw new ErrorComision('El período tiene que tener formato AAAA-MM.');
  const anio = Number(m[1]), mes = Number(m[2]);
  return { desde: new Date(anio, mes - 1, 1), hasta: new Date(anio, mes, 0, 23, 59, 59, 999) };
}

export interface FilaComision {
  vendedorId: string;
  nombre: string;
  rol: string;
  tickets: number;
  vendido: string;
  devuelto: string;
  base: string;
  porcentaje: number;
  comision: string;
  liquidada: boolean;
}

/** Calcula las comisiones del período. No escribe nada. */
export async function calcularComisiones(periodo: string, sucursalId?: string): Promise<FilaComision[]> {
  const { desde, hasta } = rangoDePeriodo(periodo);
  const where = { fechaHora: { gte: desde, lte: hasta }, estadoVenta: 'CONFIRMADA', ...(sucursalId ? { sucursalId } : {}) };

  const ventas = await prisma.venta.groupBy({
    by: ['vendedorId'], where, _sum: { total: true }, _count: { _all: true },
  });

  // Devoluciones del período, atribuidas al vendedor de la venta ORIGINAL.
  // Una devolución sin ticket no tiene a quién restarle: queda fuera de la base.
  const devoluciones = await prisma.devolucion.findMany({
    where: { fecha: { gte: desde, lte: hasta }, ...(sucursalId ? { sucursalId } : {}) },
    select: { ventaOrigenId: true, total: true },
  });
  const ventasOrigen = await prisma.venta.findMany({
    where: { id: { in: devoluciones.map((d) => d.ventaOrigenId).filter((x): x is string => !!x) } },
    select: { id: true, vendedorId: true },
  });
  const vendedorDeVenta = new Map(ventasOrigen.map((v) => [v.id, v.vendedorId]));
  const devueltoPorVendedor = new Map<string, Money>();
  for (const d of devoluciones) {
    const vendedorId = d.ventaOrigenId ? vendedorDeVenta.get(d.ventaOrigenId) : undefined;
    if (!vendedorId) continue;
    devueltoPorVendedor.set(vendedorId, sumar(devueltoPorVendedor.get(vendedorId) ?? CERO, money(d.total)));
  }

  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: ventas.map((v) => v.vendedorId) } },
    select: { id: true, nombre: true, rol: true },
  });
  const usuarioDe = new Map(usuarios.map((u) => [u.id, u]));

  const yaLiquidadas = await prisma.comision.findMany({
    where: { periodo, estado: 'LIQUIDADA' }, select: { vendedorId: true },
  });
  const liquidados = new Set(yaLiquidadas.map((c) => c.vendedorId));

  const filas = ventas.map((v) => {
    const vendido = money(v._sum.total ?? 0n);
    const devuelto = devueltoPorVendedor.get(v.vendedorId) ?? CERO;
    // La base no puede ser negativa: si en el mes devolvieron más de lo que
    // vendió, la comisión es cero, no una deuda del empleado.
    const bruta = restar(vendido, devuelto);
    const base = bruta > CERO ? bruta : CERO;
    const u = usuarioDe.get(v.vendedorId);
    return {
      vendedorId: v.vendedorId,
      nombre: u?.nombre ?? '(usuario eliminado)',
      rol: u?.rol ?? '—',
      tickets: v._count._all,
      vendido: vendido.toString(),
      devuelto: devuelto.toString(),
      base: base.toString(),
      porcentaje: PORCENTAJE_COMISION,
      comision: aplicarPorcentaje(base, PORCENTAJE_COMISION).toString(),
      liquidada: liquidados.has(v.vendedorId),
    };
  });

  filas.sort((a, b) => Number(BigInt(b.base) - BigInt(a.base)));
  return filas;
}

export interface LiquidarComisionesInput {
  periodo: string;
  usuarioId: string;
  sucursalId: string;
}

/**
 * Liquida las comisiones del período: es el momento en que se devengan.
 * Idempotente por (vendedor, período): re-liquidar no duplica.
 */
export async function liquidarComisiones(input: LiquidarComisionesInput) {
  const filas = await calcularComisiones(input.periodo, input.sucursalId);
  const pendientes = filas.filter((f) => !f.liquidada && BigInt(f.comision) > 0n);
  if (pendientes.length === 0) {
    throw new ErrorComision('No hay comisiones pendientes de liquidar en ese período.');
  }

  const ctx = { usuarioId: input.usuarioId, sucursalId: input.sucursalId };
  return operacionDeDominio('liquidarComisiones', ctx, async (tx, reg) => {
    let total: Money = CERO;
    for (const f of pendientes) {
      await tx.comision.create({
        data: {
          id: nuevoUuid(), vendedorId: f.vendedorId, ventaId: null, periodo: input.periodo,
          base: BigInt(f.base), porcentaje: f.porcentaje, monto: BigInt(f.comision), estado: 'LIQUIDADA',
        },
      });
      total = sumar(total, money(BigInt(f.comision)));
    }

    reg.auditar({
      entidad: 'Comision', entidadId: input.periodo, accion: 'LIQUIDAR_COMISIONES',
      despues: {
        periodo: input.periodo, vendedores: pendientes.length, total: total.toString(),
        detalle: pendientes.map((f) => `${f.nombre}: ${f.comision}`),
      },
    });

    return { periodo: input.periodo, vendedores: pendientes.length, total: total.toString() };
  });
}

/** Ranking de vendedores del período, para la pantalla y el dashboard. */
export async function rankingVendedores(periodo: string, sucursalId?: string) {
  const filas = await calcularComisiones(periodo, sucursalId);
  const totalVendido = filas.reduce((acc, f) => acc + BigInt(f.vendido), 0n);
  return filas.map((f) => ({
    ...f,
    ticketPromedio: f.tickets > 0 ? (BigInt(f.vendido) / BigInt(f.tickets)).toString() : '0',
    participacion: totalVendido > 0n ? Number((BigInt(f.vendido) * 1000n) / totalVendido) / 10 : 0,
  }));
}

/** Usuarios del sistema, para la pantalla de Empleados. */
export async function listarEmpleados() {
  const filas = await prisma.usuario.findMany({ orderBy: [{ activo: 'desc' }, { nombre: 'asc' }] });
  const sucursales = await prisma.sucursal.findMany({ select: { id: true, nombre: true } });
  const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));
  return filas.map((u) => ({
    id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol,
    sucursal: nombreSucursal.get(u.sucursalIdPrincipal) ?? '—',
    activo: u.activo,
    ultimoLogin: u.ultimoLogin,
    bloqueado: !!(u.bloqueadoHasta && u.bloqueadoHasta > new Date()),
  }));
}
