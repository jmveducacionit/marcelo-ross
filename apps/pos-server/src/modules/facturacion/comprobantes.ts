/**
 * Emisión de comprobantes y cola de CAE (ADR-0001 / ADR-0005).
 *
 * La regla que ordena todo el módulo: **la venta no espera al CAE**. Al
 * confirmarse una venta se registra un `Comprobante` en estado `PENDIENTE` y se
 * encola; un worker lo resuelve cuando hay conexión. El cliente se lleva el
 * ticket no fiscal en el momento.
 *
 * Por eso este módulo reacciona al evento `VentaConfirmada` en vez de vivir
 * dentro de la transacción de la venta: si el intermediario está caído, la caja
 * tiene que poder seguir vendiendo.
 *
 * IVA: en retail argentino el precio de góndola ya lo incluye. Entonces el total
 * del comprobante ES el total de la venta, y el neto se obtiene DESAGREGANDO
 * hacia atrás. Sumarle IVA al total sería cobrarle al cliente más de lo que dice
 * la etiqueta.
 */
import { CERO, money, nuevoUuid, restar, type Money } from '@pos/core-domain';
import type { FacturacionArcaPort } from '@pos/contracts';
import { prisma } from '../../db.js';
import { operacionDeDominio } from '../../shared/operacion.js';
import { crearArcaSimulado } from './arca-simulado.js';

export const ALICUOTA_IVA = 21;

/** Cuántas veces se reintenta antes de dar el comprobante por rechazado. */
export const MAX_INTENTOS = 5;

let puerto: FacturacionArcaPort = crearArcaSimulado();
/** Permite inyectar el adaptador real (o uno que falle, para pruebas). */
export function usarPuertoArca(p: FacturacionArcaPort): void {
  puerto = p;
}

/**
 * Desagrega el IVA de un total que ya lo incluye.
 * neto = total / 1,21 · iva = total − neto. Se calcula sobre el neto para que
 * neto + iva dé EXACTAMENTE el total, sin un centavo de diferencia.
 */
export function desagregarIva(total: Money): { neto: Money; iva: Money } {
  const escala = BigInt(100 + ALICUOTA_IVA);
  // Redondeo mitad arriba, igual que el resto del sistema.
  const neto = money((total * 100n * 2n + escala) / (escala * 2n));
  return { neto, iva: restar(total, neto) };
}

/** Tipo de comprobante según la condición del receptor. */
export function tipoParaCliente(condicionIva: string | null | undefined): 'FACTURA_A' | 'FACTURA_B' {
  return condicionIva === 'Responsable Inscripto' ? 'FACTURA_A' : 'FACTURA_B';
}

/**
 * Registra el comprobante de una venta y lo encola.
 *
 * **Idempotente por venta**: si ya existe un comprobante para esa venta, no hace
 * nada. Es lo que permite que se lo llame desde el consumidor del evento (que es
 * at-least-once) y también desde un barrido de recuperación, sin duplicar.
 */
