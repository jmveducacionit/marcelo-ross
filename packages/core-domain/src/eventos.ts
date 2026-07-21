/**
 * Catálogo COMPLETO de eventos de dominio (los 13).
 * Definidos todos desde el día 1, aunque algunos aún no tengan consumidor.
 * Convención: PascalCase, en pasado. Ver docs/arquitectura.md §3.
 *
 * Fase 1: contrato. Los payloads son la forma esperada; se refinan al implementar
 * cada módulo, respetando compatibilidad.
 */

import type { Money } from './money';
import type { Uuid } from './ids';

/** Metadata transversal presente en TODO evento. */
export interface EventoMeta {
  eventId: Uuid; // = id del Outbox; sirve para dedupe idempotente
  ocurridoEn: string; // ISO timestamp
  sucursalId: Uuid;
  cajaId?: Uuid;
  usuarioId: Uuid; // quién (auditoría)
  correlationId?: Uuid;
}

interface EventoBase<TTipo extends string, TPayload> {
  tipo: TTipo;
  meta: EventoMeta;
  payload: TPayload;
}

// --- Ventas -----------------------------------------------------------------

export type VentaConfirmada = EventoBase<'VentaConfirmada', {
  ventaId: Uuid;
  clienteId?: Uuid;
  lineas: Array<{
    varianteId: Uuid;
    cantidad: number;
    precioUnitario: Money; // snapshot al momento de la venta
    descuentos: Array<{ tipo: string; monto: Money }>;
    subtotal: Money;
  }>;
  pagos: Array<{ medio: string; monto: Money; cuotas?: number }>;
  total: Money;
  requiereEntregaDiferida: boolean;
}>;

export type DevolucionRegistrada = EventoBase<'DevolucionRegistrada', {
  devolucionId: Uuid;
  ventaOrigenId?: Uuid;
  lineas: Array<{ varianteId: Uuid; cantidad: number }>;
  resolucion: 'NOTA_CREDITO' | 'CREDITO_A_FAVOR' | 'CAMBIO';
}>;

export type PrendaEntregada = EventoBase<'PrendaEntregada', {
  ventaId: Uuid;
  lineas: Array<{ varianteId: Uuid; cantidad: number }>;
  fechaEntrega: string;
}>;

// --- Stock ------------------------------------------------------------------

export type StockDescontado = EventoBase<'StockDescontado', {
  varianteId: Uuid;
  cantidad: number;
  motivo: 'VENTA' | 'AJUSTE' | 'TRANSFERENCIA' | 'INVENTARIO';
  ventaId?: Uuid;
  esConsignacion: boolean;
}>;

export type StockIngresado = EventoBase<'StockIngresado', {
  varianteId: Uuid;
  cantidad: number;
  remitoId?: Uuid;
  costoUnitario?: Money;
}>;

export type TransferenciaEnviada = EventoBase<'TransferenciaEnviada', {
  transferenciaId: Uuid;
  sucursalDestinoId: Uuid;
  lineas: Array<{ varianteId: Uuid; cantidad: number }>;
}>;

export type TransferenciaRecibida = EventoBase<'TransferenciaRecibida', {
  transferenciaId: Uuid;
  lineas: Array<{ varianteId: Uuid; cantidad: number }>;
  diferencias?: Array<{ varianteId: Uuid; diferencia: number }>;
}>;

// --- Caja -------------------------------------------------------------------

export type CajaAbierta = EventoBase<'CajaAbierta', {
  sesionCajaId: Uuid;
  turnoId: Uuid;
  fondoInicial: Money;
}>;

export type CajaCerrada = EventoBase<'CajaCerrada', {
  sesionCajaId: Uuid;
  totalContado: Money;
  diferencia: Money;
  totalesPorMedio: Record<string, Money>;
}>;

// --- Facturación ------------------------------------------------------------

export type ComprobanteEmitido = EventoBase<'ComprobanteEmitido', {
  comprobanteId: Uuid;
  tipo: 'FACTURA_A' | 'FACTURA_B' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  puntoVenta: number;
  numero: number;
  ventaId?: Uuid;
}>;

export type CAEObtenido = EventoBase<'CAEObtenido', {
  comprobanteId: Uuid;
  cae: string;
  vencimientoCae: string;
}>;

export type CAERechazado = EventoBase<'CAERechazado', {
  comprobanteId: Uuid;
  motivo: string;
  intentos: number;
}>;

// --- Clientes ---------------------------------------------------------------

export type CreditoClienteGenerado = EventoBase<'CreditoClienteGenerado', {
  clienteId: Uuid;
  monto: Money;
  origenDevolucionId: Uuid;
}>;

// --- Unión de todos los eventos --------------------------------------------

export type EventoDominio =
  | VentaConfirmada
  | DevolucionRegistrada
  | PrendaEntregada
  | StockDescontado
  | StockIngresado
  | TransferenciaEnviada
  | TransferenciaRecibida
  | CajaAbierta
  | CajaCerrada
  | ComprobanteEmitido
  | CAEObtenido
  | CAERechazado
  | CreditoClienteGenerado;

export type TipoEvento = EventoDominio['tipo'];
