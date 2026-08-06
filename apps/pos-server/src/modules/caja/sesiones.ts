/**
 * Control de Caja — apertura, movimientos de efectivo y cierre con arqueo.
 *
 * El arqueo es el momento en que el sistema y la realidad tienen que coincidir:
 * lo que el cajero cuenta en el cajón contra lo que el sistema dice que debería
 * haber. La diferencia es el dato: si es cero, todo cerró; si no, hay algo que
 * revisar y queda registrado con nombre y hora.
 *
 * Qué cuenta para el efectivo esperado:
 *
 *     fondo inicial
 *   + cobros en EFECTIVO de las ventas del turno
 *   + ingresos manuales
 *   − retiros
 *   − gastos
 *   = efectivo esperado en el cajón
 *
 * Los medios electrónicos NO entran en ese cálculo: no están en el cajón. Se
 * totalizan aparte para conciliar después contra la liquidación del procesador,
 * que en V1 es manual.
 */
import { CERO, money, nuevoUuid, restar, sumar, type Money } from '@pos/core-domain';
import { operacionDeDominio, type RegistroOperacion, type Tx } from '../../shared/operacion.js';
import { prisma } from '../../db.js';

export const MEDIO_EFECTIVO = 'EFECTIVO';

export type TipoMovimientoCaja = 'RETIRO' | 'GASTO' | 'INGRESO_MANUAL';

export class ErrorCaja extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCaja';
  }
}

// --- Apertura ----------------------------------------------------------------

export interface AbrirCajaInput {
  cajaId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicial: number; // centavos
}

/**
 * Abre una sesión de caja. Reutiliza el turno abierto de la sucursal o crea uno:
 * el turno agrupa a las cajas que trabajan en la misma jornada, así el encargado
 * ve el movimiento del local y no solo el de un cajón.
 */
export async function abrirCaja(input: AbrirCajaInput) {
  if (!Number.isInteger(input.fondoInicial) || input.fondoInicial < 0) {
    throw new ErrorCaja('El fondo inicial tiene que ser un monto entero y no negativo.');
  }

  const ctx = { usuarioId: input.usuarioId, sucursalId: input.sucursalId, cajaId: input.cajaId };
  return operacionDeDominio('abrirCaja', ctx, async (tx, reg) => {
    const abierta = await tx.sesionCaja.findFirst({
      where: { cajaId: input.cajaId, estado: 'ABIERTA' },
    });
    if (abierta) {
      throw new ErrorCaja('Esa caja ya tiene una sesión abierta. Cerrala antes de abrir otra.');
    }

    let turno = await tx.turno.findFirst({
      where: { sucursalId: input.sucursalId, fechaCierre: null },
      orderBy: { fechaApertura: 'desc' },
    });
    if (!turno) {
      turno = await tx.turno.create({
        data: { id: nuevoUuid(), sucursalId: input.sucursalId, fechaApertura: new Date() },
      });
    }

    const sesionId = nuevoUuid();
    const fondoInicial = money(BigInt(input.fondoInicial));
    await tx.sesionCaja.create({
      data: {
        id: sesionId, cajaId: input.cajaId, sucursalId: input.sucursalId, turnoId: turno.id,
        usuarioId: input.usuarioId, fondoInicial, estado: 'ABIERTA',
      },
    });

    reg.emitir({
      tipo: 'CajaAbierta', meta: reg.meta(),
      payload: { sesionCajaId: sesionId, turnoId: turno.id, fondoInicial: fondoInicial.toString() },
    });
    reg.auditar({
      entidad: 'SesionCaja', entidadId: sesionId, accion: 'ABRIR_CAJA',
      despues: { fondoInicial: fondoInicial.toString(), turnoId: turno.id },
    });

    return { sesionCajaId: sesionId, turnoId: turno.id, fondoInicial: fondoInicial.toString() };
  });
}

// --- Cobros de venta (puerto transaccional) ----------------------------------

export interface CobroDeVenta {
  ventaId: string;
  cajaId: string;
  usuarioId: string;
  ocurridoEn: Date;
  pagos: Array<{ medio: string; monto: Money }>;
}

/**
 * Registra los cobros de una venta en la caja abierta, **dentro de la
 * transacción de Ventas**.
 *
 * Falla si la caja no está abierta, y es a propósito: un cobro que no cae en
 * ninguna sesión es plata que después no aparece en ningún arqueo. Es la razón
 * por la que un POS obliga a abrir caja antes de vender.
 */
