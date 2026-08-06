/**
 * Módulo Ventas — API pública (el "puerto"). ADR-0007 / ADR-0010.
 *
 * `confirmar.ts` y `descuentos.ts` son privados: nadie fuera de este directorio
 * los importa.
 *
 * Ventas **no escribe stock**: se lo pide al módulo Stock por su puerto, dentro
 * de la misma transacción, así vender y descontar son un solo commit. Tampoco
 * emite comprobantes fiscales: eso es Facturación, que reacciona a
 * `VentaConfirmada`.
 *
 * Operaciones todavía NO implementadas: entrega de la prenda ajustada y
 * anulación de venta. No se declaran acá hasta existir — una firma que no hace
 * nada desinforma más de lo que documenta.
 */
import { ventaDetalle } from './consultas.js';
import { confirmarVenta, type ConfirmarVentaInput } from './confirmar.js';
import { registrarDevolucion, type RegistrarDevolucionInput } from './devoluciones.js';
import { previsualizarVenta, type PreviewVentaInput, type PreviewVentaResultado } from './preview.js';

export type { ConfirmarVentaInput } from './confirmar.js';
export { ErrorDescuento } from './descuentos.js';
export type { TipoDescuento, DefinicionDescuento } from './descuentos.js';
export { ErrorDevolucion } from './devoluciones.js';
export type { RegistrarDevolucionInput, ResolucionDevolucion } from './devoluciones.js';
export type { PreviewVentaInput, PreviewVentaResultado } from './preview.js';

/** Resultado de confirmar una venta. Los montos van como string: son `Money`. */
export interface VentaConfirmadaResultado {
  ventaId: string;
  subtotal: string;
  totalDescuentos: string;
  total: string;
  /** Reintegros bancarios informados. NO están restados del total. */
  reintegros: string[];
  estadoEntrega: 'ENTREGADA' | 'PENDIENTE_AJUSTE';
}

/** Resultado de registrar una devolución. */
export interface DevolucionResultado {
  devolucionId: string;
  total: string;
  resolucion: 'NOTA_CREDITO' | 'CREDITO_A_FAVOR' | 'CAMBIO';
  conTicket: boolean;
  /** Saldo del cliente después de acreditar. `null` si no hubo crédito. */
  saldoCredito: string | null;
}

export interface VentasApi {
  /**
   * Confirma una venta de forma transaccional: snapshot de precios, descuentos,
   * descuento de stock por el puerto de Stock, evento y auditoría.
   */
  confirmar(input: ConfirmarVentaInput): Promise<VentaConfirmadaResultado>;
  /**
   * Registra una devolución: reingresa el stock y, si corresponde, acredita
   * saldo a favor. Todo en una transacción.
   */
  devolver(input: RegistrarDevolucionInput): Promise<DevolucionResultado>;
  /**
   * Mismos números que `confirmar`, sin escribir nada. Para que el front no
   * tenga que reimplementar la aritmética de dinero.
   */
  previsualizar(input: PreviewVentaInput): Promise<PreviewVentaResultado>;
  /** Detalle de una venta con lo ya devuelto por línea. `null` si no existe. */
  detalle(ventaId: string): ReturnType<typeof ventaDetalle>;
}

export const ventas: VentasApi = {
  confirmar: confirmarVenta as VentasApi['confirmar'],
  devolver: registrarDevolucion as VentasApi['devolver'],
  previsualizar: previsualizarVenta,
  detalle: ventaDetalle,
};
