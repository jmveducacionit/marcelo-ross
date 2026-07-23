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

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' });
  if (r.status === 401) throw new NoAutenticado();
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

export class NoAutenticado extends Error {}

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
  actividad: (sucursalId: string) => get<ActividadDTO[]>(`/api/actividad?sucursalId=${sucursalId}`),
  dashboard: () => get<DashboardDTO>('/api/dashboard'),
  stock: (sucursalId: string, search: string) => get<StockItemDTO[]>(`/api/stock?sucursalId=${sucursalId}&search=${encodeURIComponent(search)}`),
  stockDetalle: (productoId: string, sucursalId: string) => get<StockDetalleDTO>(`/api/stock/${productoId}?sucursalId=${sucursalId}`),
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
