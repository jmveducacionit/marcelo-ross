/**
 * Proveedores: recepción contra remito, cuenta corriente y liquidación de
 * consignación.
 *
 * Dos hechos mueven la cuenta corriente:
 *
 *  1. **Recepción de un remito**: llega mercadería propia y nace la deuda por
 *     lo recibido. El stock lo ingresa el módulo Stock, por su puerto — este
 *     módulo no toca `stockPorSucursal`.
 *  2. **Liquidación de consignación** (ADR-0006): la mercadería consignada no
 *     es propia hasta que se vende, así que la deuda nace al VENDERLA, no al
 *     recibirla. Se calcula sobre las ventas del período.
 *
 * El costo unitario que se le liquida al proveedor sale del último remito de esa
 * variante. No es el precio de venta: entre los dos está el margen del comercio.
 */
import { CERO, money, multiplicarPorCantidad, nuevoUuid, sumar, type Money } from '@pos/core-domain';
import { prisma } from '../../db.js';
import { operacionDeDominio } from '../../shared/operacion.js';
import { ingresarPorRemito } from '../stock/index.js';

export class ErrorProveedor extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorProveedor';
  }
}

// --- Cuenta corriente --------------------------------------------------------

interface MovimientoCuenta {
  proveedorId: string;
  monto: Money; // con signo
  motivo: 'RECEPCION_REMITO' | 'LIQUIDACION_CONSIGNACION' | 'PAGO' | 'AJUSTE';
  remitoId?: string;
  liquidacionId?: string;
  usuarioId: string;
  ocurridoEn: Date;
}

/** Mueve la cuenta corriente dentro de la transacción del llamador. */
async function moverCuenta(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], mov: MovimientoCuenta): Promise<Money> {
  const actual = await tx.cuentaCorrienteProveedor.findUnique({ where: { proveedorId: mov.proveedorId } });
  const saldoAnterior = money(actual?.saldo ?? 0n);
  const saldoNuevo = sumar(saldoAnterior, mov.monto);

  const cuentaId = actual?.id ?? nuevoUuid();
  if (actual) {
    await tx.cuentaCorrienteProveedor.update({ where: { id: cuentaId }, data: { saldo: saldoNuevo } });
  } else {
    await tx.cuentaCorrienteProveedor.create({ data: { id: cuentaId, proveedorId: mov.proveedorId, saldo: saldoNuevo } });
  }

  await tx.movimientoCuentaProveedor.create({
    data: {
      id: nuevoUuid(), cuentaId, monto: mov.monto, motivo: mov.motivo,
      remitoId: mov.remitoId ?? null, liquidacionId: mov.liquidacionId ?? null,
      usuarioId: mov.usuarioId, ocurridoEn: mov.ocurridoEn,
    },
  });

  return saldoNuevo;
}

// --- Recepción contra remito -------------------------------------------------

export interface RecibirRemitoInput {
  proveedorId: string;
  sucursalId: string;
  numero: string;
  usuarioId: string;
  ordenCompraId?: string | null;
  lineas: Array<{ varianteId: string; cantidad: number; costoUnitario: number }>;
}

/**
 * Recibe mercadería contra remito: ingresa el stock y carga la deuda.
 *
 * La mercadería **en consignación no genera deuda al recibirla** (ADR-0006): el
 * stock entra para poder venderse, pero no es propio hasta que se vende. Por eso
 * se separan las líneas antes de mover la cuenta corriente.
 */
