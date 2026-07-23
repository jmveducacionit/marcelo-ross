import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type StockItemDTO } from '../api';
import { useUser } from '../lib/user';
import { Icon } from '../ui/Icon';

const BADGE: Record<string, string> = {
  ok: 'bg-primary-fixed text-primary',
  bajo: 'bg-gold-wash text-on-tertiary-container',
  agotado: 'bg-error-container text-on-error-container',
};

export function StockPage() {
  const user = useUser();
  const { data: ctx } = useQuery({ queryKey: ['contexto'], queryFn: api.contexto });
  const [sucursalId, setSucursalId] = useState(user.sucursalIdPrincipal);
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const { data: lista = [], isFetching } = useQuery({
    queryKey: ['stock', sucursalId, search], queryFn: () => api.stock(sucursalId, search), enabled: !!sucursalId,
  });
  const { data: detalle } = useQuery({
    queryKey: ['stock-det', selId, sucursalId], queryFn: () => api.stockDetalle(selId!, sucursalId), enabled: !!selId,
  });

  useEffect(() => { if (lista.length && (!selId || !lista.find((p) => p.id === selId))) setSelId(lista[0]!.id); }, [lista, selId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-8 pt-8 pb-5 flex flex-wrap justify-between items-end gap-4 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div>
          <h1 className="font-display text-2xl text-primary">Inventario</h1>
          <p className="text-on-surface-variant text-sm mt-1">Stock a nivel variante, por sucursal.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/30 rounded px-2">
            <Icon name="storefront" className="text-outline text-lg" />
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className="bg-transparent py-2 pr-1 text-sm focus:outline-none">
              {ctx?.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…"
              className="pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded w-64 focus:outline-none focus:border-primary text-sm" />
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden gap-6 p-6">
        {/* Left: product list */}
        <div className="w-[360px] flex-shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">
          {isFetching && lista.length === 0 && <div className="text-sm text-on-surface-variant py-6 text-center">Cargando…</div>}
          {lista.map((p) => <ProductCard key={p.id} p={p} activo={p.id === selId} onClick={() => setSelId(p.id)} />)}
          {!isFetching && lista.length === 0 && <div className="text-sm text-on-surface-variant py-6 text-center">Sin resultados.</div>}
        </div>

        {/* Right: detail */}
        <div className="flex-1 overflow-y-auto pr-1">
          {!detalle && <div className="h-full grid place-items-center text-on-surface-variant">Elegí un producto de la lista.</div>}
          {detalle && (
            <div className="flex flex-col gap-6">
              {/* Meta + stats */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] uppercase tracking-widest text-on-surface-variant bg-surface-container-high px-2 py-1 rounded">{detalle.producto.marca}</span>
                    <h2 className="font-display text-2xl text-primary mt-2 leading-tight">{detalle.producto.nombre}</h2>
                    <p className="text-sm text-on-surface-variant mt-1">{detalle.producto.categoria}
                      {detalle.producto.esConsignacion && <span className="ml-2 text-[10px] uppercase tracking-wide bg-gold-wash text-tertiary-container px-1.5 py-0.5 rounded">consignación</span>}
                    </p>
                  </div>
                </div>
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 grid grid-cols-2 gap-3">
                  <Stat label="Variantes" valor={String(detalle.producto.totalVariantes)} />
                  <Stat label="Stock total" valor={`${detalle.producto.totalStock}`} sufijo="u." />
                  <div className="col-span-2 p-3 bg-surface rounded-lg border border-outline-variant/10 flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">Estado</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${BADGE[detalle.producto.estado]}`}>
                      {detalle.producto.estado === 'ok' ? 'Saludable' : detalle.producto.estado === 'bajo' ? 'Reponer' : 'Agotado'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Matrix */}
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-outline-variant/10 bg-surface-container-low/50">
                  <h3 className="font-display text-xl text-primary">Matriz de Talle × Color</h3>
                  <p className="text-xs text-on-surface-variant mt-1">Stock en vivo por dimensión física.</p>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="p-3 text-left text-[11px] uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20 bg-surface sticky left-0">Color \ Talle</th>
                        {detalle.talles.map((t) => (
                          <th key={t.id} className="p-3 text-center text-xs uppercase text-primary border-b border-outline-variant/20 min-w-[48px]">{t.etiqueta}</th>
                        ))}
                        <th className="p-3 text-center text-[11px] uppercase text-on-surface-variant border-b border-outline-variant/20 border-l border-outline-variant/10">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.colores.map((c) => (
                        <tr key={c.id} className="hover:bg-surface-container-low/40">
                          <td className="p-3 border-b border-outline-variant/10 sticky left-0 bg-surface-container-lowest">
                            <span className="flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full border border-outline-variant/30" style={{ backgroundColor: c.hex ?? '#ccc' }} />
                              {c.nombre}
                            </span>
                          </td>
                          {detalle.talles.map((t) => {
                            const cel = detalle.celdas[c.id]?.[t.id];
                            return <td key={t.id} className="p-3 text-center border-b border-outline-variant/10"><Celda stock={cel?.stock ?? null} existe={!!cel} /></td>;
                          })}
                          <td className="p-3 text-center border-b border-outline-variant/10 border-l border-outline-variant/10 font-semibold text-primary bg-surface-container-low/10">{detalle.totalPorColor[c.id] ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="p-3 text-[11px] uppercase tracking-widest text-on-surface-variant sticky left-0 bg-surface-container-lowest">Total por talle</td>
                        {detalle.talles.map((t) => <td key={t.id} className="p-3 text-center font-semibold text-primary">{detalle.totalPorTalle[t.id] ?? 0}</td>)}
                        <td className="p-3 text-center border-l border-outline-variant/10 font-display text-lg text-primary bg-surface-container-low/10">{detalle.total}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ p, activo, onClick }: { p: StockItemDTO; activo: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-left bg-surface-container-lowest rounded-lg p-3 flex gap-3 transition-colors ${activo ? 'border-2 border-primary' : 'border border-outline-variant/20 hover:border-primary/50'}`}>
      <div className="w-14 h-16 bg-surface-container rounded shrink-0 grid place-items-center text-outline-variant">
        <Icon name="checkroom" className="text-2xl" />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant truncate">{p.marca}</span>
        <h3 className={`font-display text-[15px] leading-tight truncate ${activo ? 'text-primary' : 'text-on-surface'}`}>{p.nombre}</h3>
        <div className="flex justify-between items-end mt-auto pt-1">
          <span className="text-[11px] text-on-surface-variant">{p.variantes} var.</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${BADGE[p.estado]}`}>{p.totalStock} u.</span>
        </div>
      </div>
    </button>
  );
}

function Stat({ label, valor, sufijo }: { label: string; valor: string; sufijo?: string }) {
  return (
    <div className="p-3 bg-surface rounded-lg border border-outline-variant/10">
      <p className="text-[11px] uppercase tracking-widest text-on-surface-variant mb-1">{label}</p>
      <p className="font-display text-2xl text-primary">{valor}{sufijo && <span className="text-xs font-normal text-on-surface-variant ml-1">{sufijo}</span>}</p>
    </div>
  );
}

function Celda({ stock, existe }: { stock: number | null; existe: boolean }) {
  if (!existe) return <span className="text-outline-variant">·</span>;
  if (stock === 0) return <span className="text-outline-variant/60">0</span>;
  if ((stock ?? 0) <= 2) return <span className="inline-flex items-center gap-0.5 text-error font-semibold">{stock}<Icon name="warning" className="text-[13px]" /></span>;
  return <span className="text-on-surface">{stock}</span>;
}
