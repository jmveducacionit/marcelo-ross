# ADR-0002: Producto padre/variante con escalas de talle heterogéneas

- **Estado**: Aceptado
- **Fecha**: 2026-07-21
- **Decisores**: Arquitecto técnico, dueño

## Contexto

Una prenda es un **producto padre** con múltiples **variantes (SKUs)** por la
matriz **talle × color**. El stock se lleva **siempre a nivel variante**, nunca al
padre. Lo delicado: **las escalas de talle NO son homogéneas** entre categorías:

- Camisería: 38 / 40 / 42 / 44
- Denim: 28 / 30 / 32 / 34 / 36
- Calzado: 39–45
- Sacos: 46 / 48 / 50 / 52 / 54
- Accesorios: talle único

El sistema debe soportar **escalas configurables por categoría**, incluyendo
talles no numéricos y talle único.

## Opciones consideradas

1. **Talle como string libre en la variante** — simple pero sin integridad:
   imposible ordenar bien, filtrar por escala o evitar typos ("42" vs "42.0").
2. **Enum global de talles** — no modela la heterogeneidad; mezcla escalas
   incompatibles.
3. **Escalas de talle como entidad, ligadas a categoría** (elegida) — cada
   categoría referencia una `EscalaTalle`; cada escala tiene sus `Talle` con
   `etiqueta` + `orden`. La variante referencia un `Talle` válido de la escala de
   su categoría.

## Decisión

Modelo:

```
Categoria (1) ──> (1) EscalaTalle (1) ──< (N) Talle {etiqueta, orden}
ProductoPadre {marca, categoria, temporada}
Variante {productoPadre, talle, color, codigoBarras propio, esConsignacion}
  ↳ UNIQUE (productoPadre, talle, color)
StockPorSucursal {variante, sucursal, cantidad}   ← el stock vive acá
```

- `Talle.orden` permite ordenar escalas no numéricas y numéricas por igual.
- La **validación** garantiza que la variante use un talle de la escala de su
  categoría (no se puede poner talle "46" de sacos a una camisa).
- **Talle único**: una escala con un solo `Talle` ("U").
- **Código de barras propio** por variante, generado al ingresar stock (la
  mercadería llega sin código o con el del proveedor). Se guarda también el
  `codigoProveedor` opcional para trazabilidad.

## Consecuencias

- **Se gana:** integridad de talles; ordenamiento correcto; matriz talle×color
  consistente; nuevas categorías/escalas sin tocar código; stock inequívocamente a
  nivel variante.
- **Se pierde / se acepta:** más tablas y joins que un string libre; el alta de
  producto exige elegir categoría→escala. Es el costo correcto para el rubro.
- **Seguimiento:** si aparecen equivalencias entre escalas (ej. mapear talles de
  marcas distintas), se agrega una tabla de equivalencias sin romper este modelo.
