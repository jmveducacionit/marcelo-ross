# Módulo: Control de Caja

- **Estado**: pendiente
- **Etapa de implementación**: 4

## Responsabilidad

Apertura/cierre por **turno** y por **caja**; arqueo; movimientos de efectivo
(retiros, gastos menores, ingresos manuales); diferencias; **conciliación de
medios electrónicos** contra liquidación bancaria (manual en V1).

## API pública (`index.ts`)

- Provee `CajaPort` (registrar cobros) a Ventas.
- `abrirCaja(...)`, `cerrarCaja(...)`, `registrarMovimiento(...)`, `arquear(...)`,
  `conciliarElectronicos(...)`.

## Depende de

- `EventBusPort`, `AuditoriaPort`.

## Eventos

- **Emite**: `CajaAbierta`, `CajaCerrada`.
- **Consume**: `VentaConfirmada`, `DevolucionRegistrada`, `ComprobanteEmitido`
  (para cuadrar totales por medio de pago del turno).

## Notas

- Toda entidad lleva `sucursalId` y `cajaId`. Conciliación electrónica: carga
  manual de la liquidación en V1 (automatizar el parseo es mejora futura).
