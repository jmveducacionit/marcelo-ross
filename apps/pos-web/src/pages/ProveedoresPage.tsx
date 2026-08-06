import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, pesos } from '../api';
import { useUser } from '../lib/user';
import { Icon } from '../ui/Icon';

const MOTIVO: Record<string, string> = {
  RECEPCION_REMITO: 'Recepción de remito',
  LIQUIDACION_CONSIGNACION: 'Liquidación de consignación',
  PAGO: 'Pago',
  AJUSTE: 'Ajuste',
};

function periodoActual() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

export function ProveedoresPage() {
  const user = useUser();
  const qc = useQueryClient();
  const { data: ctx } = useQuery({ queryKey: ['contexto'], queryFn: api.contexto });
  const sucursalId = ctx?.sucursales[0]?.id ?? user.sucursalIdPrincipal;

  const [selId, setSelId] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(periodoActual());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data: lista = [] } = useQuery({ queryKey: ['proveedores'], queryFn: api.proveedores });
  const proveedorId = selId ?? lista[0]?.id ?? null;
  const { data: detalle } = useQuery({
    queryKey: ['proveedor', proveedorId], queryFn: () => api.proveedorDetalle(proveedorId!), enabled: !!proveedorId,
  });
  const { data: consig } = useQuery({
    queryKey: ['consignacion', proveedorId, periodo],
    queryFn: () => api.consignacion(proveedorId!, periodo),
    enabled: !!proveedorId && !!detalle?.esConsignatario,
  });

  function ok(msg: string) {
    setToast(msg); setError(null);
    qc.invalidateQueries({ queryKey: ['proveedores'] });
    qc.invalidateQueries({ queryKey: ['proveedor'] });
    qc.invalidateQueries({ queryKey: ['consignacion'] });
    setTimeout(() => setToast(null), 4500);
  }
  const fallo = (e: unknown) => setError(e instanceof Error ? e.message : 'Algo salió mal.');

  const liquidar = useMutation({
    mutationFn: () => api.liquidarConsignacion(proveedorId!, periodo, sucursalId),
    onSuccess: (r) => ok(`Liquidación emitida: ${pesos(r.total)} en ${r.lineas} artículo(s).`),
    onError: fallo,
  });
  const pagar = useMutation({
    mutationFn: (monto: number) => api.pagarProveedor(proveedorId!, monto, sucursalId),
    onSuccess: () => ok('Pago registrado.'),
    onError: fallo,
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-8 pt-8 pb-5 border-b border-outline-variant/10 bg-surface-container-lowest">
        <h1 className="font-display text-2xl text-primary">Proveedores</h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Cuenta corriente, recepción contra remito y liquidación de consignación.
          La mercadería consignada no genera deuda al recibirla: se paga cuando se vende.
        </p>
      </header>

      <div className="flex-1 flex overflow-hidden gap-6 p-6">
        <section className="w-[340px] flex-shrink-0 flex flex-col bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/10">
            <h2 className="font-display text-lg text-primary">Cuentas corrientes</h2>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-outline-variant/10">
            {lista.map((p) => (
              <li key={p.id}>
                <button onClick={() => { setSelId(p.id); setError(null); }}
                  className={`w-full text-left px-5 py-3 transition-colors ${proveedorId === p.id ? 'bg-surface-container-high' : 'hover:bg-surface-container-low'}`}>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="font-semibold text-sm truncate">{p.razonSocial}</span>
                    <span className={`font-display text-base whitespace-nowrap ${Number(p.saldo) > 0 ? 'text-primary' : 'text-outline'}`}>
                      {pesos(p.saldo)}
                    </span>
                  </div>
                  <div className="text-[11px] text-outline mt-0.5 flex items-center gap-1.5">
                    {p.esConsignatario && (
                      <span className="px-1.5 py-0.5 rounded bg-gold-wash text-on-tertiary-container uppercase tracking-wide text-[9px]">consignación</span>
                    )}
                    <span className="truncate">{p.marcas.join(', ')}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex-1 overflow-y-auto">
          {detalle && (
            <div className="flex flex-col gap-5">
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 flex flex-wrap justify-between items-start gap-4">
                <div>
                  <h2 className="font-display text-xl text-primary">{detalle.razonSocial}</h2>
                  <p className="text-xs text-outline mt-0.5">CUIT {detalle.cuit} · {detalle.condicionIva}</p>
                  <p className="text-xs text-outline">{detalle.marcas.join(' · ')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-on-surface-variant">Saldo</p>
                  <p className="font-display text-2xl text-primary">{pesos(detalle.saldo)}</p>
                  {Number(detalle.saldo) > 0 && (
                    <button onClick={() => { const m = prompt('¿Cuánto le pagás? (en pesos)'); if (!m) return; const c = Math.round(Number(m.replace(',', '.')) * 100); if (Number.isFinite(c) && c > 0) pagar.mutate(c); }}
                      className="mt-2 text-xs border border-primary text-primary px-3 py-1.5 rounded hover:bg-primary/5">
                      Registrar pago
                    </button>
                  )}
                </div>
              </div>

              {error && <p className="text-sm bg-error-container text-on-error-container rounded-lg px-4 py-3">{error}</p>}

              {detalle.esConsignatario && (
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-outline-variant/10 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg text-primary">Consignación vendida</h3>
                      <p className="text-xs text-outline mt-0.5">Lo que se le debe por su mercadería vendida en el período.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
                        className="bg-surface-container-low border border-outline-variant/30 rounded px-3 py-1.5 text-sm focus:outline-none" />
                      <button onClick={() => liquidar.mutate()} disabled={!consig?.lineas.length || liquidar.isPending}
                        className="bg-primary text-on-primary px-4 py-1.5 rounded text-sm font-semibold disabled:opacity-40">
                        {liquidar.isPending ? 'Emitiendo…' : 'Liquidar período'}
                      </button>
                    </div>
                  </div>

                  {consig && consig.lineas.length > 0 ? (
                    <>
                      <table className="w-full text-sm">
                        <thead className="text-[11px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/10">
                          <tr>
                            <th className="px-6 py-2.5 text-left font-semibold">Artículo</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Vendidas</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Costo</th>
                            <th className="px-6 py-2.5 text-right font-semibold">A liquidar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                          {consig.lineas.map((l) => (
                            <tr key={l.varianteId} className="hover:bg-surface-container-low">
                              <td className="px-6 py-2.5">
                                {l.producto}<span className="block text-[11px] text-outline">{l.detalle}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right">{l.cantidadVendida}</td>
                              <td className="px-4 py-2.5 text-right">{pesos(l.costoUnitario)}</td>
                              <td className="px-6 py-2.5 text-right font-semibold">{pesos(l.montoALiquidar)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-outline-variant/20">
                          <tr>
                            <td colSpan={3} className="px-6 py-3 font-semibold">Total del período</td>
                            <td className="px-6 py-3 text-right font-display text-lg text-primary">{pesos(consig.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      {consig.sinCosto.length > 0 && (
                        <p className="px-6 py-3 text-[11px] bg-gold-wash/40 border-t border-gold/20">
                          <strong>{consig.sinCosto.length} artículo(s) vendidos sin costo registrado</strong> — nunca
                          entraron por remito, así que no se pueden liquidar. Cargá el remito y volvé a calcular.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="px-6 py-8 text-sm text-on-surface-variant">
                      No hay ventas de su mercadería consignada en este período.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Panel titulo="Movimientos de la cuenta">
                  {detalle.movimientos.length === 0
                    ? <p className="px-6 py-6 text-sm text-on-surface-variant">Sin movimientos.</p>
                    : (
                      <ul className="divide-y divide-outline-variant/10">
                        {detalle.movimientos.map((m) => (
                          <li key={m.id} className="px-6 py-2.5 flex items-center justify-between gap-3 text-sm">
                            <div>
                              <p>{MOTIVO[m.motivo] ?? m.motivo}</p>
                              <p className="text-[11px] text-outline">{new Date(m.ocurridoEn).toLocaleDateString('es-AR')}</p>
                            </div>
                            <span className={`font-semibold ${Number(m.monto) < 0 ? 'text-on-tertiary-container' : ''}`}>
                              {Number(m.monto) < 0 ? '−' : '+'} {pesos(Math.abs(Number(m.monto)))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                </Panel>

                <Panel titulo="Remitos recibidos">
                  {detalle.remitos.length === 0
                    ? <p className="px-6 py-6 text-sm text-on-surface-variant">Sin remitos.</p>
                    : (
                      <ul className="divide-y divide-outline-variant/10">
                        {detalle.remitos.map((r) => (
                          <li key={r.id} className="px-6 py-2.5 flex items-center justify-between gap-3 text-sm">
                            <div>
                              <p className="font-mono text-xs">{r.numero}</p>
                              <p className="text-[11px] text-outline">
                                {new Date(r.fecha).toLocaleDateString('es-AR')} · {r.lineas} línea(s)
                              </p>
                            </div>
                            <span className="font-semibold">{pesos(r.total)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </Panel>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-6 py-3 rounded-lg shadow-xl text-sm flex items-center gap-2 z-50">
          <Icon name="check_circle" className="text-lg" /> {toast}
        </div>
      )}
    </div>
  );
}

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
      <div className="px-6 py-3.5 border-b border-outline-variant/10">
        <h3 className="font-display text-base text-primary">{titulo}</h3>
      </div>
      {children}
    </div>
  );
}