export async function registrarCobros(tx: Tx, reg: RegistroOperacion, input: CobroDeVenta): Promise<void> {
  const sesion = await tx.sesionCaja.findFirst({
    where: { cajaId: input.cajaId, estado: 'ABIERTA' },
  });
  if (!sesion) {
    throw new ErrorCaja('No hay una caja abierta para cobrar. Abrí la caja antes de vender.');
  }

  for (const pago of input.pagos) {
    await tx.movimientoCaja.create({
      data: {
        id: nuevoUuid(), sesionCajaId: sesion.id, tipo: 'VENTA', medio: pago.medio,
        monto: pago.monto, referenciaId: input.ventaId, usuarioId: input.usuarioId,
        fechaHora: input.ocurridoEn,
      },
    });
  }

  reg.auditar({
    entidad: 'SesionCaja', entidadId: sesion.id, accion: 'COBRO_DE_VENTA',
    despues: {
      ventaId: input.ventaId,
      pagos: input.pagos.map((p) => `${p.medio} ${p.monto.toString()}`),
    },
  });
}

// --- Movimientos manuales ----------------------------------------------------

export interface MovimientoManualInput {
  sesionCajaId: string;
  tipo: TipoMovimientoCaja;
  monto: number; // centavos, siempre positivo
  motivo: string;
  usuarioId: string;
  sucursalId: string;
}

/** Retiro, gasto o ingreso manual de efectivo. */
export async function registrarMovimiento(input: MovimientoManualInput) {
  if (!Number.isInteger(input.monto) || input.monto <= 0) {
    throw new ErrorCaja('El monto del movimiento tiene que ser un entero positivo.');
  }
  if (!input.motivo?.trim()) {
    throw new ErrorCaja('Todo movimiento de caja necesita un motivo.');
  }

  const ctx = { usuarioId: input.usuarioId, sucursalId: input.sucursalId };
  return operacionDeDominio('registrarMovimientoCaja', ctx, async (tx, reg) => {
    const sesion = await tx.sesionCaja.findUnique({ where: { id: input.sesionCajaId } });
    if (!sesion) throw new ErrorCaja('No encontré esa sesión de caja.');
    if (sesion.estado !== 'ABIERTA') throw new ErrorCaja('La caja está cerrada.');

    const monto = money(BigInt(input.monto));

    // Un retiro o un gasto no pueden dejar el cajón en negativo: si el sistema
    // lo permitiera, el arqueo arrancaría roto y nadie sabría por qué.
    if (input.tipo !== 'INGRESO_MANUAL') {
      const efectivo = await efectivoEnCaja(tx, sesion.id, money(sesion.fondoInicial));
      if (monto > efectivo) {
        throw new ErrorCaja(
          `No hay tanto efectivo en la caja: hay ${efectivo.toString()} centavos y se intenta sacar ${monto.toString()}.`,
        );
      }
    }

    const movId = nuevoUuid();
    await tx.movimientoCaja.create({
      data: {
        id: movId, sesionCajaId: sesion.id, tipo: input.tipo, medio: MEDIO_EFECTIVO,
        monto, referenciaId: null, usuarioId: input.usuarioId, fechaHora: new Date(),
      },
    });

    reg.auditar({
      entidad: 'MovimientoCaja', entidadId: movId, accion: `CAJA_${input.tipo}`,
      despues: { monto: monto.toString(), motivo: input.motivo, sesionCajaId: sesion.id },
    });

    return { movimientoId: movId, monto: monto.toString() };
  });
}

// --- Cálculo del esperado ----------------------------------------------------

/** Efectivo que debería haber en el cajón ahora mismo. */
async function efectivoEnCaja(tx: Tx, sesionCajaId: string, fondoInicial: Money): Promise<Money> {
  const movs = await tx.movimientoCaja.findMany({ where: { sesionCajaId } });
  return movs.reduce((acc, m) => {
    if (m.medio !== MEDIO_EFECTIVO) return acc; // lo electrónico no está en el cajón
    const monto = money(m.monto);
    return m.tipo === 'RETIRO' || m.tipo === 'GASTO' ? restar(acc, monto) : sumar(acc, monto);
  }, fondoInicial);
}

/** Totales por medio de pago de la sesión (sin el fondo inicial). */
function totalizarPorMedio(movs: Array<{ tipo: string; medio: string; monto: bigint }>): Record<string, string> {
  const totales = new Map<string, Money>();
  for (const m of movs) {
    if (m.tipo !== 'VENTA') continue; // los manuales no son cobros
    totales.set(m.medio, sumar(totales.get(m.medio) ?? CERO, money(m.monto)));
  }
  return Object.fromEntries([...totales].map(([medio, monto]) => [medio, monto.toString()]));
}

