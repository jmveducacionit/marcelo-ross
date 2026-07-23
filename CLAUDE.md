# CLAUDE.md — Memoria del proyecto

> Este archivo es la **memoria persistente entre sesiones**. Si volvés a este
> repo sin contexto, leé esto primero. Está escrito para vos (Claude) y para
> cualquier desarrollador que se sume.

---

## 1. Qué es este proyecto

Sistema **POS (punto de venta)** para **"Marcelo Ross Hombre"**, comercio
minorista de indumentaria masculina multimarca en Córdoba, Argentina.

- **2 sucursales**: Local Centro (San Martín, Córdoba capital — también depósito
  central) y Local Shopping (Nuevocentro).
- **3 cajas simultáneas** (2 Centro + 1 Shopping).
- **Volumen**: ~45 tickets/día, picos de 180 (Día del Padre, Black Friday,
  liquidación). Ticket promedio $85.000. ~1.800 SKUs (≈300 productos padre).
- **Fiscal**: Responsable Inscripto, IVA. Ingresos Brutos Convenio Multilateral.
- **Usuarios**: 6 vendedores, 2 encargados, 1 administrador (dueño), 1 contador
  externo (solo lectura de reportes).

**Etapa actual: Fase 1 — documentación y andamiaje. NO hay código de aplicación
todavía.** Ver `docs/roadmap.md`.

---

## 2. Los 8 módulos

El sistema es un **monolito modular**. Ocho módulos, implementación **incremental**,
pero la arquitectura los contempla a todos desde el día 1.

| # | Módulo | Responsabilidad | Estado |
|---|--------|-----------------|--------|
| 1 | **Ventas** | Ticket, carrito, descuentos, medios de pago mixtos, cambios/devoluciones, entrega diferida por ajustes de prenda | pendiente |
| 2 | **Stock** | Variantes talle/color con escalas configurables, ingresos por remito, ajustes, transferencias, inventario físico, consignación, alertas, códigos de barras propios | pendiente |
| 3 | **Control de Caja** | Apertura/cierre por turno y caja, arqueo, movimientos de efectivo, diferencias, conciliación de medios electrónicos | pendiente |
| 4 | **Empleados** | Usuarios, roles y permisos, comisiones, turnos, ranking | parcial (auth + RBAC ✅) |
| 5 | **Clientes** | Ficha, historial (talles habituales), crédito a favor, fidelización, datos fiscales para Factura A | pendiente |
| 6 | **Dashboard** | KPIs, rotación por marca/talle/temporada, márgenes, ranking, stock inmovilizado, comparativo entre sucursales | pendiente |
| 7 | **Facturación** | Comprobantes electrónicos ante ARCA (A/B, NC/ND), CAE, múltiples puntos de venta, libro IVA ventas | pendiente |
| 8 | **Proveedores** | Alta, órdenes de compra por temporada, recepción contra remito, cuenta corriente, costos/precios, liquidación de consignación | pendiente |

Estados posibles de un módulo: `implementado` · `contrato definido` · `pendiente`.

---

## 3. Stack

- **Lenguaje**: TypeScript en todo el stack.
- **Frontend**: React 18 + Vite + TanStack Query + Tailwind (`apps/pos-web`).
- **Backend**: Node.js + Fastify, modular por dominio (`apps/pos-server`).
- **DB**: PostgreSQL 16 + Prisma (`prisma/`).
- **Testing**: Vitest (unit + integración) + Playwright (E2E del flujo de venta).
- **Monorepo**: pnpm workspaces.
- **Infra**: Docker Compose. Un mini-PC por sucursal (servidor de app + DB en LAN)
  + un VPS chico como nodo central de sincronización y backup.
  **Sin Kubernetes, sin microservicios, sin colas distribuidas.**

### Topología

```
Local Centro                    Local Shopping                 VPS Central
┌───────────────────┐          ┌───────────────────┐          ┌──────────────┐
│ mini-PC           │          │ mini-PC           │          │ nodo central │
│  pos-server       │◄─ LAN ─► │  pos-server       │          │  consolida   │
│  PostgreSQL       │  cajas   │  PostgreSQL       │          │  + backup    │
│  (fuente de verdad│          │  (fuente de verdad│          │              │
│   de SU stock)    │          │   de SU stock)    │          │              │
└─────────┬─────────┘          └─────────┬─────────┘          └──────┬───────┘
          │                              │                           │
          └──────── sync por outbox (cuando hay internet) ──────────┘
```