export async function recibirRemito(input: RecibirRemitoInput) {
  if (!input.lineas?.length) throw new ErrorProveedor('El remito no tiene líneas.');
  for (const l of input.lineas) {
    if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) {
      throw new ErrorProveedor('Las cantidades del remito tienen que ser enteros positivos.');
    }
    if (!Number.isInteger(l.costoUnitario) || l.costoUnitario < 0) {
      throw new ErrorProveedor('Los costos tienen que ser enteros no negativos (centavos).');
    }
  }
  if (!input.numero?.trim()) throw new ErrorProveedor('El remito necesita su número.');

  const remitoId = nuevoUuid();
  const ocurridoEn = new Date();
  const ctx = { usuarioId: input.usuarioId, sucursalId: input.sucursalId };

  return operacionDeDominio('recibirRemito', ctx, async (tx, reg) => {
    const proveedor = await tx.proveedor.findUnique({ where: { id: input.proveedorId } });
    if (!proveedor) throw new ErrorProveedor('No encontré ese proveedor.');

    const variantes = await tx.variante.findMany({
      where: { id: { in: input.lineas.map((l) => l.varianteId) } },
      select: { id: true, esConsignacion: true },
    });
    const esConsignacionDe = new Map(variantes.map((v) => [v.id, v.esConsignacion]));
    if (variantes.length !== new Set(input.lineas.map((l) => l.varianteId)).size) {
      throw new ErrorProveedor('Alguna de las variantes del remito no existe.');
    }

    const total = input.lineas.reduce(
      (acc, l) => sumar(acc, multiplicarPorCantidad(money(BigInt(l.costoUnitario)), l.cantidad)), CERO,
    );
    // Lo consignado no se le debe todavía: se paga recién cuando se vende.
    const deuda = input.lineas.reduce((acc, l) => (
      esConsignacionDe.get(l.varianteId)
        ? acc
        : sumar(acc, multiplicarPorCantidad(money(BigInt(l.costoUnitario)), l.cantidad))
    ), CERO);

    await tx.remito.create({
      data: {
        id: remitoId, proveedorId: input.proveedorId, sucursalId: input.sucursalId,
        ordenCompraId: input.ordenCompraId ?? null, numero: input.numero.trim(),
        fecha: ocurridoEn, estado: 'RECIBIDO', total,
        lineas: {
          create: input.lineas.map((l) => ({
            id: nuevoUuid(), varianteId: l.varianteId, cantidad: l.cantidad,
            costoUnitario: BigInt(l.costoUnitario),
          })),
        },
      },
    });

    // El stock lo ingresa Stock, por su puerto. Este módulo no escribe stock.
    await ingresarPorRemito(tx, reg, {
      remitoId, sucursalId: input.sucursalId, usuarioId: input.usuarioId, ocurridoEn,
      lineas: input.lineas.map((l) => ({
        varianteId: l.varianteId, cantidad: l.cantidad, costoUnitario: money(BigInt(l.costoUnitario)),
      })),
    });

    // Actualizar lo recibido de la orden de compra, si el remito viene de una.
    if (input.ordenCompraId) {
      for (const l of input.lineas) {
        await tx.lineaOrdenCompra.updateMany({
          where: { ordenCompraId: input.ordenCompraId, varianteId: l.varianteId },
          data: { recibido: { increment: l.cantidad } },
        });
      }
    }

    let saldo: Money = CERO;
    if (deuda > CERO) {
      saldo = await moverCuenta(tx, {
        proveedorId: input.proveedorId, monto: deuda, motivo: 'RECEPCION_REMITO',
        remitoId, usuarioId: input.usuarioId, ocurridoEn,
      });
    }

    reg.auditar({
      entidad: 'Remito', entidadId: remitoId, accion: 'RECIBIR_REMITO',
      despues: {
        proveedorId: input.proveedorId, numero: input.numero, lineas: input.lineas.length,
        total: total.toString(), deudaGenerada: deuda.toString(),
      },
    });

    return {
      remitoId, total: total.toString(), deuda: deuda.toString(),
      saldoProveedor: saldo.toString(),
      consignados: input.lineas.filter((l) => esConsignacionDe.get(l.varianteId)).length,
    };
  });
}

// --- Liquidación de consignación (ADR-0006) ----------------------------------

/**
 * Calcula qué se le debe a un proveedor por lo vendido de su mercadería
 * consignada en un período, SIN emitir la liquidación.
 *
 * Se apoya en los movimientos de stock de tipo VENTA de variantes marcadas como
 * consignación, cruzados por marca contra el proveedor. El costo unitario sale
 * del último remito de esa variante; si nunca entró por remito, no se puede
 * liquidar y se informa aparte en vez de asumir un costo.
 */