export async function emitirParaVenta(ventaId: string): Promise<{ comprobanteId: string; creado: boolean } | null> {
  const existente = await prisma.comprobante.findFirst({ where: { ventaId } });
  if (existente) return { comprobanteId: existente.id, creado: false };

  const venta = await prisma.venta.findUnique({ where: { id: ventaId }, include: { cliente: true } });
  if (!venta || venta.estadoVenta !== 'CONFIRMADA') return null;

  const puntoVenta = await prisma.puntoVenta.findFirst({ where: { sucursalId: venta.sucursalId } });
  if (!puntoVenta) {
    throw new Error(`La sucursal ${venta.sucursalId} no tiene punto de venta configurado ante ARCA.`);
  }

  const tipo = tipoParaCliente(venta.cliente?.condicionIva);
  const total = money(venta.total);
  const { neto, iva } = desagregarIva(total);

  const ctx = { usuarioId: venta.vendedorId, sucursalId: venta.sucursalId, cajaId: venta.cajaId };
  const comprobanteId = nuevoUuid();

  await operacionDeDominio('emitirComprobante', ctx, async (tx, reg) => {
    // La numeración es por punto de venta y tipo, y tiene que ser correlativa
    // sin huecos: ARCA los rechaza. Se toma el último y se suma uno dentro de la
    // transacción.
    const ultimo = await tx.comprobante.findFirst({
      where: { puntoVentaId: puntoVenta.id, tipo },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const numero = (ultimo?.numero ?? 0) + 1;

    await tx.comprobante.create({
      data: {
        id: comprobanteId, tipo, puntoVentaId: puntoVenta.id, numero,
        ventaId: venta.id, clienteId: venta.clienteId,
        neto, iva, total, estadoCae: 'PENDIENTE', intentos: 0,
        cola: { create: { id: nuevoUuid(), estado: 'PENDIENTE', proximoIntento: new Date() } },
      },
    });

    reg.auditar({
      entidad: 'Comprobante', entidadId: comprobanteId, accion: 'REGISTRAR_COMPROBANTE',
      despues: { tipo, numero, total: total.toString(), neto: neto.toString(), iva: iva.toString(), estadoCae: 'PENDIENTE' },
    });
  });

  return { comprobanteId, creado: true };
}

/**
 * Procesa la cola de CAE: toma los pendientes que ya pueden reintentarse y
 * llama al intermediario.
 *
 * Backoff exponencial entre intentos. Después de `MAX_INTENTOS` el comprobante
 * queda `RECHAZADO` y hay que mirarlo a mano: seguir reintentando para siempre
 * esconde el problema en vez de mostrarlo.
 */
export async function procesarCola(limite = 20): Promise<{ procesados: number; obtenidos: number; rechazados: number; reintentar: number }> {
  const ahora = new Date();
  const pendientes = await prisma.colaCae.findMany({
    where: { estado: 'PENDIENTE', OR: [{ proximoIntento: null }, { proximoIntento: { lte: ahora } }] },
    include: { comprobante: { include: { puntoVenta: true } } },
    take: limite,
  });

  let obtenidos = 0, rechazados = 0, reintentar = 0;

  for (const item of pendientes) {
    const c = item.comprobante;
    const cliente = c.clienteId ? await prisma.cliente.findUnique({ where: { id: c.clienteId } }) : null;
    const intentos = c.intentos + 1;

    try {
      const r = await puerto.emitir({
        tipo: c.tipo as 'FACTURA_A' | 'FACTURA_B' | 'NOTA_CREDITO' | 'NOTA_DEBITO',
        puntoVenta: c.puntoVenta.numeroArca,
        neto: money(c.neto), iva: money(c.iva), total: money(c.total),
        ...(cliente ? { receptor: { condicionIva: cliente.condicionIva, ...(cliente.cuit ? { cuit: cliente.cuit } : {}) } } : {}),
      });

      if (r.estado === 'OBTENIDO') {
        await aplicarResultado(c.id, item.id, intentos, {
          estadoCae: 'OBTENIDO', cae: r.cae, vencimientoCae: new Date(r.vencimientoCae),
        });
        obtenidos++;
      } else {
        // Rechazo del organismo: reintentar no lo va a arreglar.
        await aplicarResultado(c.id, item.id, intentos, { estadoCae: 'RECHAZADO', error: r.motivo });
        rechazados++;
      }
    } catch (e) {
      // Falla de comunicación: esto SÍ se reintenta.
      const motivo = e instanceof Error ? e.message : 'Error desconocido';
      if (intentos >= MAX_INTENTOS) {
        await aplicarResultado(c.id, item.id, intentos, {
          estadoCae: 'RECHAZADO', error: `${motivo} (agotados ${intentos} intentos)`,
        });
        rechazados++;
      } else {
        const espera = Math.min(2 ** intentos, 60) * 1000; // backoff, tope 1 min
        await prisma.$transaction([
          prisma.comprobante.update({ where: { id: c.id }, data: { intentos } }),
          prisma.colaCae.update({
            where: { id: item.id },
            data: { ultimoIntento: new Date(), proximoIntento: new Date(Date.now() + espera), error: motivo },
          }),
        ]);
        reintentar++;
      }
    }
  }

  return { procesados: pendientes.length, obtenidos, rechazados, reintentar };
}

async function aplicarResultado(
  comprobanteId: string, colaId: string, intentos: number,
  r: { estadoCae: 'OBTENIDO' | 'RECHAZADO'; cae?: string; vencimientoCae?: Date; error?: string },
) {
  const comprobante = await prisma.comprobante.findUnique({ where: { id: comprobanteId } });
  if (!comprobante) return;

  const ctx = { usuarioId: 'sistema', sucursalId: (await puntoVentaSucursal(comprobante.puntoVentaId)) ?? 'desconocida' };
  await operacionDeDominio('resolverCae', ctx, async (tx, reg) => {
    await tx.comprobante.update({
      where: { id: comprobanteId },
      data: {
        estadoCae: r.estadoCae, intentos,
        ...(r.cae ? { cae: r.cae } : {}),
        ...(r.vencimientoCae ? { vencimientoCae: r.vencimientoCae } : {}),
      },
    });
    await tx.colaCae.update({
      where: { id: colaId },
      data: { estado: r.estadoCae === 'OBTENIDO' ? 'RESUELTO' : 'FALLIDO', ultimoIntento: new Date(), error: r.error ?? null },
    });

    reg.emitir({
      tipo: r.estadoCae === 'OBTENIDO' ? 'CAEObtenido' : 'CAERechazado',
      meta: reg.meta(),
      payload: r.estadoCae === 'OBTENIDO'
        ? { comprobanteId, cae: r.cae, vencimientoCae: r.vencimientoCae?.toISOString() }
        : { comprobanteId, motivo: r.error, intentos },
    });
    reg.auditar({
      entidad: 'Comprobante', entidadId: comprobanteId, accion: `CAE_${r.estadoCae}`,
      antes: { estadoCae: 'PENDIENTE' },
      despues: { estadoCae: r.estadoCae, cae: r.cae ?? null, error: r.error ?? null, intentos },
    });
  });
}

async function puntoVentaSucursal(puntoVentaId: string): Promise<string | null> {
  const pv = await prisma.puntoVenta.findUnique({ where: { id: puntoVentaId }, select: { sucursalId: true } });
  return pv?.sucursalId ?? null;
}

/**
 * Barrido de recuperación: ventas confirmadas que se quedaron sin comprobante.
 *
 * El consumidor de eventos es in-process: si el servidor se reinicia justo
 * después de una venta, ese evento no lo consume nadie. Sin este barrido la
 * venta quedaría sin comprobante para siempre, y nadie se enteraría hasta el
 * cierre fiscal del mes.
 */
export async function recuperarVentasSinComprobante(limite = 50): Promise<number> {
  const conComprobante = await prisma.comprobante.findMany({
    where: { ventaId: { not: null } }, select: { ventaId: true },
  });
  const ids = new Set(conComprobante.map((c) => c.ventaId!));
  const ventas = await prisma.venta.findMany({
    where: { estadoVenta: 'CONFIRMADA', id: { notIn: [...ids] } },
    orderBy: { fechaHora: 'asc' }, take: limite, select: { id: true },
  });
  let creados = 0;
  for (const v of ventas) {
    const r = await emitirParaVenta(v.id);
    if (r?.creado) creados++;
  }
  return creados;
}

// --- Consultas ---------------------------------------------------------------

export async function listarComprobantes(sucursalId?: string, limite = 40) {
  const filas = await prisma.comprobante.findMany({
    where: sucursalId ? { puntoVenta: { sucursalId } } : {},
    orderBy: { fechaEmision: 'desc' },
    take: limite,
    include: { puntoVenta: true, cola: true },
  });
  const clientes = await prisma.cliente.findMany({
    where: { id: { in: filas.map((f) => f.clienteId).filter((x): x is string => !!x) } },
    select: { id: true, nombre: true, condicionIva: true },
  });
  const clienteDe = new Map(clientes.map((c) => [c.id, c]));

  return filas.map((f) => ({
    id: f.id, tipo: f.tipo,
    puntoVenta: f.puntoVenta.numeroArca,
    numero: f.numero,
    /** Formato ARCA: 0001-00000123 */
    etiqueta: `${String(f.puntoVenta.numeroArca).padStart(4, '0')}-${String(f.numero).padStart(8, '0')}`,
    fechaEmision: f.fechaEmision,
    cliente: f.clienteId ? clienteDe.get(f.clienteId)?.nombre ?? null : null,
    neto: f.neto.toString(), iva: f.iva.toString(), total: f.total.toString(),
    estadoCae: f.estadoCae, cae: f.cae, vencimientoCae: f.vencimientoCae,
    intentos: f.intentos,
    error: f.cola?.error ?? null,
    ventaId: f.ventaId,
  }));
}

/** Resumen de la cola, para la pantalla. */
export async function resumenCola(sucursalId?: string) {
  const where = sucursalId ? { puntoVenta: { sucursalId } } : {};
  const [pendientes, obtenidos, rechazados, totales] = await Promise.all([
    prisma.comprobante.count({ where: { ...where, estadoCae: 'PENDIENTE' } }),
    prisma.comprobante.count({ where: { ...where, estadoCae: 'OBTENIDO' } }),
    prisma.comprobante.count({ where: { ...where, estadoCae: 'RECHAZADO' } }),
    prisma.comprobante.aggregate({ where: { ...where, estadoCae: 'OBTENIDO' }, _sum: { neto: true, iva: true, total: true } }),
  ]);
  return {
    pendientes, obtenidos, rechazados,
    facturado: {
      neto: (totales._sum.neto ?? CERO).toString(),
      iva: (totales._sum.iva ?? CERO).toString(),
      total: (totales._sum.total ?? CERO).toString(),
    },
  };
}

/**
 * Libro IVA ventas: lo que el contador necesita. Solo comprobantes CON CAE —
 * los pendientes todavía no existen fiscalmente.
 */
export async function libroIvaVentas(desde: Date, hasta: Date, sucursalId?: string) {
  const filas = await prisma.comprobante.findMany({
    where: {
      estadoCae: 'OBTENIDO',
      fechaEmision: { gte: desde, lte: hasta },
      ...(sucursalId ? { puntoVenta: { sucursalId } } : {}),
    },
    orderBy: [{ fechaEmision: 'asc' }, { numero: 'asc' }],
    include: { puntoVenta: true },
  });
  const clientes = await prisma.cliente.findMany({
    where: { id: { in: filas.map((f) => f.clienteId).filter((x): x is string => !!x) } },
  });
  const clienteDe = new Map(clientes.map((c) => [c.id, c]));

  return {
    desde, hasta,
    lineas: filas.map((f) => {
      const cli = f.clienteId ? clienteDe.get(f.clienteId) : null;
      return {
        fecha: f.fechaEmision,
        tipo: f.tipo,
        comprobante: `${String(f.puntoVenta.numeroArca).padStart(4, '0')}-${String(f.numero).padStart(8, '0')}`,
        receptor: cli?.razonSocial ?? cli?.nombre ?? 'Consumidor Final',
        cuit: cli?.cuit ?? null,
        neto: f.neto.toString(), iva: f.iva.toString(), total: f.total.toString(),
        cae: f.cae,
      };
    }),
    totales: filas.reduce(
      (acc, f) => ({
        neto: (BigInt(acc.neto) + f.neto).toString(),
        iva: (BigInt(acc.iva) + f.iva).toString(),
        total: (BigInt(acc.total) + f.total).toString(),
      }),
      { neto: '0', iva: '0', total: '0' },
    ),
  };
}
