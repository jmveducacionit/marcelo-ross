import { useQuery } from '@tanstack/react-query';
import { api, pesos, type DashboardDTO } from '../api';
import { Icon } from '../ui/Icon';

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, retry: false });

  if (isLoading) return <Estado texto="Cargando métricas…" />;
  if (error) return <Estado texto="No tenés permiso para ver reportes (rol Admin, Encargado o Contador)." icon="lock" />;
  const d = data as DashboardDTO;

  const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  const maxSuc = Math.max(1, ...d.porSucursal.map((s) => Number(s.monto)));

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-on-surface">Panorama Ejecutivo</h1>
            <p className="text-on-surface-variant mt-1">Métricas en tiempo real de todas las sucursales.</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2 flex items-center gap-2 text-on-surface-variant text-sm">
            <Icon name="calendar_today" className="text-base" /> Hoy, {hoy}
          </div>
        </header>

        {/* Top cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card titulo="Ventas del día" icon="point_of_sale">
            <div className="font-display text-3xl text-on-surface">{pesos(d.ventasHoy)}</div>
            {d.compVsAyer === null
              ? <Trend icon="horizontal_rule" texto="Sin datos de ayer" tone="neutral" />
              : <Trend icon={d.compVsAyer >= 0 ? 'trending_up' : 'trending_down'} texto={`${d.compVsAyer >= 0 ? '+' : ''}${d.compVsAyer}% vs ayer`} tone={d.compVsAyer >= 0 ? 'up' : 'down'} />}
          </Card>
          <Card titulo="Ticket promedio" icon="receipt">
            <div className="font-display text-3xl text-on-surface">{pesos(d.ticketPromedio)}</div>
            <Trend icon="sell" texto={`${d.tickets} tickets hoy`} tone="neutral" />
          </Card>
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Marcas top (hoy)</span>
              <span className="material-symbols-outlined text-primary bg-primary/5 p-2 rounded-full">sell</span>
            </div>
            <ul className="flex-1 flex flex-col justify-center space-y-2">
              {d.marcasTop.length === 0 && <li className="text-sm text-on-surface-variant">Sin ventas hoy.</li>}
              {d.marcasTop.map((m, i) => (
                <li key={m.marca} className="flex justify-between items-center text-sm">
                  <span className="text-on-surface">{i + 1}. {m.marca}</span>
                  <span className="font-semibold text-on-tertiary-container">{m.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Chart + ranking */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 md:p-8 flex flex-col h-96">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-display text-xl text-on-surface">Rendimiento por sucursal</h3>
                <p className="text-on-surface-variant text-sm mt-1">Facturación del día</p>
              </div>
            </div>
            <div className="flex-1 flex items-end justify-around gap-8 border-b border-outline-variant/20 pb-2">
              {d.porSucursal.map((s) => (
                <div key={s.sucursal} className="flex flex-col items-center flex-1 h-full justify-end group">
                  <div className="text-sm font-semibold text-on-surface mb-2">{pesos(s.monto)}</div>
                  <div className="w-16 bg-primary rounded-t transition-all group-hover:opacity-80"
                    style={{ height: `${Math.max(2, (Number(s.monto) / maxSuc) * 100)}%` }} />
                  <span className="text-xs text-on-surface-variant mt-3">{s.sucursal}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl flex flex-col h-96 overflow-hidden">
            <div className="p-5 border-b border-outline-variant/10">
              <h3 className="font-display text-xl text-on-surface flex items-center gap-2">
                <Icon name="emoji_events" className="text-on-tertiary-container" /> Ranking asesores
              </h3>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-outline-variant/10">
              {d.ranking.length === 0 && <li className="p-6 text-sm text-on-surface-variant text-center">Sin ventas hoy.</li>}
              {d.ranking.map((r, i) => (
                <li key={r.nombre + i} className="p-4 px-5 flex items-center justify-between hover:bg-surface-container-low">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full grid place-items-center text-xs font-semibold ${i === 0 ? 'bg-primary text-on-primary' : 'bg-surface-variant text-on-surface-variant border border-outline-variant/20'}`}>{i + 1}</div>
                    <div>
                      <div className="text-sm font-semibold text-on-surface">{r.nombre}</div>
                      <div className="text-xs text-on-surface-variant">{r.sucursal}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-on-surface">{pesos(r.monto)}</div>
                    <div className="text-xs text-on-tertiary-container">{r.tickets} tickets</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Inmovilizado */}
        <section>
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 flex items-start gap-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-on-tertiary-container opacity-80" />
            <div className="bg-surface-container-high rounded-full p-3 mt-1"><Icon name="inventory" className="text-primary text-2xl" /></div>
            <div className="flex-1">
              <h4 className="font-display text-xl text-on-surface mb-2 flex items-center gap-2">
                Stock inmovilizado
                <span className="bg-surface-container-high text-on-surface-variant text-[11px] px-2 py-1 rounded uppercase tracking-wider">Acción requerida</span>
              </h4>
              <p className="text-on-surface-variant max-w-3xl mb-4">
                Hay <strong className="text-on-surface">{d.inmovilizado.articulos} artículos</strong> ({d.inmovilizado.variantes} variantes) con stock y sin ventas registradas.
                Capital inmovilizado estimado: <strong className="text-on-surface">{pesos(d.inmovilizado.valor)}</strong>.
              </p>
              <div className="flex gap-3">
                <button className="bg-primary text-on-primary text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity">Ver detalle</button>
                <button className="border border-outline-variant text-on-surface text-sm font-semibold px-5 py-2 rounded-lg hover:bg-surface-container-low transition-colors">Sugerir promoción</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Card({ titulo, icon, children }: { titulo: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 flex flex-col justify-between h-40">
      <div className="flex justify-between items-start">
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{titulo}</span>
        <span className="material-symbols-outlined text-primary bg-primary/5 p-2 rounded-full">{icon}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}
function Trend({ icon, texto, tone }: { icon: string; texto: string; tone: 'up' | 'down' | 'neutral' }) {
  const color = tone === 'up' ? 'text-on-tertiary-container' : tone === 'down' ? 'text-error' : 'text-on-surface-variant';
  return <div className={`flex items-center gap-1 mt-1 text-xs ${color}`}><Icon name={icon} className="text-sm" /><span>{texto}</span></div>;
}
function Estado({ texto, icon = 'hourglass_empty' }: { texto: string; icon?: string }) {
  return (
    <div className="flex-1 grid place-items-center p-8">
      <div className="text-center text-on-surface-variant flex flex-col items-center gap-2">
        <Icon name={icon} className="text-3xl text-outline-variant" />{texto}
      </div>
    </div>
  );
}
