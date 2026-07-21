/** Cliente HTTP mínimo contra el pos-server + helper de dinero. */

export interface Caja { id: string; nombre: string }
export interface Sucursal { id: string; nombre: string; esDepositoCentral: boolean; cajas: Caja[] }
export interface Vendedor { id: string; nombre: string }
export interface Contexto { sucursales: Sucursal[]; vendedores: Vendedor[] }

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

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

export const api = {
  contexto: () => get<Contexto>('/api/contexto'),
  productos: (sucursalId: string, search: string) =>
    get<ProductoDTO[]>(`/api/productos?sucursalId=${sucursalId}&search=${encodeURIComponent(search)}`),
  ventas: (sucursalId: string) => get<VentaDTO[]>(`/api/ventas?sucursalId=${sucursalId}`),
  actividad: (sucursalId: string) => get<ActividadDTO[]>(`/api/actividad?sucursalId=${sucursalId}`),
  confirmarVenta: async (body: unknown) => {
    const r = await fetch('/api/ventas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `POST /api/ventas -> ${r.status}`);
    return r.json() as Promise<{ ventaId: string; total: string; estadoEntrega: string }>;
  },
};

/** Formatea centavos (string) a pesos argentinos. */
export function pesos(centavos: string | number): string {
  const n = Number(centavos) / 100;
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}
