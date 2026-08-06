/** Cliente HTTP mínimo contra el pos-server + helper de dinero. */

export interface Caja { id: string; nombre: string }
export interface Sucursal { id: string; nombre: string; esDepositoCentral: boolean; cajas: Caja[] }
export interface Contexto { sucursales: Sucursal[] }

export interface Usuario {
  id: string; nombre: string; usuario: string; rol: string;
  sucursalIdPrincipal: string; permisos: string[];
}

export interface VarianteDTO {
  id: string; talle: string; talleOrden: number; color: string; colorHex: string | null;
  codigoBarras: string; esConsignacion: boolean; stock: number; precio: string; // centavos
}
export interface ProductoDTO {
  id: string; nombre: string; marca: string; categoria: string; variantes: VarianteDTO[];
}
export interface VentaDTO {
  id: string; fechaHora: string; total: string; estadoEntrega: string;
  items: number; cliente: string; medios: string[]; vendedorId: string;
}
export interface ActividadDTO {
  tipo: 'evento' | 'auditoria'; clave: string; estado: string; ocurridoEn: string;
}

export interface DashboardDTO {
  ventasHoy: string; tickets: number; ticketPromedio: string; compVsAyer: number | null;
  porSucursal: { sucursal: string; monto: string }[];
  ranking: { nombre: string; sucursal: string; monto: string; tickets: number }[];
  marcasTop: { marca: string; monto: string; pct: number }[];
  inmovilizado: { articulos: number; valor: string; variantes: number };
}

export interface StockItemDTO {
  id: string; nombre: string; marca: string; categoria: string; codigo: string;
  variantes: number; totalStock: number; esConsignacion: boolean; estado: 'ok' | 'bajo' | 'agotado';
}
export interface Celda { stock: number; varianteId: string; codigoBarras: string }
export interface StockDetalleDTO {
  producto: { id: string; nombre: string; marca: string; categoria: string; totalStock: number; totalVariantes: number; esConsignacion: boolean; estado: 'ok' | 'bajo' | 'agotado' };
  talles: { id: string; etiqueta: string; orden: number }[];
  colores: { id: string; nombre: string; hex: string | null }[];
  celdas: Record<string, Record<string, Celda | null>>;
  totalPorTalle: Record<string, number>;
  totalPorColor: Record<string, number>;
  total: number;
}

export interface ClienteItemDTO { id: string; nombre: string; condicionIva: string; esFacturaA: boolean }
export interface ClienteDetalleDTO {
  cliente: {
    id: string; nombre: string; documento: string | null; condicionIva: string;
    cuit: string | null; razonSocial: string | null; domicilioFiscal: string | null;
    email: string | null; telefono: string | null; esFacturaA: boolean;
  };
  creditoAFavor: string;
  totalComprado: string;
  clienteDesde: string | null;
  tallesHabituales: { categoria: string; talle: string }[];
  historial: { ventaId: string; fecha: string; total: string; items: number; marcas: string[] }[];
}

export interface DescuentoDTO {
  id: string; nombre: string; tipo: string;
  requiereAutorizacion: boolean; esReintegro: boolean; soloLinea: boolean;
}

/** Un descuento pedido: sin `indiceLinea` es de nivel ticket. */
export interface DescuentoPedidoDTO {
  descuentoId: string; indiceLinea?: number; autorizadoPor?: string;
}
export interface PreviewDTO {
  subtotal: string; totalDescuentos: string; total: string;
  reintegros: { descuentoId: string; monto: string }[];
  porLinea: string[];
}

export interface LineaVentaDetalleDTO {
  lineaId: string; varianteId: string; producto: string; marca: string;
  talle: string; color: string; cantidad: number; devuelto: number;
  disponible: number; precioUnitario: string; subtotalLinea: string;
}
export interface VentaDetalleDTO {
  id: string; fechaHora: string; sucursalId: string; cajaId: string;
  estadoEntrega: string; subtotal: string; totalDescuentos: string; total: string;
  cliente: { id: string; nombre: string } | null;
  pagos: { medio: string; monto: string }[];
  lineas: LineaVentaDetalleDTO[];
}

export interface ComprobanteDTO {
  id: string; tipo: string; puntoVenta: number; numero: number; etiqueta: string;
  fechaEmision: string; cliente: string | null;
  neto: string; iva: string; total: string;
  estadoCae: 'PENDIENTE' | 'OBTENIDO' | 'RECHAZADO';
  cae: string | null; vencimientoCae: string | null;
  intentos: number; error: string | null; ventaId: string | null;
}
export interface ResumenFiscalDTO {
  pendientes: number; obtenidos: number; rechazados: number;
  facturado: { neto: string; iva: string; total: string };
}
export interface LibroIvaDTO {
  desde: string; hasta: string;
  lineas: { fecha: string; tipo: string; comprobante: string; receptor: string; cuit: string | null; neto: string; iva: string; total: string; cae: string | null }[];
  totales: { neto: string; iva: string; total: string };
}

