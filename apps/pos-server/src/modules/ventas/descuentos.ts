/**
 * Motor de descuentos — ADR-0004.
 *
 * Catálogo TIPADO y cerrado, no un motor de reglas configurable: el conjunto de
 * promociones de este comercio se conoce y es acotado. Agregar un tipo nuevo
 * cuesta código, y es el trade-off elegido a favor de la simplicidad.
 *
 * Dos invariantes que vienen del ADR y que este archivo tiene que sostener:
 *
 *  1. **Cada aplicación guarda el MONTO en Money, no la fórmula.** Un ticket
 *     reimpreso el mes que viene tiene que dar el mismo número aunque las reglas
 *     hayan cambiado. Es el mismo criterio que el snapshot del precio (ADR-0003).
 *  2. **El reintegro bancario NO es una rebaja de precio.** El cliente paga el
 *     precio completo y el banco le devuelve después. Si se restara del total, el
 *     ticket, la caja y el margen quedarían todos mal.
 *
 * Este archivo es PURO: no toca la base ni Prisma. Eso lo hace testeable sin
 * levantar nada, que es lo que permite tener los casos de borde cubiertos.
 */
import {
  CERO, aplicarPorcentaje, money, multiplicarPorCantidad, restar, sumar, type Money,
} from '@pos/core-domain';

export type TipoDescuento =
  | 'PORCENTAJE' | 'MONTO_FIJO' | 'COMBO' | 'LIQUIDACION' | 'EMPLEADO' | 'PROMO_BANCARIA';

/** Definición del catálogo (dato editable por Admin/Encargado). */
export interface DefinicionDescuento {
  id: string;
  nombre: string;
  tipo: TipoDescuento;
  /** Parámetros propios del tipo. Ver `reglasDe*` más abajo. */
  reglas: Record<string, unknown>;
  requiereAutorizacion: boolean;
  vigenciaDesde: Date | null;
  vigenciaHasta: Date | null;
}

export interface LineaParaDescuento {
  id: string;
  cantidad: number;
  precioUnitario: Money;
  subtotalLinea: Money;
}

/** Lo que pide el cajero: qué descuento, sobre qué línea (o sobre el ticket). */
export interface DescuentoPedido {
  descuentoId: string;
  /** Si viene, el descuento es de línea. Si no, es de nivel ticket. */
  lineaId?: string;
  /** Usuario que autorizó, cuando el descuento lo exige. */
  autorizadoPor?: string;
}

/** Una aplicación concreta, lista para persistir en `DescuentoAplicado`. */
export interface AplicacionDescuento {
  lineaVentaId?: string;
  descuentoId: string;
  tipo: TipoDescuento;
  montoDescontado: Money;
  autorizadoPor?: string;
  /** Prorrateo del descuento de ticket sobre cada línea, para el margen. */
  prorrateo?: Array<{ lineaVentaId: string; monto: Money }>;
}

export interface ResultadoDescuentos {
  /** Descuento efectivo por línea (incluye el prorrateo del nivel ticket). */
  porLinea: Map<string, Money>;
  /** Total que SE RESTA del ticket. No incluye reintegros. */
  totalDescuentos: Money;
  /** Aplicaciones a persistir. */
  aplicaciones: AplicacionDescuento[];
  /**
   * Reintegros bancarios: se informan al cliente y se concilian, pero NO bajan
   * lo que se cobra. Van aparte a propósito.
   */
  reintegros: Array<{ descuentoId: string; tipo: TipoDescuento; monto: Money }>;
}

export class ErrorDescuento extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDescuento';
  }
}

// --- Lectura de reglas -------------------------------------------------------

function numero(reglas: Record<string, unknown>, clave: string, def: DefinicionDescuento): number {
  const v = reglas[clave];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ErrorDescuento(`El descuento "${def.nombre}" no tiene una regla "${clave}" válida.`);
  }
  return v;
}

// --- Cálculo por tipo --------------------------------------------------------

/**
 * Monto que un descuento le quita a una línea.
 * Nunca devuelve más que el subtotal de la línea: un descuento no puede dejar
 * la línea en negativo por más que las reglas digan lo contrario.
 */