La venta **no depende de internet**. Sí dependen de internet: (a) obtener el CAE
ante ARCA (se encola y reintenta); (b) sincronizar stock/ventas entre sucursales
y con el central.

---

## 4. Convenciones de código (LEER ANTES DE ESCRIBIR)

### 4.1 Dinero — NUNCA float
- Canónico: **enteros en la mínima unidad monetaria (centavos de ARS)**.
- En DB: `BigInt` (Postgres `BIGINT`). En TS: tipo `Money` (bigint branded).
- Se formatea a pesos **solo en la capa de presentación**. Nunca se opera con
  strings ni con `number` decimal.
- **Precios versionados**: el precio vive en una tabla con historial. El ticket
  **guarda el precio al momento de la venta** (snapshot en la línea), nunca una
  FK al precio vigente. Ver ADR-0003.

### 4.2 IDs — sin autoincremental
- **UUIDv7** generado en la aplicación. Time-ordered (buena localidad de índice)
  y sin colisión entre sucursales offline. Ver ADR-0008.

### 4.3 Multi-sucursal — desde el modelo
- Toda entidad con **stock, caja o venta** lleva `sucursalId`. No se agrega después.

### 4.4 Límites de módulo
- Cada módulo vive en `apps/pos-server/src/modules/<modulo>/`.
- Expone su **API pública** por `index.ts` (el "puerto"). El resto es privado.
- **Prohibido** importar internals de otro módulo. Si dos módulos hablan, es por
  **evento de dominio** o por una **interfaz definida** en `packages/contracts`.
- **Sin dependencias circulares.** Esto se hace cumplir con lint de imports.

### 4.5 Eventos de dominio
- PascalCase, en pasado: `VentaConfirmada`, `StockDescontado`, etc.
- Catálogo completo en `packages/core-domain` y documentado en
  `docs/arquitectura.md`. Definidos todos, aunque algunos aún no tengan consumidor.

### 4.6 Auditoría transversal
- Toda operación con impacto en **dinero o stock** deja rastro: **quién, cuándo,
  qué cambió, desde qué caja y sucursal**. Es una preocupación transversal
  (`shared/`), no se reimplementa por módulo. Ver ADR-0008.

### 4.7 Estilo
- Nombres de dominio en **español** (es el idioma del negocio): `Producto`,
  `Variante`, `Comprobante`, `Arqueo`. Tipos técnicos genéricos en inglés está ok.
- Comentarios: los justos. El código de dominio debe leerse como el negocio.

---

## 5. Comandos habituales

Prototipo funcionando (Etapa 1). Guía completa en [`docs/prototipo.md`](docs/prototipo.md).

```bash
pnpm install              # instalar dependencias del monorepo
pnpm dev:db               # Postgres EMBEBIDO (localhost:54329) — dejar corriendo
pnpm setup                # migrate deploy + seed (una vez, con la base arriba)
pnpm dev:server           # Fastify en :3000  — dejar corriendo
pnpm dev:web              # Vite en :5173      — abrir en el navegador
pnpm test                 # Vitest (unit + integración)
pnpm db:studio            # Prisma Studio (inspeccionar la base)
pnpm db:migrate           # crear migración (prisma migrate dev)
```

> **Base de datos en dev**: NO se usa Docker. Es un **Postgres embebido**
> (`embedded-postgres`) levantado por `scripts/dev-db.mjs`, en el **puerto 54329**
> (el 5432 de esta máquina ya está ocupado), persistido en `.dev-db/`. El
> `DATABASE_URL` de `.env` apunta a 54329. `docker-compose.yml` queda como
> referencia para el despliegue en la sucursal, no para dev.
>
> Si `pnpm` no está en el PATH, usar `corepack pnpm@9.15.0 <cmd>`.
>
> `pnpm test:e2e` (Playwright) todavía no está configurado.

---

## 6. Reglas de arquitectura (resumen — detalle en docs/)

