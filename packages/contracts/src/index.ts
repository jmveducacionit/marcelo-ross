/**
 * Puertos (interfaces públicas) entre módulos. Fase 1: contrato/andamiaje.
 * Ninguna implementación acá — solo las formas. Ver README.md.
 */
import type { Money, Uuid, EventoDominio, TipoEvento } from '@pos/core-domain';

/** Contexto de la operación en curso (para permisos y auditoría). */
export interface OperacionContext {
  usuarioId: Uuid;
  sucursalId: Uuid;
  cajaId?: Uuid;
}

/** Disponibilidad y descuento de stock. Lo consume Ventas. */
export interface StockPort {
  disponibilidad(varianteId: Uuid, sucursalId: Uuid): Promise<number>;
  reservar(varianteId: Uuid, cantidad: number, ctx: OperacionContext): Promise<void>;
  descontar(varianteId: Uuid, cantidad: number, ventaId: Uuid, ctx: OperacionContext): Promise<void>;
  reingresar(varianteId: Uuid, cantidad: number, motivo: string, ctx: OperacionContext): Promise<void>;
}

/** Registro de cobros en la caja abierta. Lo consume Ventas. */
export interface CajaPort {
  registrarCobro(input: {
    sesionCajaId: Uuid;
    medio: string;
    monto: Money;
    referenciaId: Uuid;
  }, ctx: OperacionContext): Promise<void>;
}

/** Datos de cliente y crédito a favor. Lo consumen Ventas y Facturación. */
export interface ClientesPort {
  datosFiscales(clienteId: Uuid): Promise<{
    condicionIva: string;
    cuit?: string;
    razonSocial?: string;
    domicilioFiscal?: string;
  } | null>;
  saldoCredito(clienteId: Uuid): Promise<Money>;
  usarCredito(clienteId: Uuid, monto: Money, ctx: OperacionContext): Promise<void>;
  generarCredito(clienteId: Uuid, monto: Money, origenDevolucionId: Uuid, ctx: OperacionContext): Promise<void>;
}

/**
 * Emisión de comprobante y obtención de CAE. Lo consume Facturación.
 * Aísla al intermediario ARCA: cambiar de proveedor = cambiar el adaptador.
 * Ver ADR-0005.
 */
export interface FacturacionArcaPort {
  emitir(input: {
    tipo: 'FACTURA_A' | 'FACTURA_B' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
    puntoVenta: number;
    neto: Money;
    iva: Money;
    total: Money;
    receptor?: { cuit?: string; condicionIva: string };
  }): Promise<
    | { estado: 'OBTENIDO'; cae: string; vencimientoCae: string; numero: number }
    | { estado: 'RECHAZADO'; motivo: string }
  >;
}

/** Bus de eventos con outbox transaccional. Transversal (shared). */
export interface EventBusPort {
  publicar(evento: EventoDominio): Promise<void>;
  suscribir<T extends TipoEvento>(
    tipo: T,
    handler: (evento: Extract<EventoDominio, { tipo: T }>) => Promise<void>,
  ): void;
}

/** Registro de auditoría de operaciones de dinero/stock. Transversal (shared). */
export interface AuditoriaPort {
  registrar(input: {
    entidad: string;
    entidadId: Uuid;
    accion: string;
    antes?: unknown;
    despues?: unknown;
  }, ctx: OperacionContext): Promise<void>;
}
