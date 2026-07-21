# Módulo: Dashboard

- **Estado**: pendiente
- **Etapa de implementación**: 9 (último — consume eventos de todos)

## Responsabilidad

KPIs de venta; rotación por marca/talle/temporada; márgenes (precio − costo);
ranking de vendedores; stock inmovilizado; **comparativo entre sucursales**
(usa datos consolidados en el nodo central).

## API pública (`index.ts`)

- Consultas de solo lectura sobre **read models / proyecciones** construidas a
  partir de los eventos de dominio. No escribe estado de negocio.

## Depende de

- `EventBusPort` (consume eventos de todos los módulos para materializar vistas).

## Eventos

- **Consume**: prácticamente todos (`VentaConfirmada`, `StockDescontado`,
  `StockIngresado`, `Transferencia*`, `CajaCerrada`, `ComprobanteEmitido`, etc.).
- **Emite**: ninguno.

## Notas

- El comparativo entre sucursales se sirve desde el **VPS central** consolidado.
  El acceso del contador es solo lectura.
