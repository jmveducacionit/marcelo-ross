/**
 * Crédito a favor del cliente.
 *
 * Nace de una devolución resuelta como `CREDITO_A_FAVOR` y se consume en una
 * venta posterior. El saldo es un acumulado; el ledger (`MovimientoCredito`) es
 * el que explica de dónde salió cada peso. Un saldo sin movimientos no se puede
 * auditar ni justificar frente al cliente que reclama.
 *
 * Como el descuento de stock, estas operaciones participan en la transacción de
 * quien las dispara: la devolución y el crédito que genera son un solo hecho.
 */
import { CERO, money, nuevoUuid, restar, sumar, type Money } from '@pos/core-domain';
import type { RegistroOperacion, Tx } from '../../shared/operacion.js';

export interface AcreditarInput {
  clienteId: string;
  monto: Money;
  devolucionId: string;
  usuarioId: string;
  ocurridoEn: Date;
}

export interface ConsumirInput {
  clienteId: string;
  monto: Money;
  ventaId: string;
  usuarioId: string;
  ocurridoEn: Date;
}

export class ErrorCredito extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCredito';
  }
}

/**
 * Gasta crédito a favor en una venta. Devuelve el saldo restante.
 *
 * Falla si el saldo no alcanza en vez de gastar lo que hay: usar "hasta donde
 * llegue" dejaría la venta cobrada de menos sin que nadie se entere. Quien llama
 * tiene que topear el monto antes.
 */
export async function consumirCredito(tx: Tx, reg: RegistroOperacion, input: ConsumirInput): Promise<Money> {
  if (input.monto <= CERO) {
    throw new ErrorCredito('El crédito a usar tiene que ser un monto positivo.');
  }

  const cuenta = await tx.creditoCliente.findUnique({ where: { clienteId: input.clienteId } });
  const saldoAnterior = money(cuenta?.saldo ?? 0n);
  if (!cuenta || saldoAnterior < input.monto) {
    throw new ErrorCredito(
      `El cliente no tiene crédito suficiente: hay ${saldoAnterior.toString()} centavos y se intenta usar ${input.monto.toString()}.`,
    );
  }

  const saldoNuevo = restar(saldoAnterior, input.monto);
  await tx.creditoCliente.update({ where: { id: cuenta.id }, data: { saldo: saldoNuevo } });

  await tx.movimientoCredito.create({
    data: {
      id: nuevoUuid(), creditoClienteId: cuenta.id,
      // Negativo: el ledger tiene que poder sumarse y dar el saldo.
      monto: -input.monto,
      motivo: 'USO_EN_VENTA', ventaId: input.ventaId,
      usuarioId: input.usuarioId, ocurridoEn: input.ocurridoEn,
    },
  });

  reg.auditar({
    entidad: 'CreditoCliente', entidadId: input.clienteId, accion: 'USAR_CREDITO_EN_VENTA',
    antes: { saldo: saldoAnterior.toString() },
    despues: { saldo: saldoNuevo.toString(), ventaId: input.ventaId },
  });

  return saldoNuevo;
}

/** Suma crédito a un cliente por una devolución. Crea la cuenta si no existía. */
export async function acreditarPorDevolucion(tx: Tx, reg: RegistroOperacion, input: AcreditarInput): Promise<Money> {
  if (input.monto <= CERO) {
    throw new Error('El crédito a favor tiene que ser un monto positivo.');
  }

  const actual = await tx.creditoCliente.findUnique({ where: { clienteId: input.clienteId } });
  const saldoAnterior = money(actual?.saldo ?? 0n);
  const saldoNuevo = sumar(saldoAnterior, input.monto);

  const creditoId = actual?.id ?? nuevoUuid();
  if (actual) {
    await tx.creditoCliente.update({ where: { id: creditoId }, data: { saldo: saldoNuevo } });
  } else {
    await tx.creditoCliente.create({ data: { id: creditoId, clienteId: input.clienteId, saldo: saldoNuevo } });
  }

  await tx.movimientoCredito.create({
    data: {
      id: nuevoUuid(), creditoClienteId: creditoId, monto: input.monto,
      motivo: 'DEVOLUCION', devolucionId: input.devolucionId,
      usuarioId: input.usuarioId, ocurridoEn: input.ocurridoEn,
    },
  });

  reg.emitir({
    tipo: 'CreditoClienteGenerado',
    meta: reg.meta({ ocurridoEn: input.ocurridoEn.toISOString() }),
    payload: { clienteId: input.clienteId, monto: input.monto.toString(), origenDevolucionId: input.devolucionId },
  });

  reg.auditar({
    entidad: 'CreditoCliente', entidadId: input.clienteId, accion: 'ACREDITAR_POR_DEVOLUCION',
    antes: { saldo: saldoAnterior.toString() }, despues: { saldo: saldoNuevo.toString() },
  });

  return saldoNuevo;
}