export async function calcularConsignacion(proveedorId: string, desde: Date, hasta: Date) {
  const marcas = await prisma.marca.findMany({ where: { proveedorId }, select: { id: true } });
  if (marcas.length === 0) return { lineas: [], total: '0', sinCosto: [] };

  const variantes = await prisma.variante.findMany({
    where: { esConsignacion: true, productoPadre: { marcaId: { in: marcas.map((m) => m.id) } } },
    include: { productoPadre: true, talle: true, color: true },
  });
  if (variantes.length === 0) return { lineas: [], total: '0', sinCosto: [] };

  const movimientos = await prisma.movimientoStock.groupBy({
    by: ['varianteId'],
    where: {
      tipo: 'VENTA', varianteId: { in: variantes.map((v) => v.id) },
      ocurridoEn: { gte: desde, lte: hasta },
    },
    _sum: { cantidad: true },
  });

  const costos = await prisma.lineaRemito.findMany({
    where: { varianteId: { in: variantes.map((v) => v.id) } },
    orderBy: { remito: { fecha: 'desc' } },
    include: { remito: { select: { fecha: true } } },
  });
  const costoDe = new Map<string, bigint>();
  for (const c of costos) if (!costoDe.has(c.varianteId)) costoDe.set(c.varianteId, c.costoUnitario);

  const varianteDe = new Map(variantes.map((v) => [v.id, v]));
  const lineas: Array<{ varianteId: string; producto: string; detalle: string; cantidadVendida: number; costoUnitario: string; montoALiquidar: string }> = [];
  const sinCosto: Array<{ varianteId: string; producto: string; cantidadVendida: number }> = [];
  let total: Money = CERO;

  for (const m of movimientos) {
    // Los movimientos de VENTA son negativos: lo vendido es su valor absoluto.
    const vendidas = Math.abs(m._sum.cantidad ?? 0);
    if (vendidas === 0) continue;
    const v = varianteDe.get(m.varianteId)!;
    const nombre = v.productoPadre.nombre;
    const costo = costoDe.get(m.varianteId);

    if (costo == null) {
      sinCosto.push({ varianteId: m.varianteId, producto: nombre, cantidadVendida: vendidas });
      continue;
    }
    const monto = multiplicarPorCantidad(money(costo), vendidas);
    total = sumar(total, monto);
    lineas.push({
      varianteId: m.varianteId, producto: nombre,
      detalle: `${v.talle.etiqueta} · ${v.color.nombre}`,
      cantidadVendida: vendidas, costoUnitario: costo.toString(), montoALiquidar: monto.toString(),
    });
  }

  lineas.sort((a, b) => Number(BigInt(b.montoALiquidar) - BigInt(a.montoALiquidar)));
  return { lineas, total: total.toString(), sinCosto };
}

export interface LiquidarInput {
  proveedorId: string;
  periodo: string; // "2026-08"
  usuarioId: string;
  sucursalId: string;
}

/** Emite la liquidación del período y la carga a la cuenta corriente. */
export async function liquidarConsignacion(input: LiquidarInput) {
  const m = /^(\d{4})-(\d{2})$/.exec(input.periodo);
  if (!m) throw new ErrorProveedor('El período tiene que tener formato AAAA-MM.');
  const anio = Number(m[1]), mes = Number(m[2]);
  const desde = new Date(anio, mes - 1, 1);
  const hasta = new Date(anio, mes, 0, 23, 59, 59, 999);

  const previa = await prisma.liquidacionConsignacion.findUnique({
    where: { proveedorId_periodo: { proveedorId: input.proveedorId, periodo: input.periodo } },
  });
  if (previa) throw new ErrorProveedor(`Ese proveedor ya tiene liquidado el período ${input.periodo}.`);

  const calculo = await calcularConsignacion(input.proveedorId, desde, hasta);
  if (calculo.lineas.length === 0) {
    throw new ErrorProveedor('No hay ventas de mercadería consignada de ese proveedor en el período.');
  }

  const liquidacionId = nuevoUuid();
  const ocurridoEn = new Date();
  const ctx = { usuarioId: input.usuarioId, sucursalId: input.sucursalId };

  return operacionDeDominio('liquidarConsignacion', ctx, async (tx, reg) => {
    const total = money(BigInt(calculo.total));
    await tx.liquidacionConsignacion.create({
      data: {
        id: liquidacionId, proveedorId: input.proveedorId, periodo: input.periodo,
        desde, hasta, total, estado: 'EMITIDA', fecha: ocurridoEn, usuarioId: input.usuarioId,
        lineas: {
          create: calculo.lineas.map((l) => ({
            id: nuevoUuid(), varianteId: l.varianteId, cantidadVendida: l.cantidadVendida,
            costoUnitario: BigInt(l.costoUnitario), montoALiquidar: BigInt(l.montoALiquidar),
          })),
        },
      },
    });

    const saldo = await moverCuenta(tx, {
      proveedorId: input.proveedorId, monto: total, motivo: 'LIQUIDACION_CONSIGNACION',
      liquidacionId, usuarioId: input.usuarioId, ocurridoEn,
    });

    reg.auditar({
      entidad: 'LiquidacionConsignacion', entidadId: liquidacionId, accion: 'LIQUIDAR_CONSIGNACION',
      despues: {
        proveedorId: input.proveedorId, periodo: input.periodo,
        total: total.toString(), lineas: calculo.lineas.length, saldoProveedor: saldo.toString(),
      },
    });

    return {
      liquidacionId, periodo: input.periodo, total: total.toString(),
      lineas: calculo.lineas.length, saldoProveedor: saldo.toString(),
      sinCosto: calculo.sinCosto,
    };
  });
}

