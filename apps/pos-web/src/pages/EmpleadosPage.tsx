import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, pesos } from '../api';
import { useUser } from '../lib/user';
import { Icon } from '../ui/Icon';

function periodoActual() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

export function EmpleadosPage() {
  const user = useUser();
  const qc = useQueryClient();
  const puedeLiquidar = user.permisos.includes('usuarios.gestionar');

  const { data: ctx } = useQuery({ queryKey: ['contexto'], queryFn: api.contexto });
  const [sucursalId, setSucursalId] = useState<string>('');
  const [periodo, setPeriodo] = useState(periodoActual());
  const [vista, setVista] = useState<'comisiones' | 'usuarios'>('comisiones');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data: com } = useQuery({
    queryKey: ['comisiones', periodo, sucursalId], queryFn: () => api.comisiones(periodo, sucursalId || undefined),
  });
  const { data: usuarios = [] } = useQuery({
    queryKey: ['empleados'], queryFn: api.empleados, enabled: vista === 'usuarios' && puedeLiquidar,
  });

  const liquidar = useMutation({
    mutationFn: () => api.liquidarComisiones(periodo, sucursalId || ctx!.sucursales[0]!.id),
    onSuccess: (r) => {
      setToast(`Liquidadas ${r.vendedores} comisión(es) por ${pesos(r.total)}.`); setError(null);
      qc.invalidateQueries({ queryKey: ['comisiones'] });
      setTimeout(() => setToast(null), 4500);
    },
    onError: (e: Error) => setError(e.message),
  });

  const filas = com?.filas ?? [];
  const totalComision = filas.reduce((a, f) => a + Number(f.comision), 0);
  const hayPendientes = filas.some((f) => !f.liquidada && Number(f.comision) > 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-8 pt-8 pb-5 flex flex-wrap justify-between items-end gap-4 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div>
          <h1 className="font-display text-2xl text-primary">Empleados</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            La comisión se calcula sobre la venta <strong>neta de devoluciones</strong> y se devenga al liquidar el
            período, no al vender.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/30 rounded px-2">
            <Icon name="storefront" className="text-outline text-lg" />
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className="bg-transparent py-2 pr-1 text-sm focus:outline-none">
              <option value="">Todas</option>
              {ctx?.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none" />
        </div>
      </header>

      {puedeLiquidar && (
        <div className="px-8 pt-5">
          <div className="inline-flex bg-surface-container-low border border-outline-variant/30 rounded-lg p-0.5">
            {(['comisiones', 'usuarios'] as const).map((v) => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-4 py-1.5 rounded-md text-sm transition-colors ${vista === v ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant'}`}>
                {v === 'comisiones' ? 'Comisiones y ranking' : 'Usuarios'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 pt-4 flex flex-col gap-5">
        {error && <p className="text-sm bg-error-container text-on-error-container rounded-lg px-4 py-3">{error}</p>}

        {vista === 'comisiones' && (
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl text-primary">Ranking de vendedores</h2>
                <p className="text-xs text-outline mt-0.5">Comisión del {periodo} al {filas[0]?.porcentaje ?? 3}%.</p>
              </div>
              {puedeLiquidar && (
                <button onClick={() => liquidar.mutate()} disabled={!hayPendientes || liquidar.isPending}
                  className="bg-primary text-on-primary px-4 py-2 rounded text-sm font-semibold disabled:opacity-40">
                  {liquidar.isPending ? 'Liquidando…' : hayPendientes ? 'Liquidar período' : 'Período liquidado'}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/10">
                  <tr>
                    <th className="px-6 py-2.5 text-left font-semibold">Vendedor</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Tickets</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Vendido</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Devuelto</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Base</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Part.</th>
                    <th className="px-6 py-2.5 text-right font-semibold">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filas.map((f) => (
                    <tr key={f.vendedorId} className="hover:bg-surface-container-low">
                      <td className="px-6 py-2.5">
                        {f.nombre}
                        <span className="block text-[11px] text-outline">
                          {f.rol} · ticket prom. {pesos(f.ticketPromedio)}
                          {f.liquidada && <span className="text-primary"> · liquidada</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{f.tickets}</td>
                      <td className="px-3 py-2.5 text-right">{pesos(f.vendido)}</td>
                      <td className={`px-3 py-2.5 text-right ${Number(f.devuelto) > 0 ? 'text-on-tertiary-container' : 'text-outline'}`}>
                        {Number(f.devuelto) > 0 ? `− ${pesos(f.devuelto)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">{pesos(f.base)}</td>
                      <td className="px-3 py-2.5 text-right text-outline">{f.participacion}%</td>
                      <td className="px-6 py-2.5 text-right font-display text-base text-primary">{pesos(f.comision)}</td>
                    </tr>
                  ))}
                  {filas.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">Sin ventas en el período.</td></tr>
                  )}
                </tbody>
                {filas.length > 0 && (
                  <tfoot className="border-t-2 border-outline-variant/20 font-semibold">
                    <tr>
                      <td colSpan={6} className="px-6 py-3">Total a liquidar</td>
                      <td className="px-6 py-3 text-right font-display text-lg text-primary">{pesos(totalComision)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="px-6 py-3 text-[11px] text-outline border-t border-outline-variant/10">
              Las devoluciones se imputan al período en que ocurren, no al de la venta original: es la única regla que
              no obliga a reabrir un período ya pagado. Una devolución sin ticket no tiene a quién restarle y queda
              fuera de la base.
            </p>
          </div>
        )}

        {vista === 'usuarios' && (
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10">
              <h2 className="font-display text-xl text-primary">Usuarios</h2>
              <p className="text-xs text-outline mt-0.5">
                Se siembran en la instalación. El alta y el cambio de contraseña por pantalla todavía no están.
              </p>
            </div>
            <ul className="divide-y divide-outline-variant/10">
              {usuarios.map((u) => (
                <li key={u.id} className="px-6 py-3 flex items-center gap-4 text-sm">
                  <div className="w-9 h-9 rounded-full grid place-items-center bg-surface-container border border-outline-variant/20 text-xs font-semibold">
                    {u.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-on-surface">{u.nombre} <span className="text-outline">· {u.usuario}</span></p>
                    <p className="text-[11px] text-outline">
                      {u.rol} · {u.sucursal}
                      {u.ultimoLogin && ` · último ingreso ${new Date(u.ultimoLogin).toLocaleString('es-AR')}`}
                    </p>
                  </div>
                  {u.bloqueado && (
                    <span className="text-[11px] bg-error-container text-on-error-container px-2 py-0.5 rounded">bloqueado</span>
                  )}
                  <span className={`text-[11px] px-2 py-0.5 rounded ${u.activo ? 'bg-primary-fixed text-primary' : 'bg-surface-container text-outline'}`}>
                    {u.activo ? 'activo' : 'inactivo'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-6 py-3 rounded-lg shadow-xl text-sm flex items-center gap-2 z-50">
          <Icon name="check_circle" className="text-lg" /> {toast}
        </div>
      )}
    </div>
  );
}
