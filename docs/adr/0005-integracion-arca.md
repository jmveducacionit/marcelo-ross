# ADR-0005: Integración con ARCA vía intermediario

- **Estado**: Aceptado
- **Fecha**: 2026-07-21
- **Decisores**: Arquitecto técnico, dueño

## Contexto

El comercio es Responsable Inscripto y debe emitir comprobantes electrónicos ante
**ARCA** (ex AFIP): Facturas A/B, notas de crédito y débito, con **CAE**, para
**múltiples puntos de venta** (uno por sucursal), más el **libro IVA ventas**. La
impresora es una Epson TM-T20III **no fiscal** → el comprobante es **factura
electrónica** (PDF/ticket 80mm con CAE + QR de ARCA), no controlador fiscal. El
presupuesto de infraestructura es mínimo y hay requisito **offline-first**: la
venta no espera al CAE.

## Opciones consideradas

1. **Integración directa contra WSFEv1 de ARCA** (SOAP + certificado digital,
   WSAA para el ticket de acceso). Sin costo por comprobante. **Contras:** manejo
   propio de certificados y su renovación, homologación, cliente SOAP, mapeo de
   errores de ARCA, y mantenimiento continuo ante cambios del organismo.
2. **Integración vía intermediario** (proveedor de facturación electrónica que
   expone una API REST y abstrae WSAA/WSFE, certificados y homologación). Costo
   mensual/por comprobante. Menos control, arranque y mantenimiento mucho más
   baratos en esfuerzo.

## Decisión

**Integración vía intermediario.** Para un comercio de 2 locales con presupuesto e
infraestructura mínimos, el costo de operar y mantener la integración directa
(certificados, homologación, SOAP, seguimiento de cambios de ARCA) no se justifica.
El intermediario absorbe esa complejidad.

- Se define un **puerto `FacturacionArcaPort`** (en `packages/contracts`) que el
  módulo Facturación usa. La implementación concreta es un **adaptador** al
  intermediario elegido. Esto **aísla** al resto del sistema del proveedor: si
  algún día se migra a directo o a otro intermediario, solo cambia el adaptador.
- **Offline-first / cola de CAE**: al confirmar la venta se registra el
  `Comprobante` en estado `PENDIENTE` y se encola (`ColaCae`). Un worker con
  **reintentos** (backoff) llama al intermediario cuando hay internet. Estados:
  `PENDIENTE → OBTENIDO` (emite `CAEObtenido`, guarda `cae` + vencimiento) o
  `RECHAZADO` (emite `CAERechazado`, alerta al encargado). El **ticket no fiscal**
  se entrega al cliente en el momento; el comprobante fiscal con CAE se genera al
  resolverse la cola.
- **Múltiples puntos de venta**: `PuntoVenta {sucursal, numeroArca}`, numeración
  por punto de venta y tipo de comprobante.
- **Libro IVA ventas**: proyección exportable para el contador (solo lectura).

## Consecuencias

- **Se gana:** cero manejo de certificados/homologación propios; menos superficie
  de mantenimiento; foco del equipo en el negocio; resiliencia offline por la cola.
- **Se pierde / se acepta:** costo recurrente del intermediario; dependencia de un
  tercero (mitigada por el puerto/adaptador); hay que respetar sus límites de API.
- **Seguimiento:** si el volumen crece mucho o el costo del intermediario deja de
  cerrar, se implementa el adaptador directo a WSFEv1 detrás del **mismo puerto**,
  sin tocar el resto del sistema. El ADR se revisa en ese escenario.