// --- Pagos y consultas -------------------------------------------------------

export interface PagarInput {
  proveedorId: string;
  monto: number; // centavos, positivo
  usuarioId: string;
  sucursalId: string;
}

/** Registra un pago al proveedor: baja el saldo. */
export async function pagarProveedor(input: PagarInput) {
  if (!Number.isInteger(input.monto) || input.monto <= 0) {
    throw new ErrorProveedor('El pago tiene que ser un monto entero positivo.');
  }
  const ctx = { usuarioId: input.usuarioId, sucursalId: input.sucursalId };
  return operacionDeDominio('pagarProveedor', ctx, async (tx, reg) => {
    const cuenta = await tx.cuentaCorrienteProveedor.findUnique({ where: { proveedorId: input.proveedorId } });
    const saldoAnterior = money(cuenta?.saldo ?? 0n);
    const monto = money(BigInt(input.monto));
    if (monto > saldoAnterior) {
      throw new ErrorProveedor(
        `No se le debe tanto: el saldo es ${saldoAnterior.toString()} centavos y se intenta pagar ${monto.toString()}.`,
      );
    }
    const saldo = await moverCuenta(tx, {
      proveedorId: input.proveedorId, monto: (-monto) as Money, motivo: 'PAGO',
      usuarioId: input.usuarioId, ocurridoEn: new Date(),
    });
    reg.auditar({
      entidad: 'CuentaCorrienteProveedor', entidadId: input.proveedorId, accion: 'PAGAR_PROVEEDOR',
      antes: { saldo: saldoAnterior.toString() }, despues: { saldo: saldo.toString(), pagado: monto.toString() },
    });
    return { saldo: saldo.toString() };
  });
}

export async function listarProveedores() {
  const filas = await prisma.proveedor.findMany({
    orderBy: { razonSocial: 'asc' },
    include: { cuentaCorriente: true, marcas: { select: { nombre: true } } },
  });
  return filas.map((p) => ({
    id: p.id, razonSocial: p.razonSocial, cuit: p.cuit, condicionIva: p.condicionIva,
    esConsignatario: p.esConsignatario,
    marcas: p.marcas.map((m) => m.nombre),
    saldo: (p.cuentaCorriente?.saldo ?? 0n).toString(),
  }));
}

export async function detalleProveedor(proveedorId: string) {
  const p = await prisma.proveedor.findUnique({
    where: { id: proveedorId },
    include: {
      marcas: { select: { id: true, nombre: true } },
      cuentaCorriente: { include: { movimientos: { orderBy: { ocurridoEn: 'desc' }, take: 30 } } },
    },
  });
  if (!p) return null;

  const [remitos, liquidaciones] = await Promise.all([
    prisma.remito.findMany({ where: { proveedorId }, orderBy: { fecha: 'desc' }, take: 10, include: { lineas: true } }),
    prisma.liquidacionConsignacion.findMany({ where: { proveedorId }, orderBy: { fecha: 'desc' }, take: 10 }),
  ]);

  return {
    id: p.id, razonSocial: p.razonSocial, cuit: p.cuit, condicionIva: p.condicionIva,
    esConsignatario: p.esConsignatario,
    marcas: p.marcas.map((m) => m.nombre),
    saldo: (p.cuentaCorriente?.saldo ?? 0n).toString(),
    movimientos: (p.cuentaCorriente?.movimientos ?? []).map((m) => ({
      id: m.id, monto: m.monto.toString(), motivo: m.motivo, ocurridoEn: m.ocurridoEn,
    })),
    remitos: remitos.map((r) => ({
      id: r.id, numero: r.numero, fecha: r.fecha, total: r.total.toString(), lineas: r.lineas.length,
    })),
    liquidaciones: liquidaciones.map((l) => ({
      id: l.id, periodo: l.periodo, total: l.total.toString(), estado: l.estado, fecha: l.fecha,
    })),
  };
}
