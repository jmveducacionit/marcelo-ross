# pos-server

Backend del POS. Node.js + Fastify, **monolito modular** por dominio. Un `pos-server`
por sucursal, con PostgreSQL en la misma LAN. Ver
[ADR-0007](../../docs/adr/0007-monolito-modular.md).

- **Estado**: pendiente (Fase 1: solo andamiaje — estructura + contratos).

## Estructura

```
src/
  modules/          un directorio por módulo; API pública en su index.ts
    ventas/  stock/  caja/  empleados/
    clientes/  dashboard/  facturacion/  proveedores/
  shared/           preocupaciones transversales (auditoría, eventos+outbox,
                    Money, IDs, sync, permisos, acceso a DB)
```

## Reglas (ver docs/arquitectura.md §1)

1. Un módulo solo se importa por su `index.ts`. Prohibido tocar internals ajenos.
2. Sin dependencias circulares (se hace cumplir con lint de imports).
3. Comunicación entre módulos: **eventos de dominio** (`@pos/core-domain`) o
   **puertos** (`@pos/contracts`). Nunca import directo.
4. `shared/` es dependido por los módulos, nunca al revés.
5. Toda operación de dinero/stock deja **auditoría**; dinero en `Money` (centavos);
   IDs `Uuid` (UUIDv7); toda entidad transaccional lleva `sucursalId`.

## Módulos y estado

| Módulo | Estado | README |
|--------|--------|--------|
| ventas | pendiente | [ventas](src/modules/ventas/README.md) |
| stock | pendiente | [stock](src/modules/stock/README.md) |
| caja | pendiente | [caja](src/modules/caja/README.md) |
| empleados | pendiente | [empleados](src/modules/empleados/README.md) |
| clientes | pendiente | [clientes](src/modules/clientes/README.md) |
| dashboard | pendiente | [dashboard](src/modules/dashboard/README.md) |
| facturacion | pendiente | [facturacion](src/modules/facturacion/README.md) |
| proveedores | pendiente | [proveedores](src/modules/proveedores/README.md) |
