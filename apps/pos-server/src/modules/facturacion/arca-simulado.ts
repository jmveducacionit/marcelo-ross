/**
 * Adaptador SIMULADO del intermediario de facturación (ADR-0005).
 *
 * ADR-0005 decidió integrar con ARCA vía intermediario y aislarlo detrás de
 * `FacturacionArcaPort`, justamente para que el resto del sistema no dependa de
 * quién sea. El intermediario todavía no está elegido, así que acá vive una
 * implementación que **simula** el ida y vuelta: numera, devuelve un CAE con
 * formato plausible y su vencimiento.
 *
 * Sirve para dos cosas: mostrar el circuito fiscal completo en la demo, y
 * garantizar que el día que se elija el proveedor real solo haya que escribir
 * otro archivo como este. Si el circuito funciona con el simulado, el problema
 * que queda es de credenciales y formato, no de diseño.
 *
 * NO ES FISCAL. Los CAE que devuelve son inventados y no valen ante ARCA.
 */
import type { FacturacionArcaPort } from '@pos/contracts';

/** Fallas simuladas, para poder mostrar la cola reintentando en la demo. */
export interface OpcionesSimulador {
  /** Probabilidad [0..1] de que el "intermediario" no responda. */
  probabilidadFalla?: number;
  /** Si es false, todo se rechaza: sirve para probar el camino de error. */
  disponible?: boolean;
}

export class ErrorIntermediario extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorIntermediario';
  }
}

/**
 * Un CAE real es de 14 dígitos. Se arma determinístico a partir de los datos del
 * comprobante para que reprocesar el mismo comprobante dé el mismo número — un
 * intermediario real también es idempotente por (punto de venta, tipo, número).
 */
function caeSimulado(semilla: string): string {
  let h = 0n;
  for (const c of semilla) h = (h * 31n + BigInt(c.charCodeAt(0))) % 100000000000000n;
  return h.toString().padStart(14, '0');
}

export function crearArcaSimulado(opciones: OpcionesSimulador = {}): FacturacionArcaPort {
  const { probabilidadFalla = 0, disponible = true } = opciones;

  return {
    async emitir(input) {
      // Latencia simulada: el circuito tiene que tolerar que esto tarde.
      await new Promise((r) => setTimeout(r, 120));

      if (!disponible) {
        throw new ErrorIntermediario('El intermediario de facturación no responde.');
      }
      if (probabilidadFalla > 0 && Math.random() < probabilidadFalla) {
        throw new ErrorIntermediario('Tiempo de espera agotado contra el intermediario.');
      }

      // Un receptor de Factura A sin CUIT lo rechazaría ARCA de verdad.
      if (input.tipo === 'FACTURA_A' && !input.receptor?.cuit) {
        return { estado: 'RECHAZADO', motivo: 'Factura A sin CUIT del receptor.' };
      }

      const semilla = `${input.puntoVenta}|${input.tipo}|${input.total}|${input.receptor?.cuit ?? 'CF'}`;
      const vencimiento = new Date();
      vencimiento.setDate(vencimiento.getDate() + 10); // ARCA da ~10 días

      return {
        estado: 'OBTENIDO',
        cae: caeSimulado(semilla),
        vencimientoCae: vencimiento.toISOString(),
        // La numeración real la asigna el emisor; el intermediario la confirma.
        numero: 0,
      };
    },
  };
}