function montoSobreLinea(def: DefinicionDescuento, linea: LineaParaDescuento): Money {
  let bruto: Money;

  switch (def.tipo) {
    case 'PORCENTAJE':
    case 'LIQUIDACION':
    case 'EMPLEADO':
      bruto = aplicarPorcentaje(linea.subtotalLinea, numero(def.reglas, 'porcentaje', def));
      break;

    case 'MONTO_FIJO':
      bruto = money(BigInt(Math.trunc(numero(def.reglas, 'monto', def))));
      break;

    case 'COMBO': {
      // "lleva 3, paga 2": por cada grupo completo se regala (lleva - paga)
      // unidades, al precio unitario de la línea. Las unidades sueltas que no
      // completan un grupo no se descuentan.
      const lleva = Math.trunc(numero(def.reglas, 'lleva', def));
      const paga = Math.trunc(numero(def.reglas, 'paga', def));
      if (lleva <= 0 || paga < 0 || paga >= lleva) {
        throw new ErrorDescuento(`El combo "${def.nombre}" tiene reglas inconsistentes (lleva ${lleva}, paga ${paga}).`);
      }
      const grupos = Math.floor(linea.cantidad / lleva);
      bruto = multiplicarPorCantidad(linea.precioUnitario, grupos * (lleva - paga));
      break;
    }

    case 'PROMO_BANCARIA':
      throw new ErrorDescuento(
        `"${def.nombre}" es un reintegro bancario: se aplica al ticket, no a una línea.`,
      );

    default: {
      const _exhaustivo: never = def.tipo;
      throw new ErrorDescuento(`Tipo de descuento desconocido: ${_exhaustivo}`);
    }
  }

  return bruto > linea.subtotalLinea ? linea.subtotalLinea : bruto;
}

// --- Validaciones ------------------------------------------------------------

function validar(def: DefinicionDescuento, pedido: DescuentoPedido, ahora: Date): void {
  if (def.vigenciaDesde && ahora < def.vigenciaDesde) {
    throw new ErrorDescuento(`El descuento "${def.nombre}" todavía no está vigente.`);
  }
  if (def.vigenciaHasta && ahora > def.vigenciaHasta) {
    throw new ErrorDescuento(`El descuento "${def.nombre}" está vencido.`);
  }
  if (def.requiereAutorizacion && !pedido.autorizadoPor) {
    throw new ErrorDescuento(`El descuento "${def.nombre}" requiere autorización de un encargado.`);
  }
}

// --- Motor -------------------------------------------------------------------

/**
 * Calcula todos los descuentos de una venta.
 *
 * Orden determinístico (ADR-0004): **primero los de línea, después los de
 * ticket**. El de ticket se calcula sobre el subtotal YA descontado, así dos
 * descuentos apilados no se pisan y el total es reproducible.
 */
