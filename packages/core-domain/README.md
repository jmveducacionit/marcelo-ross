# @pos/core-domain

Tipos y **contratos compartidos** del dominio, consumibles por `pos-server` y
`pos-web`. No contiene lógica de negocio ni acceso a datos.

- **Estado**: contrato definido (sin implementación aún — Fase 1).

## Contenido

- `eventos.ts` — **catálogo completo de eventos de dominio** (los 13), tipados.
  Definidos todos aunque algunos aún no tengan consumidor. Ver
  [`docs/arquitectura.md`](../../docs/arquitectura.md) §3.
- `money.ts` — tipo `Money` (enteros en centavos de ARS) y utilidades. Ver
  [ADR-0003](../../docs/adr/0003-representacion-monetaria-y-versionado-precios.md).
- `ids.ts` — tipo `Uuid` y generación UUIDv7. Ver
  [ADR-0008](../../docs/adr/0008-auditoria-transversal-y-uuidv7.md).

## Reglas

- Nadie muta estos tipos por conveniencia local: son el lenguaje común.
- Los eventos son **inmutables** y en **pasado**. Cambiar el shape de un evento
  publicado es un cambio contractual (versionar).
