# ADR-0010: Enforcement de fronteras de módulo y auditoría obligatoria

- **Estado**: Aceptado
- **Fecha**: 2026-07-28
- **Decisores**: Arquitecto técnico, dueño
- **Relacionado**: complementa [ADR-0007](0007-monolito-modular.md) y
  [ADR-0008](0008-auditoria-transversal-y-uuidv7.md). **No los supera**: los hace
  cumplir.

## Contexto

Un relevamiento del repo sobre el commit `e42feea` detectó que dos decisiones
aceptadas quedaron sin el mecanismo que las sostiene:

1. **ADR-0007** define módulos con API pública por `index.ts` y apoya el
   aislamiento en un **lint de imports** que nunca se implementó. La lógica real
   quedó en `apps/pos-server/src/services/*.ts`, plano, importando Prisma directo.
   Los ocho `modules/<x>/index.ts` son stubs con firmas `Promise<unknown>` y el
   comentario "Estado: pendiente" — sobre módulos que en los hechos funcionan.
2. **ADR-0008** define la auditoría como preocupación transversal precisamente
   porque *"cada módulo audita a su manera"* lleva a que se olvide. En el código,
   `registrarAuditoria()` es una función compartida que cada servicio llama **a
   mano**. Comparte el código, no garantiza el paso.

El segundo punto es el más caro: una escritura sin auditar **no se detecta**. Un
stock mal descontado se nota; un rastro que falta es invisible hasta que alguien
lo necesita, y para entonces no se puede reconstruir hacia atrás.

## Opciones consideradas

1. **Aceptar `services/` plano y superar ADR-0007** con un ADR que borre los
   stubs y declare la estructura plana como la arquitectura real. Honesto y
   barato. **Contras:** el sistema va por 3 de 8 módulos; al completar Caja,
   Facturación y Proveedores, "toda escritura de stock pasa por acá" deja de ser
   una afirmación verificable, y es justo la que sostiene la auditoría.
2. **Materializar los módulos de ADR-0007 y agregar el enforcement faltante**
   (elegida).
3. **Refactor big-bang**: mover los seis servicios de una y activar todo junto.
   Descartada por riesgo y porque frena la validación de pantallas en curso.

## Decisión

**Se materializan los módulos (opción 2), de forma incremental, y el enforcement
va primero.**

### 1. Auditoría obligatoria por construcción — ✅ implementado

Se agrega `apps/pos-server/src/shared/operacion.ts` con el envoltorio
`operacionDeDominio(nombre, ctx, cuerpo)`, por el que pasa **toda** operación con
impacto en dinero o stock. Abre la transacción, expone `reg.auditar()`,
`reg.emitir()` y `reg.meta()`, escribe Outbox y `RegistroAuditoria` en la misma
transacción, y publica a los consumidores in-process después del commit.

**La invariante:** si el cuerpo de la operación termina sin registrar auditoría,
se lanza `AuditoriaFaltanteError` **dentro** de la transacción y todo se revierte.
Olvidarse de auditar pasa de agujero silencioso a error ruidoso.

Un no-op legítimo (ej. un ajuste cuyo conteo coincide con el stock registrado) se
declara explícitamente con `reg.sinCambios(motivo)`. Se declara, no se omite.

Cubierto por tests en `shared/operacion.test.ts`, que corren sin base inyectando
un cliente falso (`ejecutarOperacion`).

`services/ventas.ts` y `services/stockMov.ts` ya están migrados. Las primitivas de
`shared/bus.ts` quedan como bajo nivel: **no se llaman directo desde un servicio**.

### 2. Materialización incremental de los módulos — pendiente

Se mueve un módulo por vez, empezando por **Stock** (el más completo y el que más
escribe stock), tipando su `index.ts` de verdad. El resto migra a medida que se
toca: Ventas al implementar descuentos, Clientes al sumar crédito a favor.

### 3. Lint de imports — pendiente

Se activa **apenas exista el primer módulo real**, para que el siguiente servicio
no vuelva a salirse. Sin un módulo adentro no tiene qué proteger.

### 4. Limpieza de stubs — pendiente

Los `modules/<x>/index.ts` de módulos no arrancados se borran. Un archivo que
declara "Estado: pendiente" sobre código que funciona desinforma más de lo que
documenta.

## Consecuencias

- **Se gana:** la regla central de ADR-0008 deja de depender de que alguien se
  acuerde; el envoltorio además borra repetición (transacción, metadata de evento,
  publicación post-commit) y eliminó los casts `as never` de los servicios; ADR-0007
  pasa de intención a frontera verificable.
- **Se pierde / se acepta:** toda operación de dominio nueva debe escribirse dentro
  del envoltorio — es una restricción real sobre cómo se escribe un servicio. El
  refactor de módulos consume tiempo que no produce funcionalidad visible.
- **Riesgo residual:** el envoltorio garantiza que *la operación que lo usa* audite,
  no que un servicio nuevo lo use. El lint de imports cierra ese hueco al impedir
  que un módulo acceda a Prisma fuera de su frontera; hasta entonces, queda en
  revisión de código.
- **Seguimiento:** al completar el punto 3, evaluar una regla que prohíba importar
  `../db.js` desde `services/` o `modules/`, dejando el acceso a Prisma
  exclusivamente dentro del envoltorio.
