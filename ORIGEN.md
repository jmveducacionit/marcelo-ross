# Los dos repositorios

Este proyecto vive en **dos repos independientes** que comparten casi todo el
código. No es que uno derive del otro: **los dos tienen la misma historia hasta
`abc589e`** y divergen a partir de ahí.

| Repo | Qué es | Despliegue |
|---|---|---|
| `marcelo-ross` (**este**) | La **vitrina en la nube** | Netlify + Render + Supabase |
| `marcelo-ross-instalable` | El **producto**: instalación local por sucursal | `SetupPOS-*.exe` |

> **Este repo no es el producto.** El producto es la instalación local
> offline-first: la venta no se frena por falta de internet y cada sucursal es
> dueña de su stock (ADR-0001). La versión en la nube contradice ese diseño a
> propósito, para poder mostrar el sistema desde un link.

## Punto de separación

- **Commit común:** `abc589e` — *"Empleados y analítica del Dashboard; se cierra
  el paso 2 de ADR-0010"*
- **Fecha:** 2026-08-06

Todo lo anterior a ese commit es historia compartida y está en los dos repos.

## Por qué esto importa

Comparten el dominio completo: el tipo `Money` y su redondeo, el motor de
descuentos, el esquema de Prisma, los ocho módulos del servidor y todo el front.
Lo genuinamente distinto está listado en `DIVERGENCIA.md` y son cuatro cosas.

Eso significa que **un bug de dominio arreglado en un repo NO llega al otro**.
Ya pasó dos veces en la historia de este proyecto: con dos seeds que compartían
catálogo, y con el cálculo del IVA que estuvo mal sin que nadie lo viera.

Antes de tocar código compartido, leé `DIVERGENCIA.md`. Para traer cambios del
otro repo:

```bash
node scripts/sincronizar.mjs "../marcelo-ross-instalable"
```

El criterio para saber si algo divergió: **los 43 tests tienen que pasar igual
en los dos repos.**