export interface ProveedorItemDTO {
  id: string; razonSocial: string; cuit: string; condicionIva: string;
  esConsignatario: boolean; marcas: string[]; saldo: string;
}
export interface ProveedorDetalleDTO extends ProveedorItemDTO {
  movimientos: { id: string; monto: string; motivo: string; ocurridoEn: string }[];
  remitos: { id: string; numero: string; fecha: string; total: string; lineas: number }[];
  liquidaciones: { id: string; periodo: string; total: string; estado: string; fecha: string }[];
}
export interface ConsignacionDTO {
  periodo: string; total: string;
  lineas: { varianteId: string; producto: string; detalle: string; cantidadVendida: number; costoUnitario: string; montoALiquidar: string }[];
  sinCosto: { varianteId: string; producto: string; cantidadVendida: number }[];
}

export interface ComisionDTO {
  vendedorId: string; nombre: string; rol: string; tickets: number;
  vendido: string; devuelto: string; base: string; porcentaje: number;
  comision: string; liquidada: boolean; ticketPromedio: string; participacion: number;
}
export interface EmpleadoDTO {
  id: string; nombre: string; usuario: string; rol: string; sucursal: string;
  activo: boolean; ultimoLogin: string | null; bloqueado: boolean;
}
export interface AnaliticaDTO {
  periodo: string;
  margenes: {
    porMarca: { marca: string; vendido: string; costo: string; margen: string; margenPct: number; unidades: number; esConsignacion: boolean }[];
    totales: { vendido: string; costo: string; margen: string; margenPct: number };
    sinCosto: { unidades: number; vendido: string };
  };
  rotacion: {
    porTalle: { clave: string; vendidas: number; stock: number; indice: number }[];
    porTemporada: { clave: string; vendidas: number; stock: number; indice: number }[];
  };
}

export interface MovimientoCajaDTO {
  id: string; tipo: string; medio: string; monto: string; fechaHora: string;
}
/** Sesión abierta de una caja. `sesionCajaId: null` = la caja está cerrada. */
export interface CajaEstadoDTO {
  sesionCajaId: string | null;
  cajaId?: string;
  usuarioId?: string;
  fechaApertura?: string;
  fondoInicial?: string;
  efectivoEsperado?: string;
  totalesPorMedio?: Record<string, string>;
  movimientos?: MovimientoCajaDTO[];
}
export interface ArqueoDTO {
  arqueoId: string; totalContado: string; totalEsperado: string;
  diferencia: string; totalesPorMedio: Record<string, string>; cuadra: boolean;
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' });
  if (r.status === 401) throw new NoAutenticado();
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

export class NoAutenticado extends Error {}

async function post<T = unknown>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw new NoAutenticado();
  if (!r.ok) throw new Error((data as { error?: string })?.error ?? `POST ${url} -> ${r.status}`);
  return data as T;
}

