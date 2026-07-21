# Marcelo Ross Hombre — Sistema POS

Sistema de punto de venta para comercio minorista de indumentaria masculina
multimarca (Córdoba, Argentina). Monolito modular offline-first, multi-sucursal.

> **Estado: Fase 1 — documentación y andamiaje.** Todavía no hay código de
> aplicación. Ver [`docs/roadmap.md`](docs/roadmap.md).

## Empezá por acá

1. [`CLAUDE.md`](CLAUDE.md) — contexto, stack, convenciones y reglas de arquitectura.
2. [`docs/arquitectura.md`](docs/arquitectura.md) — módulos, eventos de dominio, decisiones.
3. [`docs/modelo-datos.md`](docs/modelo-datos.md) — modelo conceptual de las 8 áreas.
4. [`docs/roadmap.md`](docs/roadmap.md) — orden de implementación.
5. [`docs/adr/`](docs/adr/) — decisiones de arquitectura registradas.

## Estructura del monorepo

```
apps/
  pos-web/          Frontend React (Vite + TanStack Query + Tailwind)
  pos-server/       Backend Fastify — un directorio por módulo de dominio
packages/
  core-domain/      Eventos de dominio + tipos compartidos (Money, IDs)
  contracts/        Interfaces públicas entre módulos (puertos)
prisma/             Esquema conceptual (migraciones por etapas)
docs/               Arquitectura, modelo de datos, roadmap, ADRs
```

## Stack

TypeScript · React 18 · Fastify · PostgreSQL 16 + Prisma · Vitest · Playwright ·
pnpm workspaces · Docker Compose.
