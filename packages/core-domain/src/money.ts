/**
 * Dinero — enteros en la mínima unidad monetaria (centavos de ARS).
 * NUNCA float. Ver docs/adr/0003-representacion-monetaria-y-versionado-precios.md
 *
 * Fase 1: contrato/andamiaje. Sin implementación operativa todavía.
 */

/**
 * Money = cantidad de dinero en centavos de ARS, como entero.
 * Se usa un tipo "branded" para que el compilador no lo mezcle con otros bigint.
 * Ej: $85.000,00 -> 8_500_000n
 */
export type Money = bigint & { readonly __brand: 'Money' };

/** Moneda del sistema. Hoy solo ARS (ver seguimiento en ADR-0003). */
export const MONEDA = 'ARS' as const;

// --- Contratos de las utilidades a implementar en etapas posteriores ---

/** Construye Money a partir de centavos enteros. */
export declare function money(centavos: bigint | number): Money;

/** Suma/resta/escala — aritmética entera exacta. */
export declare function sumar(...montos: Money[]): Money;
export declare function restar(a: Money, b: Money): Money;

/**
 * Aplica un porcentaje y redondea a centavos con la regla única del sistema
 * (a definir en implementación: half-up / bankers). Nunca deja fracción de centavo.
 */
export declare function aplicarPorcentaje(monto: Money, porcentaje: number): Money;

/** Formatea a string para presentación (ej. "$85.000,00"). Solo en los bordes. */
export declare function formatear(monto: Money): string;
