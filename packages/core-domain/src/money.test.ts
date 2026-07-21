import { describe, it, expect } from 'vitest';
import {
  money,
  desdePesos,
  sumar,
  restar,
  multiplicarPorCantidad,
  aplicarPorcentaje,
  formatear,
  CERO,
} from './money';

describe('Money', () => {
  it('construye desde centavos enteros', () => {
    expect(money(8_500_000n)).toBe(8_500_000n);
    expect(money(100)).toBe(100n);
  });

  it('rechaza centavos no enteros', () => {
    expect(() => money(10.5)).toThrow(RangeError);
  });

  it('convierte desde pesos', () => {
    expect(desdePesos(85000)).toBe(8_500_000n);
    expect(desdePesos(1234.56)).toBe(123_456n);
  });

  it('suma y resta exacto', () => {
    expect(sumar(money(100), money(250), money(50))).toBe(400n);
    expect(restar(money(1000), money(300))).toBe(700n);
    expect(sumar()).toBe(CERO);
  });

  it('multiplica por cantidad', () => {
    expect(multiplicarPorCantidad(desdePesos(85000), 3)).toBe(25_500_000n);
  });

  it('aplica porcentaje con redondeo mitad arriba', () => {
    // IVA 21% sobre $1.000,00 = $210,00
    expect(aplicarPorcentaje(desdePesos(1000), 21)).toBe(21_000n);
    // 10% de $10,05 = $1,005 -> redondea a $1,01 (mitad arriba)
    expect(aplicarPorcentaje(money(1005), 10)).toBe(101n);
    // 50% de 3 centavos = 1,5 -> 2 (mitad arriba)
    expect(aplicarPorcentaje(money(3), 50)).toBe(2n);
  });

  it('formatea en es-AR', () => {
    // El separador puede variar por entorno; validamos que incluya el número.
    expect(formatear(desdePesos(85000))).toContain('85.000');
  });
});