1. Monolito modular. Módulos = directorios con API pública por `index.ts`.
2. Comunicación entre módulos por eventos o interfaces, **nunca** import directo de internals.
3. Sin dependencias circulares.
4. Módulos no implementados existen como **contratos** (interfaces, tipos, eventos, stubs).
5. El esquema de DB anticipa los 8 módulos; las migraciones se aplican por etapas.
6. Auditoría transversal para todo lo que toca dinero o stock.
7. Dinero en enteros; precios versionados; snapshot en el ticket.
8. Multi-sucursal desde el modelo.
9. **Offline-first**: la venta nunca se frena por falta de internet.
10. Cada sucursal es dueña de su stock; el central consolida. Ver ADR-0001.

---

## 7. Decisiones ya tomadas (ver `docs/adr/`)

- **ARCA**: integración **vía intermediario** (proveedor de facturación), no directo a WSFE. ADR-0005.
- **CAE offline**: se **vende y se emite después**. La venta se registra con ticket
  no fiscal; el comprobante fiscal con CAE se encola y se emite al recuperar
  conexión. Ventas distingue `venta registrada` de `comprobante emitido`. ADR-0001/0005.
- **Fuente de verdad de stock**: **cada sucursal** es autoritativa sobre su propio
  stock; el VPS central consolida y respalda. ADR-0001.
- **Datos**: se arranca **de cero**, con **seed de datos ficticios** para pruebas.
- **Impresora Epson TM-T20III = no fiscal** → comprobante fiscal es **factura
  electrónica** (PDF/ticket 80mm con CAE + QR de ARCA), no controlador fiscal.
- **Conciliación de medios electrónicos**: manual en V1 (importar liquidación a mano).
- **Comisiones**: sobre **venta neta de devoluciones**, al liquidar (no al vender).
- **Auth**: login por roles (Admin/Encargado/Cajero/Vendedor) con **Argon2id**,
  **sesión server-side revocable** en cookie httpOnly, bloqueo por intentos y
  auditoría de login; **RBAC** por mapa estático rol→permisos con guards por
  endpoint. Código en `apps/pos-server/src/auth/`. Ver ADR-0009.

---

## 8. Qué NO hacer

- ❌ **No usar float/number para dinero.** Enteros en centavos, siempre.
- ❌ **No usar IDs autoincrementales.** UUIDv7.
- ❌ **No importar internals de otro módulo.** Solo su `index.ts` o eventos/contratos.
- ❌ **No guardar en el ticket una FK al precio vigente.** Snapshot del precio al vender.
- ❌ **No llevar stock a nivel producto padre.** Siempre a nivel variante.
- ❌ **No asumir escalas de talle homogéneas.** Son configurables por categoría
  (camisería 38–44, denim 28–36, calzado 39–45, sacos 46–54, accesorios único).
- ❌ **No frenar la venta por falta de internet** (ni por falta de CAE).
- ❌ **No introducir microservicios, Kubernetes, colas distribuidas ni CRDTs.**
  Es sobre-diseño para 2 locales / 45 tickets diarios.
- ❌ **No manejar certificados ni WSFE de ARCA a mano**: eso lo hace el intermediario.
- ❌ **No escribir código de aplicación en Fase 1.** Solo documentación y andamiaje.
- ❌ **No tratar mercadería en consignación como stock propio** hasta que se venda.
- ❌ **No perder el rastro de auditoría** en ninguna operación de dinero o stock.

---

## 9. Mapa de documentación

- `docs/arquitectura.md` — módulos, eventos de dominio, decisiones técnicas.
- `docs/modelo-datos.md` — modelo conceptual de las 8 áreas.
- `docs/roadmap.md` — orden de implementación y criterios de "terminado".
- `docs/adr/` — un ADR por decisión no trivial.
- `apps/pos-server/src/modules/<modulo>/README.md` — responsabilidad, API pública y estado de cada módulo.
- `docs/diseno/` — **design system "Heritage Ledger"** (tokens, tipografías, mockups
  Stitch). Aplicado al front vía `apps/pos-web/src/index.css` (`@theme` de Tailwind v4).
  Paleta: navy `#041627` + acento oro `#a88c69` sobre crema `#f6faff`; Playfair
  Display (títulos) + Inter (UI); íconos Material Symbols. Fuentes self-hosted
  (offline-first, sin CDN).
