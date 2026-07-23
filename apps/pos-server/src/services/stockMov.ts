import { prisma } from '../db.js';
import { nuevoUuid } from '@pos/core-domain';
import { encolarEvento, registrarAuditoria, publicarPostCommit } from '../shared/bus.js';

interface Ctx { usuarioId: string; sucursalId: string; }
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function meta(ctx: Ctx) {
  return { eventId: nuevoUuid(), ocurridoEn: new Date().toISOString(), sucursalId: ctx.sucursalId, usuarioId: ctx.usuarioId };
}

async function stockActual(tx: Tx, varianteId: string, sucursalId: string): Promise<number> {
  const s = await tx.stockPorSucursal.findUnique({ where: { varianteId_sucursalId: { varianteId, sucursalId } } });
  return s?.cantidad ?? 0;
}

async function setStock(tx: Tx, varianteId: string, sucursalId: string, cantidad: number) {
  await tx.stockPorSucursal.upsert({
    where: { varianteId_sucursalId: { varianteId, sucursalId } },
    update: { cantidad },
    create: { id: nuevoUuid(), varianteId, sucursalId, cantidad },
  });
}

/** Ingreso de mercadería: suma unidades (motivo INGRESO). Emite StockIngresado. */
export async function ingresarStock(varianteId: string, sucursalId: string, cantidad: number, ctx: Ctx) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('La cantidad a ingresar debe ser un entero positivo.');
  const ev = await prisma.$transaction(async (tx) => {
    const actual = await stockActual(tx, varianteId, sucursalId);
    await setStock(tx, varianteId, sucursalId, actual + cantidad);
    await tx.movimientoStock.create({ data: { id: nuevoUuid(), varianteId, sucursalId, tipo: 'INGRESO', cantidad, motivo: 'Ingreso de mercadería', usuarioId: ctx.usuarioId, ocurridoEn: new Date() } });
    const evento = { tipo: 'StockIngresado' as const, meta: meta(ctx), payload: { varianteId, cantidad, motivo: 'INGRESO' } };
    await encolarEvento(tx as never, evento as never);
    await registrarAuditoria(tx as never, ctx, { entidad: 'StockPorSucursal', entidadId: varianteId, accion: 'INGRESO_STOCK', antes: { cantidad: actual }, despues: { cantidad: actual + cantidad } });
    return { evento, nueva: actual + cantidad };
  });
  publicarPostCommit(ev.evento as never);
  return { nueva: ev.nueva };
}

/** Ajuste: fija el stock a un valor contado. Emite Stock(In/De)gresado según el signo del delta. */
export async function ajustarStock(varianteId: string, sucursalId: string, nuevaCantidad: number, ctx: Ctx) {
  if (!Number.isInteger(nuevaCantidad) || nuevaCantidad < 0) throw new Error('La cantidad ajustada debe ser un entero ≥ 0.');
  const ev = await prisma.$transaction(async (tx) => {
    const actual = await stockActual(tx, varianteId, sucursalId);
    const delta = nuevaCantidad - actual;
    if (delta === 0) return null;
    await setStock(tx, varianteId, sucursalId, nuevaCantidad);
    await tx.movimientoStock.create({ data: { id: nuevoUuid(), varianteId, sucursalId, tipo: 'AJUSTE', cantidad: delta, motivo: 'Ajuste manual de inventario', usuarioId: ctx.usuarioId, ocurridoEn: new Date() } });
    const evento = { tipo: delta > 0 ? 'StockIngresado' as const : 'StockDescontado' as const, meta: meta(ctx), payload: { varianteId, cantidad: Math.abs(delta), motivo: 'AJUSTE' } };
    await encolarEvento(tx as never, evento as never);
    await registrarAuditoria(tx as never, ctx, { entidad: 'StockPorSucursal', entidadId: varianteId, accion: 'AJUSTE_STOCK', antes: { cantidad: actual }, despues: { cantidad: nuevaCantidad } });
    return { evento, nueva: nuevaCantidad };
  });
  if (ev) publicarPostCommit(ev.evento as never);
  return { nueva: nuevaCantidad };
}

/**
 * Transferencia entre sucursales: baja en origen y alta en destino (envío + recepción
 * en un solo paso para el prototipo). Emite TransferenciaEnviada y TransferenciaRecibida.
 */
export async function transferirStock(varianteId: string, sucursalOrigenId: string, sucursalDestinoId: string, cantidad: number, ctx: Ctx) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('La cantidad a transferir debe ser un entero positivo.');
  if (sucursalOrigenId === sucursalDestinoId) throw new Error('El origen y el destino deben ser distintos.');
  const res = await prisma.$transaction(async (tx) => {
    const enOrigen = await stockActual(tx, varianteId, sucursalOrigenId);
    if (enOrigen < cantidad) throw new Error(`Stock insuficiente en origen (hay ${enOrigen}).`);
    const enDestino = await stockActual(tx, varianteId, sucursalDestinoId);
    await setStock(tx, varianteId, sucursalOrigenId, enOrigen - cantidad);
    await setStock(tx, varianteId, sucursalDestinoId, enDestino + cantidad);

    const transferenciaId = nuevoUuid();
    await tx.transferencia.create({ data: { id: transferenciaId, sucursalOrigenId, sucursalDestinoId, estado: 'RECIBIDA', fechaEnvio: new Date(), fechaRecepcion: new Date() } });
    await tx.movimientoStock.create({ data: { id: nuevoUuid(), varianteId, sucursalId: sucursalOrigenId, tipo: 'TRANSFERENCIA_SALIDA', cantidad: -cantidad, motivo: 'Transferencia', referenciaId: transferenciaId, usuarioId: ctx.usuarioId, ocurridoEn: new Date() } });
    await tx.movimientoStock.create({ data: { id: nuevoUuid(), varianteId, sucursalId: sucursalDestinoId, tipo: 'TRANSFERENCIA_ENTRADA', cantidad, motivo: 'Transferencia', referenciaId: transferenciaId, usuarioId: ctx.usuarioId, ocurridoEn: new Date() } });

    const evEnviada = { tipo: 'TransferenciaEnviada' as const, meta: meta(ctx), payload: { transferenciaId, sucursalDestinoId, lineas: [{ varianteId, cantidad }] } };
    const evRecibida = { tipo: 'TransferenciaRecibida' as const, meta: { ...meta(ctx), sucursalId: sucursalDestinoId }, payload: { transferenciaId, lineas: [{ varianteId, cantidad }] } };
    await encolarEvento(tx as never, evEnviada as never);
    await encolarEvento(tx as never, evRecibida as never);
    await registrarAuditoria(tx as never, ctx, { entidad: 'Transferencia', entidadId: transferenciaId, accion: 'TRANSFERENCIA_STOCK', despues: { varianteId, cantidad, origen: sucursalOrigenId, destino: sucursalDestinoId } });
    return { evEnviada, evRecibida, enOrigen: enOrigen - cantidad };
  });
  publicarPostCommit(res.evEnviada as never);
  publicarPostCommit(res.evRecibida as never);
  return { enOrigen: res.enOrigen };
}
