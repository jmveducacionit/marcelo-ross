/**
 * Módulo Proveedores — API pública (el "puerto"). ADR-0006 / ADR-0007.
 *
 * `operaciones.ts` es privado.
 *
 * Proveedores no escribe stock: se lo pide a Stock por su puerto transaccional
 * (`ingresarPorRemito`), dentro de la misma transacción. Recibir la mercadería y
 * cargarla al inventario son un solo hecho.
 *
 * La liquidación de consignación es la contracara de ADR-0006: la mercadería
 * consignada entra al stock sin generar deuda, y la deuda nace al VENDERLA.
 *
 * Todavía NO implementado: alta y edición de proveedores por UI, órdenes de
 * compra con su flujo completo (hoy el modelo existe y el remito puede
 * referenciarlas, pero no hay pantalla para emitirlas), y actualización masiva
 * de costos por lista de precios.
 */
import {
  calcularConsignacion, detalleProveedor, liquidarConsignacion, listarProveedores,
  pagarProveedor, recibirRemito,
  type LiquidarInput, type PagarInput, type RecibirRemitoInput,
} from './operaciones.js';

export { ErrorProveedor } from './operaciones.js';
export type { LiquidarInput, PagarInput, RecibirRemitoInput } from './operaciones.js';

export interface ProveedoresApi {
  listar(): ReturnType<typeof listarProveedores>;
  detalle(proveedorId: string): ReturnType<typeof detalleProveedor>;
  /** Recibe mercadería contra remito: ingresa stock y carga la deuda. */
  recibirRemito(input: RecibirRemitoInput): ReturnType<typeof recibirRemito>;
  /** Qué se le debe por lo consignado vendido en el período, SIN emitir. */
  calcularConsignacion(proveedorId: string, desde: Date, hasta: Date): ReturnType<typeof calcularConsignacion>;
  /** Emite la liquidación del período y la carga a la cuenta corriente. */
  liquidar(input: LiquidarInput): ReturnType<typeof liquidarConsignacion>;
  /** Registra un pago: baja el saldo. */
  pagar(input: PagarInput): ReturnType<typeof pagarProveedor>;
}

export const proveedores: ProveedoresApi = {
  listar: listarProveedores,
  detalle: detalleProveedor,
  recibirRemito,
  calcularConsignacion,
  liquidar: liquidarConsignacion,
  pagar: pagarProveedor,
};
