import { nuevoUuid } from '@pos/core-domain';
import { operacionDeDominio, type RegistroOperacion, type Tx } from '../../shared/operacion.js';

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

export interface LineaADescontar { varianteId: string; cantidad: number }

export interface DescuentoPorVentaInput {
  ventaId: string;
  sucursalId: string;
  usuarioId: string;
  ocurridoEn: Date;
  lineas: LineaADescontar[];
}

/**
 * Descuenta stock por una venta, **participando en la transacción de quien vende**.
 *
 * A diferencia del resto del módulo, no abre su propia `operacionDeDominio`: recibe
 * la `tx` y el `reg` del llamador. Es deliberado — vender y descontar tienen que ser
 * un solo commit. Si el descuento falla, la venta no debe existir; y si la venta
 * falla, el stock no se toca. Modelarlo como evento posterior (Stock consumiendo
 * `VentaConfirmada`) rompería esa atomicidad y abriría la ventana de vender stock
 * que ya no está.
 *
 * Stock sigue siendo el dueño de la escritura: es este módulo el que toca las
 * tablas, emite `StockDescontado` y deja la auditoría. Ventas pide, no escribe.
 */
export async function descontarPorVenta(tx: Tx, reg: RegistroOperacion, input: DescuentoPorVentaInput): Promise<void> {
  const varianteIds = [...new Set(input.lineas.map((l) => l.varianteId))];

  // Stock previo, solo para el `antes` de la auditoría. El descuento se hace con
  // `decrement` (atómico), no escribiendo el valor leído.
  const previos = await tx.stockPorSucursal.findMany({
    where: { varianteId: { in: varianteIds }, sucursalId: input.sucursalId },
    select: { varianteId: true, cantidad: true },
  });
  const previoDe = new Map(previos.map((s) => [s.varianteId, s.cantidad]));

  // La consignación viaja en el evento: Proveedores la necesita para generar el
  // cargo al proveedor cuando se vende mercadería no propia (ADR-0006).
  const variantes = await tx.variante.findMany({
    where: { id: { in: varianteIds } },
    select: { id: true, esConsignacion: true },
  });
  const esConsignacionDe = new Map(variantes.map((v) => [v.id, v.esConsignacion]));

  for (const l of input.lineas) {
    await tx.stockPorSucursal.updateMany({
      where: { varianteId: l.varianteId, sucursalId: input.sucursalId },
      data: { cantidad: { decrement: l.cantidad } },
    });
    await tx.movimientoStock.create({
      data: {
        id: nuevoUuid(), varianteId: l.varianteId, sucursalId: input.sucursalId,
        tipo: 'VENTA', cantidad: -l.cantidad, motivo: 'Venta confirmada',
        referenciaId: input.ventaId, usuarioId: input.usuarioId, ocurridoEn: input.ocurridoEn,
      },
    });

    reg.emitir({
      tipo: 'StockDescontado',
      meta: reg.meta({ ocurridoEn: input.ocurridoEn.toISOString() }),
      payload: {
        varianteId: l.varianteId, cantidad: l.cantidad, motivo: 'VENTA',
        ventaId: input.ventaId, esConsignacion: esConsignacionDe.get(l.varianteId) ?? false,
      },
    });

    const antes = previoDe.get(l.varianteId) ?? 0;
    reg.auditar({
      entidad: 'StockPorSucursal', entidadId: l.varianteId, accion: 'DESCUENTO_POR_VENTA',
      antes: { cantidad: antes }, despues: { cantidad: antes - l.cantidad },
    });
  }
}

export interface ReingresoPorDevolucionInput {
  devolucionId: string;
  sucursalId: string;
  usuarioId: string;
  ocurridoEn: Date;
  lineas: LineaADescontar[];
}

/**
 * Reingresa stock por una devolución, **dentro de la transacción del llamador**.
 * Espejo de `descontarPorVenta`: misma razón para no abrir su propia transacción
 * —registrar la devolución y devolver el stock son un solo hecho.
 *
 * La mercadería vuelve al stock vendible. Si estuviera fallada no debería
 * reingresar, pero eso es una decisión de negocio que hoy no se modela: toda
 * devolución vuelve a stock.
 */
export async function reingresarPorDevolucion(tx: Tx, reg: RegistroOperacion, input: ReingresoPorDevolucionInput): Promise<void> {
  const varianteIds = [...new Set(input.lineas.map((l) => l.varianteId))];

  const previos = await tx.stockPorSucursal.findMany({
    where: { varianteId: { in: varianteIds }, sucursalId: input.sucursalId },
    select: { varianteId: true, cantidad: true },
  });
  const previoDe = new Map(previos.map((s) => [s.varianteId, s.cantidad]));

  for (const l of input.lineas) {
    // upsert: una devolución sin ticket puede traer una variante que esta
    // sucursal nunca tuvo en stock (comprada en la otra sucursal).
    await tx.stockPorSucursal.upsert({
      where: { varianteId_sucursalId: { varianteId: l.varianteId, sucursalId: input.sucursalId } },
      update: { cantidad: { increment: l.cantidad } },
      create: { id: nuevoUuid(), varianteId: l.varianteId, sucursalId: input.sucursalId, cantidad: l.cantidad },
    });
    await tx.movimientoStock.create({
      data: {
        id: nuevoUuid(), varianteId: l.varianteId, sucursalId: input.sucursalId,
        tipo: 'DEVOLUCION', cantidad: l.cantidad, motivo: 'Devolución de cliente',
        referenciaId: input.devolucionId, usuarioId: input.usuarioId, ocurridoEn: input.ocurridoEn,
      },
    });

    reg.emitir({
      tipo: 'StockIngresado',
      meta: reg.meta({ ocurridoEn: input.ocurridoEn.toISOString() }),
      payload: { varianteId: l.varianteId, cantidad: l.cantidad, motivo: 'DEVOLUCION', devolucionId: input.devolucionId },
    });

    const antes = previoDe.get(l.varianteId) ?? 0;
    reg.auditar({
      entidad: 'StockPorSucursal', entidadId: l.varianteId, accion: 'REINGRESO_POR_DEVOLUCION',
      antes: { cantidad: antes }, despues: { cantidad: antes + l.cantidad },
    });
  }
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
