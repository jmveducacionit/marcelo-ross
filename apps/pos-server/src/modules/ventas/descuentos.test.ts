/**
 * El motor de descuentos es el lugar donde el dinero se puede perder en silencio:
 * un centavo mal prorrateado no rompe nada hoy y aparece en el arqueo. Por eso
 * los casos de borde están cubiertos y no solo el camino feliz.
 */
import { describe, expect, it } from 'vitest';
import { desdePesos, type Money } from '@pos/core-domain';
import {
  ErrorDescuento, calcularDescuentos,
  type DefinicionDescuento, type LineaParaDescuento,
} from './descuentos.js';

const def = (p: Partial<DefinicionDescuento> & Pick<DefinicionDescuento, 'id' | 'tipo' | 'reglas'>): DefinicionDescuento => ({
  nombre: p.id, requiereAutorizacion: false, vigenciaDesde: null, vigenciaHasta: null, ...p,
});

const catalogo = (...defs: DefinicionDescuento[]) => new Map(defs.map((d) => [d.id, d]));

const linea = (id: string, precioPesos: number, cantidad: number): LineaParaDescuento => ({
  id, cantidad,
  precioUnitario: desdePesos(precioPesos),
  subtotalLinea: (desdePesos(precioPesos) * BigInt(cantidad)) as Money,
});

describe('descuentos de línea', () => {
  it('aplica un porcentaje sobre el subtotal de la línea', () => {
    const l = linea('l1', 100_000, 2); // $200.000
    const r = calcularDescuentos([l], [{ descuentoId: 'd', lineaId: 'l1' }],
      catalogo(def({ id: 'd', tipo: 'PORCENTAJE', reglas: { porcentaje: 10 } })));

    expect(r.totalDescuentos).toBe(desdePesos(20_000));
    expect(r.aplicaciones[0]).toMatchObject({ lineaVentaId: 'l1', tipo: 'PORCENTAJE' });
  });

  it('un combo 3x2 descuenta una unidad por cada grupo completo', () => {
    const l = linea('l1', 45_000, 7); // 2 grupos de 3 -> 2 unidades gratis, sobra 1
    const r = calcularDescuentos([l], [{ descuentoId: 'c', lineaId: 'l1' }],
      catalogo(def({ id: 'c', tipo: 'COMBO', reglas: { lleva: 3, paga: 2 } })));

    expect(r.totalDescuentos).toBe(desdePesos(90_000));
  });

  it('un combo sin grupo completo no descuenta nada', () => {
    const l = linea('l1', 45_000, 2);
    const r = calcularDescuentos([l], [{ descuentoId: 'c', lineaId: 'l1' }],
      catalogo(def({ id: 'c', tipo: 'COMBO', reglas: { lleva: 3, paga: 2 } })));

    expect(r.totalDescuentos).toBe(0n);
  });

  it('nunca descuenta más que el subtotal de la línea', () => {
    const l = linea('l1', 10_000, 1); // $10.000
    const r = calcularDescuentos([l], [{ descuentoId: 'm', lineaId: 'l1' }],
      catalogo(def({ id: 'm', tipo: 'MONTO_FIJO', reglas: { monto: 5_000_000 } }))); // $50.000

    expect(r.totalDescuentos).toBe(desdePesos(10_000));
  });

  it('dos porcentajes apilados se aplican en cascada, no se suman', () => {
    const l = linea('l1', 10_000, 1);
    const r = calcularDescuentos(
      [l],
      [{ descuentoId: 'a', lineaId: 'l1' }, { descuentoId: 'b', lineaId: 'l1' }],
      catalogo(
        def({ id: 'a', tipo: 'PORCENTAJE', reglas: { porcentaje: 70 } }),
        def({ id: 'b', tipo: 'PORCENTAJE', reglas: { porcentaje: 70 } }),
      ),
    );
    // 70% de 10.000 = 7.000; el segundo 70% va sobre los 3.000 que quedan = 2.100.
    // Total 9.100, no 14.000: "descuento sobre descuento", no suma de porcentajes.
    expect(r.totalDescuentos).toBe(desdePesos(9_100));
  });

  it('descuentos apilados nunca superan el subtotal de la línea', () => {
    const l = linea('l1', 10_000, 1);
    const r = calcularDescuentos(
      [l],
      [{ descuentoId: 'a', lineaId: 'l1' }, { descuentoId: 'b', lineaId: 'l1' }],
      catalogo(
        def({ id: 'a', tipo: 'MONTO_FIJO', reglas: { monto: 800_000 } }), // $8.000
        def({ id: 'b', tipo: 'MONTO_FIJO', reglas: { monto: 800_000 } }), // otros $8.000
      ),
    );
    expect(r.totalDescuentos).toBe(desdePesos(10_000)); // no $16.000
  });
});

