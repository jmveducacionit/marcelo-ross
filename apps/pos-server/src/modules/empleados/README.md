# Módulo: Empleados

- **Estado**: parcial — **autenticación + RBAC implementados** (`apps/pos-server/src/auth/`);
  comisiones, turnos y ranking siguen pendientes.
- **Etapa de implementación**: 8 (auth adelantado a pedido)

## Autenticación (implementado)

Login por roles **Admin / Encargado / Cajero / Vendedor** (+ Contador RO). Argon2id,
sesión server-side revocable en cookie httpOnly, bloqueo por intentos, auditoría de
login. RBAC por mapa estático rol→permisos (`auth/permisos.ts`) con guards por
endpoint. Ver [ADR-0009](../../../../../docs/adr/0009-autenticacion-y-autorizacion.md)
y la matriz en `auth/permisos.ts`. Usuarios de demo en
[docs/prototipo.md](../../../../../docs/prototipo.md).

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
