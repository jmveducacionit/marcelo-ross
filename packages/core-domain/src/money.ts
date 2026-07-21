/**
 * Dinero — enteros en la mínima unidad monetaria (centavos de ARS).
 * NUNCA float. Ver docs/adr/0003-representacion-monetaria-y-versionado-precios.md
 *
 * Regla de redondeo del sistema: MITAD ARRIBA (half away from zero).
 * Toda operación que produzca fracciones de centavo se redondea con esta regla.
 */

/**
 * Money = cantidad de dinero en centavos de ARS, como entero (bigint).
 * Tipo "branded" para que el compilador no lo mezcle con otros bigint.
 * Ej: $85.000,00 -> 8_500_000n
 */
export type Money = bigint & { readonly __brand: 'Money' };

/** Moneda del sistema. Hoy solo ARS (ver seguimiento en ADR-0003). */
export const MONEDA = 'ARS' as const;

/** Cero peso. */
export const CERO = 0n as Money;

/** Construye Money a partir de centavos enteros. Rechaza no-enteros. */
export function money(centavos: bigint | number): Money {
  if (typeof centavos === 'number') {
    if (!Number.isInteger(centavos)) {
      throw new RangeError(`Money espera centavos enteros, recibió ${centavos}`);
    }
    return BigInt(centavos) as Money;
  }
  return centavos as Money;
}

/** Construye Money a partir de un monto en pesos (ej. 85000 -> $85.000,00). */
export function desdePesos(pesos: number): Money {
  return money(Math.round(pesos * 100));
}

/** Suma exacta. */
export function sumar(...montos: Money[]): Money {
  return montos.reduce((acc, m) => (acc + m) as Money, CERO);
}

/** Resta exacta (a - b). */
export function restar(a: Money, b: Money): Money {
  return (a - b) as Money;
}

/** Multiplica un monto por una cantidad entera (ej. precio × unidades). */
export function multiplicarPorCantidad(monto: Money, cantidad: number): Money {
  if (!Number.isInteger(cantidad)) {
    throw new RangeError(`La cantidad debe ser entera, recibió ${cantidad}`);
  }
  return (monto * BigInt(cantidad)) as Money;
}

/**
 * División entera con redondeo MITAD ARRIBA (half away from zero).
 * Trabaja sobre bigint para no perder precisión.
 */
function redondearMitadArriba(numerador: bigint, denominador: bigint): bigint {
  const signo = (numerador < 0n) !== (denominador < 0n) ? -1n : 1n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;
  const cociente = n / d;
  const resto = n % d;
  const redondeado = resto * 2n >= d ? cociente + 1n : cociente;
  return signo * redondeado;
}

/**
 * Aplica un porcentaje a un monto y redondea a centavos (mitad arriba).
 * `porcentaje` es el número en por ciento: 21 = 21 %, 15.5 = 15,5 %.
 * Nunca deja fracción de centavo.
 */
export function aplicarPorcentaje(monto: Money, porcentaje: number): Money {
  // Escalamos el porcentaje a micro-porcentaje entero para evitar el float.
  const microPorcentaje = BigInt(Math.round(porcentaje * 1_000_000));
  // monto * (porcentaje / 100) = monto * microPorcentaje / 1e8
  return money(redondearMitadArriba(monto * microPorcentaje, 100_000_000n));
}

/** Formatea a string para presentación (es-AR). Usar SOLO en los bordes. */
export function formatear(monto: Money): string {
  const pesos = Number(monto) / 100;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: MONEDA,
  }).format(pesos);
}
