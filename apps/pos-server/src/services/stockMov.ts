import { nuevoUuid } from '@pos/core-domain';
import { operacionDeDominio, type Tx } from '../shared/operacion.js';

interface Ctx { usuarioId: string; sucursalId: string; }

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
  return operacionDeDominio('ingresarStock', ctx, async (tx, reg) => {
    const actual = await stockActual(tx, varianteId, sucursalId);
    await setStock(tx, varianteId, sucursalId, actual + cantidad);
    await tx.movimientoStock.create({ data: { id: nuevoUuid(), varianteId, sucursalId, tipo: 'INGRESO', cantidad, motivo: 'Ingreso de mercadería', usuarioId: ctx.usuarioId, ocurridoEn: new Date() } });

    reg.emitir({ tipo: 'StockIngresado', meta: reg.meta(), payload: { varianteId, cantidad, motivo: 'INGRESO' } });
    reg.auditar({ entidad: 'StockPorSucursal', entidadId: varianteId, accion: 'INGRESO_STOCK', antes: { cantidad: actual }, despues: { cantidad: actual + cantidad } });

    return { nueva: actual + cantidad };
  });
}

/** Ajuste: fija el stock a un valor contado. Emite Stock(In/De)gresado según el signo del delta. */
export async function ajustarStock(varianteId: string, sucursalId: string, nuevaCantidad: number, ctx: Ctx) {
  if (!Number.isInteger(nuevaCantidad) || nuevaCantidad < 0) throw new Error('La cantidad ajustada debe ser un entero ≥ 0.');
  return operacionDeDominio('ajustarStock', ctx, async (tx, reg) => {
    const actual = await stockActual(tx, varianteId, sucursalId);
    const delta = nuevaCantidad - actual;
    if (delta === 0) {
      reg.sinCambios('el conteo coincide con el stock registrado');
      return { nueva: nuevaCantidad };
    }
    await setStock(tx, varianteId, sucursalId, nuevaCantidad);
    await tx.movimientoStock.create({ data: { id: nuevoUuid(), varianteId, sucursalId, tipo: 'AJUSTE', cantidad: delta, motivo: 'Ajuste manual de inventario', usuarioId: ctx.usuarioId, ocurridoEn: new Date() } });

    reg.emitir({
      tipo: delta > 0 ? 'StockIngresado' : 'StockDescontado',
      meta: reg.meta(),
      payload: { varianteId, cantidad: Math.abs(delta), motivo: 'AJUSTE' },
    });
    reg.auditar({ entidad: 'StockPorSucursal', entidadId: varianteId, accion: 'AJUSTE_STOCK', antes: { cantidad: actual }, despues: { cantidad: nuevaCantidad } });

    return { nueva: nuevaCantidad };
  });
}

/**
 * Transferencia entre sucursales: baja en origen y alta en destino (envío + recepción
 * en un solo paso para el prototipo). Emite TransferenciaEnviada y TransferenciaRecibida.
 */
export async function transferirStock(varianteId: string, sucursalOrigenId: string, sucursalDestinoId: string, cantidad: number, ctx: Ctx) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('La cantidad a transferir debe ser un entero positivo.');
  if (sucursalOrigenId === sucursalDestinoId) throw new Error('El origen y el destino deben ser distintos.');
  return operacionDeDominio('transferirStock', ctx, async (tx, reg) => {
    const enOrigen = await stockActual(tx, varianteId, sucursalOrigenId);
    if (enOrigen < cantidad) throw new Error(`Stock insuficiente en origen (hay ${enOrigen}).`);
    const enDestino = await stockActual(tx, varianteId, sucursalDestinoId);
    await setStock(tx, varianteId, sucursalOrigenId, enOrigen - cantidad);
    await setStock(tx, varianteId, sucursalDestinoId, enDestino + cantidad);

    const transferenciaId = nuevoUuid();
    await tx.transferencia.create({ data: { id: transferenciaId, sucursalOrigenId, sucursalDestinoId, estado: 'RECIBIDA', fechaEnvio: new Date(), fechaRecepcion: new Date() } });
    await tx.movimientoStock.create({ data: { id: nuevoUuid(), varianteId, sucursalId: sucursalOrigenId, tipo: 'TRANSFERENCIA_SALIDA', cantidad: -cantidad, motivo: 'Transferencia', referenciaId: transferenciaId, usuarioId: ctx.usuarioId, ocurridoEn: new Date() } });
    await tx.movimientoStock.create({ data: { id: nuevoUuid(), varianteId, sucursalId: sucursalDestinoId, tipo: 'TRANSFERENCIA_ENTRADA', cantidad, motivo: 'Transferencia', referenciaId: transferenciaId, usuarioId: ctx.usuarioId, ocurridoEn: new Date() } });

    reg.emitir({ tipo: 'TransferenciaEnviada', meta: reg.meta(), payload: { transferenciaId, sucursalDestinoId, lineas: [{ varianteId, cantidad }] } });
    reg.emitir({ tipo: 'TransferenciaRecibida', meta: reg.meta({ sucursalId: sucursalDestinoId }), payload: { transferenciaId, lineas: [{ varianteId, cantidad }] } });
    reg.auditar({ entidad: 'Transferencia', entidadId: transferenciaId, accion: 'TRANSFERENCIA_STOCK', despues: { varianteId, cantidad, origen: sucursalOrigenId, destino: sucursalDestinoId } });

    return { enOrigen: enOrigen - cantidad };
  });
}
