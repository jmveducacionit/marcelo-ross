/**
 * Guardas de caja que no necesitan base: se validan antes de abrir transacción.
 *
 * Lo que sí depende de Postgres —doble sesión abierta, cálculo del esperado,
 * retiro que excede el efectivo, arqueo— se verifica contra la base.
 */
import { describe, expect, it } from 'vitest';
import { ErrorCaja, abrirCaja, cerrarCaja, registrarMovimiento } from './sesiones.js';

const base = { cajaId: 'c-1', sucursalId: 's-1', usuarioId: 'u-1' };

describe('guardas de apertura', () => {
  it('rechaza un fondo inicial negativo', async () => {
    await expect(abrirCaja({ ...base, fondoInicial: -1 })).rejects.toBeInstanceOf(ErrorCaja);
  });

  it('rechaza un fondo inicial fraccionario', async () => {
    // El dinero son centavos enteros: medio centavo no existe (ADR-0003).
    await expect(abrirCaja({ ...base, fondoInicial: 100.5 })).rejects.toThrow(/entero/);
  });

  // Fondo cero NO se testea acá: pasa la guarda y sigue a la transacción, así que
  // sin base no se puede afirmar nada. Que sea válido (hay cajas que arrancan sin
  // cambio) se verifica contra Postgres.
});

describe('guardas de movimientos', () => {
  const mov = { sesionCajaId: 'ses-1', tipo: 'RETIRO' as const, monto: 1000, motivo: 'x', usuarioId: 'u-1', sucursalId: 's-1' };

  it('rechaza montos no positivos', async () => {
    await expect(registrarMovimiento({ ...mov, monto: 0 })).rejects.toThrow(/entero positivo/);
    await expect(registrarMovimiento({ ...mov, monto: -500 })).rejects.toThrow(/entero positivo/);
  });

  it('exige motivo: un movimiento de caja sin explicación no se puede auditar', async () => {
    await expect(registrarMovimiento({ ...mov, motivo: '' })).rejects.toThrow(/motivo/);
    await expect(registrarMovimiento({ ...mov, motivo: '   ' })).rejects.toThrow(/motivo/);
  });
});

describe('guardas de cierre', () => {
  it('rechaza un total contado negativo', async () => {
    await expect(cerrarCaja({ sesionCajaId: 's', totalContado: -1, usuarioId: 'u', sucursalId: 's-1' }))
      .rejects.toBeInstanceOf(ErrorCaja);
  });
});