// --- Estado de la caja (lectura) ---------------------------------------------

/** Sesión abierta de una caja, con lo esperado hasta el momento. `null` si no hay. */
export async function estadoDeCaja(cajaId: string) {
  const sesion = await prisma.sesionCaja.findFirst({
    where: { cajaId, estado: 'ABIERTA' },
    include: { movimientos: { orderBy: { fechaHora: 'desc' } } },
  });
  if (!sesion) return null;

  const fondoInicial = money(sesion.fondoInicial);
  const efectivo = sesion.movimientos.reduce((acc, m) => {
    if (m.medio !== MEDIO_EFECTIVO) return acc;
    const monto = money(m.monto);
    return m.tipo === 'RETIRO' || m.tipo === 'GASTO' ? restar(acc, monto) : sumar(acc, monto);
  }, fondoInicial);

  return {
    sesionCajaId: sesion.id,
    cajaId: sesion.cajaId,
    usuarioId: sesion.usuarioId,
    fechaApertura: sesion.fechaApertura,
    fondoInicial: fondoInicial.toString(),
    efectivoEsperado: efectivo.toString(),
    totalesPorMedio: totalizarPorMedio(sesion.movimientos),
    movimientos: sesion.movimientos.slice(0, 30).map((m) => ({
      id: m.id, tipo: m.tipo, medio: m.medio, monto: m.monto.toString(), fechaHora: m.fechaHora,
    })),
  };
}

// --- Cierre con arqueo -------------------------------------------------------

export interface CerrarCajaInput {
  sesionCajaId: string;
  totalContado: number; // centavos que el cajero contó
  observaciones?: string | null;
  usuarioId: string;
  sucursalId: string;
}

export async function cerrarCaja(input: CerrarCajaInput) {
  if (!Number.isInteger(input.totalContado) || input.totalContado < 0) {
    throw new ErrorCaja('El total contado tiene que ser un monto entero y no negativo.');
  }

  const ctx = { usuarioId: input.usuarioId, sucursalId: input.sucursalId };
  return operacionDeDominio('cerrarCaja', ctx, async (tx, reg) => {
    const sesion = await tx.sesionCaja.findUnique({
      where: { id: input.sesionCajaId },
      include: { movimientos: true },
    });
    if (!sesion) throw new ErrorCaja('No encontré esa sesión de caja.');
    if (sesion.estado !== 'ABIERTA') throw new ErrorCaja('Esa caja ya está cerrada.');

    const fondoInicial = money(sesion.fondoInicial);
    const totalEsperado = await efectivoEnCaja(tx, sesion.id, fondoInicial);
    const totalContado = money(BigInt(input.totalContado));
    // Con signo: negativo = falta plata en el cajón. Se guarda como está, sin
    // valor absoluto: la dirección de la diferencia es la mitad de la información.
    const diferencia = restar(totalContado, totalEsperado);
    const totalesPorMedio = totalizarPorMedio(sesion.movimientos);

    const arqueoId = nuevoUuid();
    await tx.arqueo.create({
      data: {
        id: arqueoId, sesionCajaId: sesion.id, totalContado, totalEsperado, diferencia,
        totalesPorMedio, observaciones: input.observaciones ?? null,
        usuarioId: input.usuarioId, fecha: new Date(),
      },
    });
    await tx.sesionCaja.update({
      where: { id: sesion.id },
      data: { estado: 'CERRADA', fechaCierre: new Date() },
    });

    reg.emitir({
      tipo: 'CajaCerrada', meta: reg.meta({ cajaId: sesion.cajaId }),
      payload: {
        sesionCajaId: sesion.id, totalContado: totalContado.toString(),
        diferencia: diferencia.toString(), totalesPorMedio,
      },
    });
    reg.auditar({
      entidad: 'SesionCaja', entidadId: sesion.id, accion: 'CERRAR_CAJA',
      antes: { estado: 'ABIERTA' },
      despues: {
        estado: 'CERRADA', totalContado: totalContado.toString(),
        totalEsperado: totalEsperado.toString(), diferencia: diferencia.toString(),
      },
    });

    return {
      arqueoId,
      totalContado: totalContado.toString(),
      totalEsperado: totalEsperado.toString(),
      diferencia: diferencia.toString(),
      totalesPorMedio,
      cuadra: diferencia === CERO,
    };
  });
}
