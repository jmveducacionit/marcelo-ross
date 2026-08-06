/**
 * Módulo Stock — API pública (el "puerto"). ADR-0007 / ADR-0010.
 *
 * Este archivo es la ÚNICA superficie del módulo. `consultas.ts` y `movimientos.ts`
 * son privados: nadie fuera de este directorio los importa.
 *
 * El stock se lleva SIEMPRE a nivel variante y por sucursal, nunca al producto
 * padre (ADR-0002). Toda escritura pasa por `operacionDeDominio`, así que no puede
 * commitear sin auditoría (ADR-0010).
 *
 * Operaciones todavía NO implementadas (Etapa 2 del roadmap): generación de códigos
 * de barras, recepción de transferencia separada del envío, inventario físico y
 * alertas de reposición. No se declaran acá hasta existir — una firma que no hace
 * nada desinforma más de lo que documenta.
 */
import type { RegistroOperacion, Tx } from '../../shared/operacion.js';
import { buscarProductos } from './catalogo.js';
import { stockDetalle, stockListado } from './consultas.js';
import {
  ajustarStock, descontarPorVenta as descontarPorVentaImpl,
  ingresarPorRemito as ingresarPorRemitoImpl, ingresarStock,
  reingresarPorDevolucion as reingresarPorDevolucionImpl, transferirStock,
  type DescuentoPorVentaInput, type IngresoPorRemitoInput, type ReingresoPorDevolucionInput,
} from './movimientos.js';

export type { DescuentoPorVentaInput, IngresoPorRemitoInput, LineaADescontar, ReingresoPorDevolucionInput } from './movimientos.js';

// --- Tipos del contrato ------------------------------------------------------

/** Contexto de autoría de una escritura de stock. Sale de la sesión, nunca del cliente. */
export interface CtxStock {
  usuarioId: string;
  sucursalId: string;
}

export type EstadoStock = 'ok' | 'bajo' | 'agotado';

/** Producto padre con su stock agregado en una sucursal (vista de listado). */
export interface ProductoConStock {
  id: string;
  nombre: string;
  marca: string;
  categoria: string;
  codigo: string;
  variantes: number;
  totalStock: number;
  esConsignacion: boolean;
  estado: EstadoStock;
}

export interface TalleDeEscala { id: string; etiqueta: string; orden: number }
export interface ColorDeProducto { id: string; nombre: string; hex: string | null }
export interface CeldaMatriz { stock: number; varianteId: string; codigoBarras: string }

/** Matriz talle × color de un producto en una sucursal. */
export interface DetalleDeProducto {
  producto: {
    id: string;
    nombre: string;
    marca: string;
    categoria: string;
    totalStock: number;
    totalVariantes: number;
    esConsignacion: boolean;
    estado: EstadoStock;
  };
  talles: TalleDeEscala[];
  colores: ColorDeProducto[];
  /** celdas[colorId][talleId] — `null` si esa combinación no existe como variante. */
  celdas: Record<string, Record<string, CeldaMatriz | null>>;
  totalPorTalle: Record<string, number>;
  totalPorColor: Record<string, number>;
  total: number;
}

/** API pública del módulo. */
export interface StockApi {
  /** Productos con su stock total en la sucursal. `search` vacío = listado general. */
  listado(sucursalId: string, search: string): Promise<ProductoConStock[]>;
  /** Matriz talle×color de un producto. `null` si el producto no existe. */
  detalle(productoId: string, sucursalId: string): Promise<DetalleDeProducto | null>;
  /** Catálogo para la pantalla de venta: producto con sus variantes, stock y precio. */
  catalogo(sucursalId: string, search: string): ReturnType<typeof buscarProductos>;
  /** Ingreso de mercadería: suma unidades. Emite `StockIngresado`. */
  ingresar(varianteId: string, sucursalId: string, cantidad: number, ctx: CtxStock): Promise<{ nueva: number }>;
  /** Ajuste de inventario: fija el stock al valor contado. Emite `StockIngresado`/`StockDescontado`. */
  ajustar(varianteId: string, sucursalId: string, nuevaCantidad: number, ctx: CtxStock): Promise<{ nueva: number }>;
  /** Transferencia entre sucursales. Emite `TransferenciaEnviada` y `TransferenciaRecibida`. */
  transferir(varianteId: string, origenId: string, destinoId: string, cantidad: number, ctx: CtxStock): Promise<{ enOrigen: number }>;
}

// --- Implementación ----------------------------------------------------------

export const stock: StockApi = {
  listado: stockListado,
  detalle: stockDetalle,
  catalogo: buscarProductos,
  ingresar: ingresarStock,
  ajustar: ajustarStock,
  transferir: transferirStock,
};

// --- Puerto transaccional (módulo a módulo) ----------------------------------

/**
 * Descuenta stock por una venta **dentro de la transacción del llamador**.
 *
 * Es la única operación del módulo que no abre su propia transacción, porque
 * vender y descontar tienen que ser un solo commit: si el descuento falla, la
 * venta no debe existir. Ventas la usa en lugar de escribir `stockPorSucursal` y
 * `movimientoStock` por su cuenta.
 *
 * Stock sigue siendo el dueño de la escritura: acá se emite `StockDescontado` y se
 * deja la auditoría del descuento.
 *
 * **No valida disponibilidad**: hoy una venta puede dejar el stock en negativo.
 * Es el comportamiento previo, conservado a propósito; cambiarlo es una decisión
 * de negocio (¿se bloquea la venta o se permite y se avisa?), no de refactor.
 */
export type DescontarPorVenta = (
  tx: Tx,
  reg: RegistroOperacion,
  input: DescuentoPorVentaInput,
) => Promise<void>;

export const descontarPorVenta: DescontarPorVenta = descontarPorVentaImpl;

/**
 * Reingresa stock por una devolución, dentro de la transacción del llamador.
 * Espejo de `descontarPorVenta`.
 */
export type ReingresarPorDevolucion = (
  tx: Tx,
  reg: RegistroOperacion,
  input: ReingresoPorDevolucionInput,
) => Promise<void>;

export const reingresarPorDevolucion: ReingresarPorDevolucion = reingresarPorDevolucionImpl;

/**
 * Ingresa stock por recepción de un remito, dentro de la transacción del
 * llamador. Lo usa Proveedores: recibir y cargar al stock son un solo hecho.
 */
export type IngresarPorRemito = (
  tx: Tx,
  reg: RegistroOperacion,
  input: IngresoPorRemitoInput,
) => Promise<void>;

export const ingresarPorRemito: IngresarPorRemito = ingresarPorRemitoImpl;
