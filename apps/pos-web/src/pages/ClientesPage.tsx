import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, pesos, type ClienteItemDTO } from '../api';
import { Icon } from '../ui/Icon';

const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

export function ClientesPage() {
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const { data: lista = [] } = useQuery({ queryKey: ['clientes', search], queryFn: () => api.clientes(search) });
  const { data: det } = useQuery({ queryKey: ['cliente', selId], queryFn: () => api.clienteDetalle(selId!), enabled: !!selId });

  useEffect(() => { if (lista.length && (!selId || !lista.find((c) => c.id === selId))) setSelId(lista[0]!.id); }, [lista, selId]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: client list */}
      <aside className="w-[320px] flex-shrink-0 border-r border-outline-variant/10 flex flex-col bg-surface-container-lowest">
        <div className="p-5 border-b border-outline-variant/10">
          <h1 className="font-display text-2xl text-primary mb-3">Clientes</h1>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente…"
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded focus:outline-none focus:border-primary text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {lista.map((c) => <ClienteRow key={c.id} c={c} activo={c.id === selId} onClick={() => setSelId(c.id)} />)}
          {lista.length === 0 && <div className="text-sm text-on-surface-variant py-6 text-center">Sin resultados.</div>}
        </div>
      </aside>

      {/* Right: profile */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        {!det && <div className="h-full grid place-items-center text-on-surface-variant">Elegí un cliente de la lista.</div>}
        {det && (
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <span>Clientes</span><Icon name="chevron_right" className="text-base" /><span className="text-primary">{det.cliente.nombre}</span>
            </div>

            {/* Identity + loyalty */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-surface-container-low border border-outline-variant/10 rounded-xl p-6 flex flex-col justify-between">
                <div className="mb-6">
                  <h2 className="font-display text-2xl text-primary mb-1">{det.cliente.nombre}</h2>
                  <p className="text-sm text-on-surface-variant">
                    {det.clienteDesde ? `Cliente desde ${fmtFecha(det.clienteDesde)}` : 'Sin compras registradas'} · {det.cliente.condicionIva}
                  </p>
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                  <span className="flex items-center gap-2"><Icon name="phone" className="text-secondary" />{det.cliente.telefono ?? '—'}</span>
                  <span className="flex items-center gap-2"><Icon name="mail" className="text-secondary" />{det.cliente.email ?? '—'}</span>
                </div>
              </div>
              <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-5 flex flex-col gap-3">
                <LoyaltyCard label="Crédito a favor" valor={pesos(det.creditoAFavor)} icon="account_balance_wallet" tint="bg-tertiary-fixed-dim/20 text-on-tertiary-container" />
                <LoyaltyCard label="Total comprado" valor={pesos(det.totalComprado)} icon="stars" tint="bg-tertiary-fixed/30 text-tertiary" />
              </div>
            </div>

            {/* Talles + fiscales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel icon="straighten" titulo="Talles Habituales">
                {det.tallesHabituales.length === 0 && <p className="text-sm text-on-surface-variant">Sin talles registrados.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {det.tallesHabituales.map((t, i) => (
                    <div key={i} className="text-center">
                      <p className="text-[11px] uppercase tracking-wide text-on-surface-variant mb-1">{t.categoria}</p>
                      <div className="font-semibold text-on-surface bg-surface-container-low py-2 rounded">{t.talle}</div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel icon="domain" titulo="Datos Fiscales" badge={det.cliente.esFacturaA ? 'Factura A' : 'Factura B'}>
                {det.cliente.esFacturaA ? (
                  <div className="space-y-2 text-sm">
                    <FilaFiscal k="Razón Social" v={det.cliente.razonSocial ?? '—'} />
                    <FilaFiscal k="CUIT" v={det.cliente.cuit ?? '—'} />
                    <FilaFiscal k="Condición IVA" v={det.cliente.condicionIva} />
                    <FilaFiscal k="Domicilio Fiscal" v={det.cliente.domicilioFiscal ?? '—'} />
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant">Consumidor final — sin datos fiscales para Factura A.</p>
                )}
              </Panel>
            </div>

            {/* Historial */}
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-outline-variant/10 bg-surface-container-low/50 flex items-center gap-2">
                <Icon name="receipt_long" className="text-primary" />
                <h3 className="font-display text-xl text-primary">Historial de Compras</h3>
              </div>
              {det.historial.length === 0 ? (
                <div className="p-8 text-center text-sm text-on-surface-variant">Sin compras registradas.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant/10 bg-surface-container-low">
                        <th className="p-4 text-[11px] uppercase tracking-wide text-on-surface-variant font-semibold">Fecha</th>
                        <th className="p-4 text-[11px] uppercase tracking-wide text-on-surface-variant font-semibold">Ticket</th>
                        <th className="p-4 text-[11px] uppercase tracking-wide text-on-surface-variant font-semibold">Marcas / artículos</th>
                        <th className="p-4 text-[11px] uppercase tracking-wide text-on-surface-variant font-semibold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {det.historial.map((h) => (
                        <tr key={h.ventaId} className="border-b border-outline-variant/10 hover:bg-surface-container-low/40">
                          <td className="p-4 text-on-surface-variant whitespace-nowrap">{fmtFecha(h.fecha)}</td>
                          <td className="p-4 text-on-surface font-mono text-xs">#{h.ventaId.slice(0, 8)}</td>
                          <td className="p-4">
                            <div className="text-on-surface font-medium">{h.marcas.join(', ') || '—'}</div>
                            <div className="text-xs text-on-surface-variant mt-0.5">{h.items} artículo{h.items === 1 ? '' : 's'}</div>
                          </td>
                          <td className="p-4 text-right font-semibold text-primary whitespace-nowrap">{pesos(h.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClienteRow({ c, activo, onClick }: { c: ClienteItemDTO; activo: boolean; onClick: () => void }) {
  const iniciales = c.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <button onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-outline-variant/5 transition-colors ${activo ? 'bg-surface-container-high' : 'hover:bg-surface-container-low'}`}>
      <div className="w-9 h-9 rounded-full grid place-items-center bg-primary text-on-primary text-xs font-semibold shrink-0">{iniciales}</div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm truncate ${activo ? 'text-primary font-semibold' : 'text-on-surface'}`}>{c.nombre}</div>
        <div className="text-[11px] text-on-surface-variant">{c.condicionIva}</div>
      </div>
      {c.esFacturaA && <span className="text-[10px] uppercase tracking-wide bg-tertiary-fixed text-on-tertiary-fixed px-1.5 py-0.5 rounded">A</span>}
    </button>
  );
}
function LoyaltyCard({ label, valor, icon, tint }: { label: string; valor: string; icon: string; tint: string }) {
  return (
    <div className="bg-surface-container-lowest p-4 rounded border border-outline-variant/10 flex justify-between items-center">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-on-surface-variant mb-1">{label}</p>
        <p className="font-display text-lg font-bold text-primary">{valor}</p>
      </div>
      <span className={`material-symbols-outlined p-2 rounded-full ${tint}`}>{icon}</span>
    </div>
  );
}
function Panel({ icon, titulo, badge, children }: { icon: string; titulo: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-2"><Icon name={icon} className="text-primary" /><h3 className="font-display text-xl text-primary">{titulo}</h3></div>
        {badge && <span className="text-[11px] uppercase tracking-wide bg-tertiary-fixed text-on-tertiary-fixed px-2 py-1 rounded">{badge}</span>}
      </div>
      {children}
    </div>
  );
}
function FilaFiscal({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><span className="text-on-surface-variant">{k}</span><span className="text-on-surface font-medium text-right truncate">{v}</span></div>;
}
