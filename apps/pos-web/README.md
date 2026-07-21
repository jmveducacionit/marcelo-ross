# pos-web

Frontend del POS. React 18 + Vite + TanStack Query + Tailwind. Servido desde el
mini-PC de cada sucursal, accedido por navegador desde las PCs de caja. Vista
**responsive para tablet** (toma de inventario físico y consulta de stock en piso).

- **Estado**: pendiente (Fase 1: solo andamiaje).

## Responsabilidad

- UI de las cajas (flujo de venta, cobro mixto, impresión de ticket, cajón).
- Consultas de stock/precios y toma de inventario (tablet).
- Paneles por módulo según permisos del usuario (rol de Empleados).

## Consideraciones

- **Offline-first**: la app habla con el `pos-server` de **su LAN**; no depende de
  internet para vender. Ver [ADR-0001](../../docs/adr/0001-offline-first-y-sincronizacion.md).
- **Hardware**: lector de código de barras (emulación de teclado), impresora
  térmica 80mm, cajón por comando ESC/POS (vía server). Sin visor ni balanza.
- Consume tipos/eventos desde `@pos/core-domain`.
