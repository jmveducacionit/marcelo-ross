/**
 * Guardas de la devolución. Corren SIN base: estas validaciones son deliberadamente
 * anteriores a abrir la transacción, así una devolución mal formada se rechaza
 * barato y sin tocar nada.
 *
 * Lo que depende de la base —control de doble devolución, snapshot del precio
 * pagado, reingreso de stock, acreditación— se verifica contra Postgres.
 */
import { describe, expect, it } from 'vitest';
import { ErrorDevolucion, registrarDevolucion } from './devoluciones.js';

const base = {
  sucursalId: 's-1', cajaId: 'c-1', usuarioId: 'u-1',
  resolucion: 'NOTA_CREDITO' as const,
  lineas: [{ varianteId: 'v-1', cantidad: 1 }],
};

describe('guardas de la devolución', () => {
  it('rechaza una devolución sin líneas', async () => {
    await expect(registrarDevolucion({ ...base, lineas: [] })).rejects.toBeInstanceOf(ErrorDevolucion);
  });

  it('rechaza cantidades no positivas', async () => {
    await expect(registrarDevolucion({ ...base, lineas: [{ varianteId: 'v-1', cantidad: 0 }] }))
      .rejects.toThrow(/enteros positivos/);
    await expect(registrarDevolucion({ ...base, lineas: [{ varianteId: 'v-1', cantidad: -2 }] }))
      .rejects.toThrow(/enteros positivos/);
  });

  it('rechaza cantidades fraccionarias', async () => {
    await expect(registrarDevolucion({ ...base, lineas: [{ varianteId: 'v-1', cantidad: 1.5 }] }))
      .rejects.toThrow(/enteros positivos/);
  });

  it('no deja generar crédito a favor sin cliente identificado', async () => {
    // Un crédito anónimo no se le puede pagar a nadie después.
    await expect(registrarDevolucion({ ...base, resolucion: 'CREDITO_A_FAVOR' }))
      .rejects.toThrow(/identificar al cliente/);
  });
});
