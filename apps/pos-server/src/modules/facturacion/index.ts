/**
 * Módulo Facturación — API pública (el "puerto"). ADR-0005 / ADR-0007.
 *
 * `comprobantes.ts` y `arca-simulado.ts` son privados.
 *
 * Facturación **reacciona** a `VentaConfirmada`: no vive dentro de la
 * transacción de la venta. Es la traducción directa de la regla de ADR-0001 —
 * la venta no espera al CAE. Si el intermediario está caído, la caja sigue
 * vendiendo y el comprobante queda encolado.
 *
 * El adaptador al intermediario está detrás de `FacturacionArcaPort`
 * (`@pos/contracts`). Hoy hay uno SIMULADO porque el proveedor todavía no se
 * eligió. Cambiarlo es escribir otro archivo, no tocar este módulo.
 *
 * Todavía NO implementado: notas de crédito por devolución (la devolución se
 * registra, pero no genera NC), notas de débito, y la exportación del libro IVA
 * a un archivo para el contador (hoy se consulta, no se descarga).
 */
import {
  emitirParaVenta, libroIvaVentas, listarComprobantes, procesarCola,
  recuperarVentasSinComprobante, resumenCola, usarPuertoArca,
} from './comprobantes.js';

export { ALICUOTA_IVA, MAX_INTENTOS, desagregarIva, tipoParaCliente, usarPuertoArca } from './comprobantes.js';
export { ErrorIntermediario, crearArcaSimulado } from './arca-simulado.js';

export interface FacturacionApi {
  /** Registra y encola el comprobante de una venta. Idempotente por venta. */
  emitirParaVenta(ventaId: string): ReturnType<typeof emitirParaVenta>;
  /** Procesa la cola de CAE: reintenta contra el intermediario. */
  procesarCola(limite?: number): ReturnType<typeof procesarCola>;
  /** Ventas confirmadas que se quedaron sin comprobante. Devuelve cuántas recuperó. */
  recuperar(limite?: number): Promise<number>;
  listar(sucursalId?: string, limite?: number): ReturnType<typeof listarComprobantes>;
  resumen(sucursalId?: string): ReturnType<typeof resumenCola>;
  libroIva(desde: Date, hasta: Date, sucursalId?: string): ReturnType<typeof libroIvaVentas>;
}

export const facturacion: FacturacionApi = {
  emitirParaVenta,
  procesarCola,
  recuperar: recuperarVentasSinComprobante,
  listar: listarComprobantes,
  resumen: resumenCola,
  libroIva: libroIvaVentas,
};

/**
 * Arranca los procesos de fondo del módulo.
 *
 * Dos loops separados a propósito: uno recupera ventas sin comprobante (la red
 * de seguridad del consumidor in-process) y otro empuja la cola de CAE. Si el
 * intermediario está caído, el segundo falla y el primero sigue funcionando.
 */
export function iniciarWorkers(intervaloMs = 15_000): () => void {
  let corriendo = false;

  const tick = async () => {
    if (corriendo) return; // no encimar dos pasadas
    corriendo = true;
    try {
      const recuperadas = await recuperarVentasSinComprobante();
      if (recuperadas > 0) console.log(`[facturacion] ${recuperadas} venta(s) sin comprobante recuperada(s)`);
      const r = await procesarCola();
      if (r.procesados > 0) {
        console.log(`[facturacion] cola: ${r.obtenidos} con CAE, ${r.rechazados} rechazados, ${r.reintentar} a reintentar`);
      }
    } catch (e) {
      // Un fallo del worker no puede tumbar el servidor: la caja tiene que seguir vendiendo.
      console.error('[facturacion] error en el worker:', e instanceof Error ? e.message : e);
    } finally {
      corriendo = false;
    }
  };

  const timer = setInterval(tick, intervaloMs);
  void tick(); // primera pasada al arrancar
  return () => clearInterval(timer);
}

// Silenciar el "no usado" del re-export sin perder el símbolo público.
void usarPuertoArca;