export function calcularDescuentos(
  lineas: LineaParaDescuento[],
  pedidos: DescuentoPedido[],
  catalogo: Map<string, DefinicionDescuento>,
  ahora: Date = new Date(),
): ResultadoDescuentos {
  const porLinea = new Map<string, Money>(lineas.map((l) => [l.id, CERO]));
  const aplicaciones: AplicacionDescuento[] = [];
  const reintegros: ResultadoDescuentos['reintegros'] = [];
  const porId = new Map(lineas.map((l) => [l.id, l]));

  const definicionDe = (pedido: DescuentoPedido): DefinicionDescuento => {
    const def = catalogo.get(pedido.descuentoId);
    if (!def) throw new ErrorDescuento(`El descuento ${pedido.descuentoId} no existe.`);
    validar(def, pedido, ahora);
    return def;
  };

  // --- 1. Descuentos de línea ---
  //
  // Se apilan EN CASCADA, no se suman: un 70% sobre otro 70% da 91 %, no 140 %.
  // Es la lectura comercial de "descuento sobre descuento", y tiene la propiedad
  // útil de que nunca puede pasarse del subtotal por más porcentajes que se
  // agreguen.
  for (const pedido of pedidos.filter((p) => p.lineaId)) {
    const linea = porId.get(pedido.lineaId!);
    if (!linea) throw new ErrorDescuento(`La línea ${pedido.lineaId} no pertenece a esta venta.`);
    const def = definicionDe(pedido);

    // Lo ya descontado en esta línea acota lo que todavía se puede descontar.
    const yaDescontado = porLinea.get(linea.id)!;
    const disponible = restar(linea.subtotalLinea, yaDescontado);
    const monto = montoSobreLinea(def, { ...linea, subtotalLinea: disponible });

    porLinea.set(linea.id, sumar(yaDescontado, monto));
    aplicaciones.push({
      lineaVentaId: linea.id, descuentoId: def.id, tipo: def.tipo, montoDescontado: monto,
      ...(pedido.autorizadoPor ? { autorizadoPor: pedido.autorizadoPor } : {}),
    });
  }

  // --- 2. Descuentos de nivel ticket ---
  const subtotalNeto = lineas.reduce(
    (acc, l) => sumar(acc, restar(l.subtotalLinea, porLinea.get(l.id)!)),
    CERO,
  );

  for (const pedido of pedidos.filter((p) => !p.lineaId)) {
    const def = definicionDe(pedido);

    if (def.tipo === 'PROMO_BANCARIA') {
      // Reintegro: se calcula sobre el neto y se topea, pero NO se resta.
      let monto = aplicarPorcentaje(subtotalNeto, numero(def.reglas, 'porcentaje', def));
      const tope = def.reglas['tope'];
      if (typeof tope === 'number' && monto > BigInt(Math.trunc(tope))) {
        monto = money(BigInt(Math.trunc(tope)));
      }
      reintegros.push({ descuentoId: def.id, tipo: def.tipo, monto });
      aplicaciones.push({ descuentoId: def.id, tipo: def.tipo, montoDescontado: monto });
      continue;
    }

    if (def.tipo === 'COMBO') {
      throw new ErrorDescuento(`El combo "${def.nombre}" se aplica a una línea, no al ticket.`);
    }

    const monto =
      def.tipo === 'MONTO_FIJO'
        ? money(BigInt(Math.trunc(numero(def.reglas, 'monto', def))))
        : aplicarPorcentaje(subtotalNeto, numero(def.reglas, 'porcentaje', def));
    const efectivo = monto > subtotalNeto ? subtotalNeto : monto;

    // Prorrateo a las líneas: sin esto el margen por producto es mentira en
    // cualquier venta con promoción de ticket (ADR-0004).
    const prorrateo = prorratear(efectivo, lineas, porLinea);
    for (const p of prorrateo) porLinea.set(p.lineaVentaId, sumar(porLinea.get(p.lineaVentaId)!, p.monto));

    aplicaciones.push({
      descuentoId: def.id, tipo: def.tipo, montoDescontado: efectivo, prorrateo,
      ...(pedido.autorizadoPor ? { autorizadoPor: pedido.autorizadoPor } : {}),
    });
  }

  const totalDescuentos = lineas.reduce((acc, l) => sumar(acc, porLinea.get(l.id)!), CERO);
  return { porLinea, totalDescuentos, aplicaciones, reintegros };
}

/**
 * Reparte un monto entre las líneas en proporción a su neto.
 *
 * El resto de la división entera se le asigna a la línea de mayor neto, así la
 * suma del prorrateo es EXACTAMENTE el monto repartido. Sin ese ajuste se
 * pierden centavos y el total de la venta deja de cerrar contra la suma de sus
 * líneas — que es justo el tipo de diferencia que aparece recién en el arqueo.
 */
function prorratear(
  monto: Money,
  lineas: LineaParaDescuento[],
  yaDescontado: Map<string, Money>,
): Array<{ lineaVentaId: string; monto: Money }> {
  const netos = lineas.map((l) => ({ id: l.id, neto: restar(l.subtotalLinea, yaDescontado.get(l.id)!) }));
  const totalNeto = netos.reduce((acc, n) => sumar(acc, n.neto), CERO);
  if (totalNeto === CERO) return [];

  const reparto = netos.map((n) => ({
    lineaVentaId: n.id,
    monto: money((monto * n.neto) / totalNeto), // división entera: trunca
  }));

  const repartido = reparto.reduce((acc, r) => sumar(acc, r.monto), CERO);
  const resto = restar(monto, repartido);
  if (resto !== CERO) {
    const mayor = netos.reduce((a, b) => (b.neto > a.neto ? b : a));
    const destino = reparto.find((r) => r.lineaVentaId === mayor.id)!;
    destino.monto = sumar(destino.monto, resto);
  }
  return reparto;
}