describe('descuentos de ticket', () => {
  it('se calcula sobre el neto, después de los de línea', () => {
    const l = linea('l1', 100_000, 1);
    const r = calcularDescuentos(
      [l],
      [{ descuentoId: 'linea', lineaId: 'l1' }, { descuentoId: 'ticket' }],
      catalogo(
        def({ id: 'linea', tipo: 'PORCENTAJE', reglas: { porcentaje: 50 } }),  // -> $50.000
        def({ id: 'ticket', tipo: 'PORCENTAJE', reglas: { porcentaje: 10 } }), // 10% de 50.000
      ),
    );
    // 50.000 + 5.000 = 55.000. Si el de ticket se calculara sobre el bruto serían 60.000.
    expect(r.totalDescuentos).toBe(desdePesos(55_000));
  });

  it('prorratea a las líneas sin perder ni un centavo', () => {
    // 3 líneas de netos desparejos y un monto que no divide exacto.
    const lineas = [linea('l1', 33_333, 1), linea('l2', 33_333, 1), linea('l3', 33_334, 1)];
    const r = calcularDescuentos([...lineas], [{ descuentoId: 't' }],
      catalogo(def({ id: 't', tipo: 'MONTO_FIJO', reglas: { monto: 1_000_001 } }))); // $10.000,01

    const sumaProrrateo = [...r.porLinea.values()].reduce((a, b) => a + b, 0n);
    expect(sumaProrrateo).toBe(1_000_001n);
    expect(r.totalDescuentos).toBe(1_000_001n);
  });

  it('un combo no se puede aplicar al ticket', () => {
    expect(() =>
      calcularDescuentos([linea('l1', 1000, 1)], [{ descuentoId: 'c' }],
        catalogo(def({ id: 'c', tipo: 'COMBO', reglas: { lleva: 3, paga: 2 } }))),
    ).toThrow(ErrorDescuento);
  });
});

describe('reintegro bancario', () => {
  it('NO baja el total del ticket: se informa aparte', () => {
    const l = linea('l1', 100_000, 1);
    const r = calcularDescuentos([l], [{ descuentoId: 'banco' }],
      catalogo(def({ id: 'banco', tipo: 'PROMO_BANCARIA', reglas: { porcentaje: 20 } })));

    expect(r.totalDescuentos).toBe(0n);            // el cliente paga el precio completo
    expect(r.reintegros).toHaveLength(1);
    expect(r.reintegros[0]!.monto).toBe(desdePesos(20_000));
  });

  it('respeta el tope de reintegro', () => {
    const l = linea('l1', 500_000, 1);
    const r = calcularDescuentos([l], [{ descuentoId: 'banco' }],
      catalogo(def({ id: 'banco', tipo: 'PROMO_BANCARIA', reglas: { porcentaje: 20, tope: 2_000_000 } })));

    expect(r.reintegros[0]!.monto).toBe(desdePesos(20_000)); // topeado en $20.000
  });

  it('no se puede aplicar a una línea', () => {
    expect(() =>
      calcularDescuentos([linea('l1', 1000, 1)], [{ descuentoId: 'b', lineaId: 'l1' }],
        catalogo(def({ id: 'b', tipo: 'PROMO_BANCARIA', reglas: { porcentaje: 10 } }))),
    ).toThrow(ErrorDescuento);
  });
});

describe('autorización y vigencia', () => {
  it('rechaza un descuento que exige autorización si no viene quién autorizó', () => {
    expect(() =>
      calcularDescuentos([linea('l1', 1000, 1)], [{ descuentoId: 'd', lineaId: 'l1' }],
        catalogo(def({ id: 'd', tipo: 'PORCENTAJE', reglas: { porcentaje: 50 }, requiereAutorizacion: true }))),
    ).toThrow(/requiere autorización/);
  });

  it('registra quién autorizó', () => {
    const r = calcularDescuentos(
      [linea('l1', 100_000, 1)],
      [{ descuentoId: 'd', lineaId: 'l1', autorizadoPor: 'encargado-1' }],
      catalogo(def({ id: 'd', tipo: 'PORCENTAJE', reglas: { porcentaje: 50 }, requiereAutorizacion: true })),
    );
    expect(r.aplicaciones[0]!.autorizadoPor).toBe('encargado-1');
  });

  it('rechaza un descuento vencido', () => {
    expect(() =>
      calcularDescuentos([linea('l1', 1000, 1)], [{ descuentoId: 'd', lineaId: 'l1' }],
        catalogo(def({
          id: 'd', tipo: 'LIQUIDACION', reglas: { porcentaje: 30 },
          vigenciaHasta: new Date('2026-01-31'),
        })),
        new Date('2026-08-06')),
    ).toThrow(/vencido/);
  });

  it('rechaza un descuento inexistente', () => {
    expect(() =>
      calcularDescuentos([linea('l1', 1000, 1)], [{ descuentoId: 'fantasma', lineaId: 'l1' }], catalogo()),
    ).toThrow(/no existe/);
  });
});
