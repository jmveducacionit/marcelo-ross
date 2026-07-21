# Módulo: Empleados

- **Estado**: pendiente
- **Etapa de implementación**: 8 (roles/permisos mínimos ya en Etapa 1)

## Responsabilidad

Usuarios; **roles y permisos** (VENDEDOR, ENCARGADO, ADMIN, CONTADOR_RO — solo
lectura de reportes); **comisiones por venta** (sobre venta **neta de
devoluciones**, calculadas al liquidar); control de turnos; ranking individual.

## API pública (`index.ts`)

- `autenticar(...)`, `autorizar(rol, permiso)`, `liquidarComisiones(periodo)`,
  `rankingVendedores(...)`, gestión de usuarios/roles.
- Provee identidad y permisos que usa `shared/permisos`.

## Depende de

- `EventBusPort`, `AuditoriaPort`.

## Eventos

- **Consume**: `VentaConfirmada`, `DevolucionRegistrada` (base de comisión neta),
  `CajaAbierta`/`CajaCerrada` (turnos/ranking).

## Notas

- Comisión sobre **venta neta de devoluciones**, al liquidar (no al vender).
- El contador externo es **solo lectura** de reportes.