export const api = {
  // --- Auth ---
  me: () => get<{ usuario: Usuario }>('/api/auth/me').then((r) => r.usuario),
  login: async (usuario: string, password: string) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ usuario, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error ?? 'No se pudo iniciar sesión.');
    return data.usuario as Usuario;
  },
  logout: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }),

  // --- Datos ---
  contexto: () => get<Contexto>('/api/contexto'),
  productos: (sucursalId: string, search: string) =>
    get<ProductoDTO[]>(`/api/productos?sucursalId=${sucursalId}&search=${encodeURIComponent(search)}`),
  ventas: (sucursalId: string) => get<VentaDTO[]>(`/api/ventas?sucursalId=${sucursalId}`),
  ventaDetalle: (id: string) => get<VentaDetalleDTO>(`/api/ventas/${id}`),
  actividad: (sucursalId: string) => get<ActividadDTO[]>(`/api/actividad?sucursalId=${sucursalId}`),
  dashboard: () => get<DashboardDTO>('/api/dashboard'),
  stock: (sucursalId: string, search: string) => get<StockItemDTO[]>(`/api/stock?sucursalId=${sucursalId}&search=${encodeURIComponent(search)}`),
  stockDetalle: (productoId: string, sucursalId: string) => get<StockDetalleDTO>(`/api/stock/${productoId}?sucursalId=${sucursalId}`),
  clientes: (search: string) => get<ClienteItemDTO[]>(`/api/clientes?search=${encodeURIComponent(search)}`),
  clienteDetalle: (id: string) => get<ClienteDetalleDTO>(`/api/clientes/${id}`),
  stockIngreso: (body: { varianteId: string; sucursalId: string; cantidad: number }) => post('/api/stock/ingreso', body),
  stockAjuste: (body: { varianteId: string; sucursalId: string; nuevaCantidad: number }) => post('/api/stock/ajuste', body),
  stockTransferencia: (body: { varianteId: string; origenId: string; destinoId: string; cantidad: number }) => post('/api/stock/transferencia', body),
  // --- Caja ---
  cajaEstado: (cajaId: string) => get<CajaEstadoDTO>(`/api/caja/${cajaId}`),
  cajaAbrir: (body: { cajaId: string; sucursalId: string; fondoInicial: number }) =>
    post<{ sesionCajaId: string; fondoInicial: string }>('/api/caja/abrir', body),
  cajaMovimiento: (body: { sesionCajaId: string; sucursalId: string; tipo: 'RETIRO' | 'GASTO' | 'INGRESO_MANUAL'; monto: number; motivo: string }) =>
    post<{ movimientoId: string }>('/api/caja/movimiento', body),
  cajaCerrar: (body: { sesionCajaId: string; sucursalId: string; totalContado: number; observaciones?: string }) =>
    post<ArqueoDTO>('/api/caja/cerrar', body),

  // --- Empleados ---
  empleados: () => get<EmpleadoDTO[]>('/api/empleados'),
  comisiones: (periodo: string, sucursalId?: string) =>
    get<{ periodo: string; filas: ComisionDTO[] }>(`/api/empleados/comisiones?periodo=${periodo}${sucursalId ? `&sucursalId=${sucursalId}` : ''}`),
  liquidarComisiones: (periodo: string, sucursalId: string) =>
    post<{ periodo: string; vendedores: number; total: string }>('/api/empleados/comisiones/liquidar', { periodo, sucursalId }),
  analitica: (periodo: string, sucursalId?: string) =>
    get<AnaliticaDTO>(`/api/dashboard/analitica?periodo=${periodo}${sucursalId ? `&sucursalId=${sucursalId}` : ''}`),

  // --- Proveedores ---
  proveedores: () => get<ProveedorItemDTO[]>('/api/proveedores'),
  proveedorDetalle: (id: string) => get<ProveedorDetalleDTO>(`/api/proveedores/${id}`),
  consignacion: (id: string, periodo: string) => get<ConsignacionDTO>(`/api/proveedores/${id}/consignacion?periodo=${periodo}`),
  liquidarConsignacion: (id: string, periodo: string, sucursalId: string) =>
    post<{ liquidacionId: string; total: string; lineas: number; saldoProveedor: string }>(`/api/proveedores/${id}/liquidar`, { periodo, sucursalId }),
  pagarProveedor: (id: string, monto: number, sucursalId: string) =>
    post<{ saldo: string }>(`/api/proveedores/${id}/pagar`, { monto, sucursalId }),

  // --- Facturación ---
  comprobantes: (sucursalId: string) =>
    get<{ items: ComprobanteDTO[]; resumen: ResumenFiscalDTO }>(`/api/comprobantes?sucursalId=${sucursalId}`),
  procesarCola: () => post<{ procesados: number; obtenidos: number; rechazados: number; reintentar: number }>('/api/comprobantes/procesar', {}),
  libroIva: (sucursalId: string) => get<LibroIvaDTO>(`/api/libro-iva?sucursalId=${sucursalId}`),

  // --- Descuentos y devoluciones ---
  descuentos: () => get<DescuentoDTO[]>('/api/descuentos'),
  previewVenta: (body: { lineas: { varianteId: string; cantidad: number }[]; descuentos: DescuentoPedidoDTO[] }) =>
    post<PreviewDTO>('/api/ventas/preview', body),
  devolver: (body: unknown) => post<{ devolucionId: string; total: string; saldoCredito: string | null }>('/api/devoluciones', body),

  confirmarVenta: async (body: unknown) => {
    const r = await fetch('/api/ventas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error ?? `Error al confirmar (${r.status}).`);
    return data as { ventaId: string; total: string; estadoEntrega: string };
  },
};

/** Formatea centavos (string) a pesos argentinos. */
export function pesos(centavos: string | number): string {
  const n = Number(centavos) / 100;
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}
