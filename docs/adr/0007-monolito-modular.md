# ADR-0007: Monolito modular (no microservicios, no packages por módulo)

- **Estado**: Aceptado
- **Fecha**: 2026-07-21
- **Decisores**: Arquitecto técnico, dueño

## Contexto

El sistema tiene 8 módulos con **límites explícitos** y **sin dependencias
circulares**. Hay que decidir cómo materializar esas fronteras físicamente. El
negocio es chico (2 locales, 3 cajas, ~45 tickets/día, picos de 180) y el
presupuesto de infraestructura es mínimo (un mini-PC por sucursal + un VPS chico).

## Opciones consideradas

1. **Microservicios** (un servicio por módulo o grupo) — fronteras duras por red,
   deploy independiente. **Contras:** N deploys, comunicación de red, consistencia
   distribuida, observabilidad, DevOps. Sobre-ingeniería flagrante a esta escala.
2. **Un package por módulo** en el monorepo (fronteras por límites de paquete) —
   enforcement físico fuerte. **Contras:** más ceremonia (versionado, build
   graph, tsconfig por paquete) mientras las fronteras todavía están madurando;
   refactor de límites más caro.
3. **Monolito modular**: un `pos-server`, módulos como **directorios** con API
   pública por `index.ts` (elegida).

## Decisión

**Monolito modular.** Un único `pos-server` Fastify por sucursal. Cada módulo es un
directorio en `apps/pos-server/src/modules/<modulo>/` que expone su **API pública
por `index.ts`** (el "puerto") y oculta el resto.

- **Enforcement de fronteras por lint de imports** (regla que prohíbe importar
  `modules/X/internal/...` desde afuera de X, y prohíbe ciclos). Barato y suficiente.
- **Comunicación entre módulos**: por **eventos de dominio** (desacople) o por
  **interfaces declaradas en `packages/contracts`** (cuando hace falta sincronía).
  Nunca por import directo de internals.
- `packages/core-domain` y `packages/contracts` **sí** son paquetes compartidos
  (tipos, eventos, puertos) porque los consumen tanto `pos-server` como `pos-web`.

## Consecuencias

- **Se gana:** simplicidad de build y deploy (un artefacto por sucursal);
  transacciones locales sin consistencia distribuida; refactor barato de las
  fronteras mientras el diseño madura; fronteras lógicas claras igual.
- **Se pierde / se acepta:** el aislamiento es por convención + lint, no físico —
  un import indebido es posible si el lint falla o se desactiva (mitigado en CI).
  No hay escalado independiente por módulo (innecesario a esta escala).
- **Seguimiento:** si un módulo concreto necesitara escalar o desplegarse aparte,
  la frontera (su `index.ts` + eventos) ya permite extraerlo a un servicio o
  paquete sin reescribir a los consumidores.
