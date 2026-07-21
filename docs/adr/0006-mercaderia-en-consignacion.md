# ADR-0006: Manejo de mercadería en consignación

- **Estado**: Aceptado
- **Fecha**: 2026-07-21
- **Decisores**: Arquitecto técnico, dueño

## Contexto

Algunas marcas trabajan en **consignación**: el stock está físicamente en el local
pero **no es propiedad** del comercio hasta que se vende. Al venderse, nace una
obligación de **liquidar** al proveedor lo que corresponda. Esto impacta stock
(está disponible para vender), contabilidad (no es activo propio), márgenes y
cuenta corriente del proveedor.

## Opciones consideradas

1. **Tratar consignación igual que stock propio** — simple pero incorrecto:
   inflaría el activo/valuación de inventario y no dispararía la liquidación.
2. **Depósito/entidad separada solo para consignación** — más aislado pero
   duplica el modelo de stock y complica la venta (una línea podría mezclar
   propio y consignado).
3. **Marca `esConsignacion` a nivel variante + cargo de consignación al vender**
   (elegida) — el stock consignado convive en el mismo modelo, se distingue por
   una bandera y por su proveedor, y la venta genera el hecho que alimenta la
   liquidación.

## Decisión

- La **`Variante`** lleva `esConsignacion (bool)` y su proveedor es identificable
  (vía marca/proveedor). El stock consignado se ingresa y se ve como cualquier
  otro stock **para poder venderlo**, pero se marca como **no propio**.
- **Valuación**: los reportes de inventario y márgenes **excluyen** el stock
  consignado del activo propio (se informa aparte). La "propiedad" se transfiere
  recién **al vender**.
- **Al vender una variante en consignación**, además de `StockDescontado` y la
  venta normal, se genera un **cargo de consignación** hacia el proveedor
  (cantidad vendida × costo/condición pactada). Estos cargos se acumulan.
- **Liquidación**: el módulo Proveedores arma la `LiquidacionConsignacion
  {proveedor, periodo, líneas(variante, cantidadVendida, montoALiquidar)}` a partir
  de los cargos acumulados, y la imputa a la **cuenta corriente del proveedor**.
- **Devoluciones** de un artículo consignado revierten el cargo correspondiente si
  ocurren dentro del período no liquidado.
- **Auditoría**: el cambio de "no propio" → "vendido/liquidable" queda registrado
  como toda operación de stock/dinero.

## Consecuencias

- **Se gana:** un solo modelo de stock (simple para vender), valuación correcta
  (no infla el activo), liquidación automática a partir de ventas reales,
  trazabilidad por proveedor.
- **Se pierde / se acepta:** los reportes deben **siempre** discriminar propio vs.
  consignado (disciplina de reporting); la devolución sobre consignación tiene una
  regla extra (revertir cargo). Complejidad contenida y justificada por el negocio.
- **Seguimiento:** si aparecen condiciones de consignación más complejas (comisión
  variable por marca, plazos de devolución al proveedor), se extiende `reglas` de
  la relación proveedor-consignación sin cambiar el modelo de stock.
