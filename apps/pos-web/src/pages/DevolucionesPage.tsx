import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, pesos, type VentaDetalleDTO } from '../api';
import { useUser } from '../lib/user';
import { Icon } from '../ui/Icon';

type Resolucion = 'CREDITO_A_FAVOR' | 'NOTA_CREDITO' | 'CAMBIO';

const RESOLUCIONES: { id: Resolucion; titulo: string; detalle: string; icono: string }[] = [
  { id: 'CREDITO_A_FAVOR', titulo: 'Crédito a favor', detalle: 'Queda saldo en la cuenta del cliente. Requiere identificarlo.', icono: 'account_balance_wallet' },
  { id: 'NOTA_CREDITO', titulo: 'Devolver dinero', detalle: 'Se le devuelve la plata. La nota de crédito la emite Facturación.', icono: 'currency_exchange' },
  { id: 'CAMBIO', titulo: 'Cambio', detalle: 'La prenda vuelve al stock; la venta nueva se hace aparte.', icono: 'swap_horiz' },
];

export function DevolucionesPage() {
  const user = useUser();
  const qc = useQueryClient();
  const puedeDevolver = user.permisos.includes('devoluciones.autorizar');

  const { data: ctx } = useQuery({ queryKey: ['contexto'], queryFn: api.contexto });
  const [sucursalId, setSucursalId] = useState(user.sucursalIdPrincipal);
  const [ventaId, setVentaId] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [resolucion, setResolucion] = useState<Resolucion>('CREDITO_A_FAVOR');
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<{ total: string; saldoCredito: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas', sucursalId], queryFn: () => api.ventas(sucursalId), enabled: !!sucursalId,
  });
  const { data: detalle } = useQuery({
    queryKey: ['venta-det', ventaId], queryFn: () => api.ventaDetalle(ventaId!), enabled: !!ventaId,
  });

  const devolver = useMutation({
    mutationFn: () => api.devolver({
      sucursalId: detalle!.sucursalId,
      cajaId: detalle!.cajaId,
      ventaOrigenId: detalle!.id,
      clienteId: detalle!.cliente?.id ?? null,
      resolucion,
      motivo: motivo.trim() || null,
      lineas: Object.entries(cantidades)
        .filter(([, c]) => c > 0)
        .map(([varianteId, cantidad]) => ({ varianteId, cantidad })),
    }),
    onSuccess: (r) => {
      setResultado({ total: r.total, saldoCredito: r.saldoCredito });
      setCantidades({}); setMotivo(''); setError(null);
      qc.invalidateQueries({ queryKey: ['venta-det'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const seleccionadas = Object.values(cantidades).reduce((a, b) => a + b, 0);
  const totalADevolver = detalle?.lineas.reduce(
    (acc, l) => acc + (cantidades[l.varianteId] ?? 0) * Number(l.precioUnitario), 0) ?? 0;
  const sinCliente = resolucion === 'CREDITO_A_FAVOR' && !detalle?.cliente;

  function setCantidad(varianteId: string, valor: number, max: number) {
    setCantidades((prev) => ({ ...prev, [varianteId]: Math.max(0, Math.min(max, valor)) }));
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-8 pt-8 pb-5 flex flex-wrap justify-between items-end gap-4 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div>
          <h1 className="font-display text-2xl text-primary">Devoluciones y cambios</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Con ticket se devuelve lo que se pagó, no el precio de hoy. La prenda vuelve al stock.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/30 rounded px-2">
          <Icon name="storefront" className="text-outline text-lg" />
          <select value={sucursalId} onChange={(e) => { setSucursalId(e.target.value); setVentaId(null); }}
            className="bg-transparent py-2 pr-1 text-sm focus:outline-none">
            {ctx?.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden gap-6 p-6">
        {/* Ventas recientes */}
        <section className="w-[340px] flex-shrink-0 flex flex-col bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/10">
            <h2 className="font-display text-lg text-primary">Ventas recientes</h2>
            <p className="text-xs text-outline mt-0.5">Elegí la venta a devolver.</p>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-outline-variant/10">
            {ventas.map((v) => (
              <li key={v.id}>
                <button onClick={() => { setVentaId(v.id); setCantidades({}); setResultado(null); setError(null); }}
                  className={`w-full text-left px-5 py-3 transition-colors ${ventaId === v.id ? 'bg-surface-container-high' : 'hover:bg-surface-container-low'}`}>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="font-semibold text-sm truncate">{v.cliente}</span>
                    <span className="font-display text-base text-primary whitespace-nowrap">{pesos(v.total)}</span>
                  </div>
                  <div className="text-[11px] text-outline mt-0.5">
                    {new Date(v.fechaHora).toLocaleString('es-AR')} · {v.items} art. · {v.medios.join(', ')}
                  </div>
                </button>
              </li>
            ))}
            {ventas.length === 0 && <li className="px-5 py-8 text-sm text-on-surface-variant">No hay ventas registradas.</li>}
          </ul>
        </section>

        {/* Detalle y devolución */}
        <section className="flex-1 overflow-y-auto">
          {!detalle && (
            <div className="h-full grid place-items-center text-center text-on-surface-variant">
              <div>
                <Icon name="assignment_return" className="text-5xl text-outline-variant" />
                <p className="mt-3 text-sm">Elegí una venta de la izquierda.</p>
              </div>
            </div>
          )}

          {detalle && (
            <div className="flex flex-col gap-5">
              <Ticket detalle={detalle} />

              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-outline-variant/10">
                  <h2 className="font-display text-xl text-primary">Qué se devuelve</h2>
                </div>
                <ul className="divide-y divide-outline-variant/10">
                  {detalle.lineas.map((l) => (
                    <li key={l.lineaId} className="px-6 py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-on-surface truncate">{l.producto}</p>
                        <p className="text-[11px] text-outline">
                          {l.marca} · {l.talle} {l.color} · {pesos(l.precioUnitario)} c/u
                          {l.devuelto > 0 && <span className="text-on-tertiary-container"> · ya devuelto: {l.devuelto}</span>}
                        </p>
                      </div>
                      {l.disponible === 0
                        ? <span className="text-[11px] text-outline italic">devuelta</span>
                        : (
                          <div className="flex items-center border border-outline-variant/30 rounded">
                            <button onClick={() => setCantidad(l.varianteId, (cantidades[l.varianteId] ?? 0) - 1, l.disponible)}
                              className="px-2.5 py-1 text-on-surface-variant hover:bg-surface-container-high">−</button>
                            <span className="px-2 text-sm w-8 text-center">{cantidades[l.varianteId] ?? 0}</span>
                            <button onClick={() => setCantidad(l.varianteId, (cantidades[l.varianteId] ?? 0) + 1, l.disponible)}
                              className="px-2.5 py-1 text-on-surface-variant hover:bg-surface-container-high">+</button>
                          </div>
                        )}
                      <span className="text-xs text-outline w-16 text-right">de {l.disponible}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {puedeDevolver && (
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 flex flex-col gap-4">
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-on-surface-variant mb-2">Resolución</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {RESOLUCIONES.map((r) => (
                        <button key={r.id} onClick={() => setResolucion(r.id)}
                          className={`text-left border rounded-lg p-3 transition-colors ${
                            resolucion === r.id ? 'border-primary bg-surface-container-high' : 'border-outline-variant/30 hover:border-outline'}`}>
                          <div className="flex items-center gap-1.5 text-sm font-semibold">
                            <Icon name={r.icono} className="text-primary text-base" />{r.titulo}
                          </div>
                          <p className="text-[11px] text-on-surface-variant mt-1 leading-snug">{r.detalle}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo (opcional): el talle no era, falla, no gustó…"
                    className="bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2.5 text-sm focus:outline-none" />

                  {sinCliente && (
                    <p className="text-sm bg-error-container text-on-error-container rounded-lg px-4 py-3">
                      Esta venta no tiene cliente identificado, así que no se le puede dejar crédito a favor.
                      Elegí devolver el dinero o hacer un cambio.
                    </p>
                  )}
                  {error && <p className="text-sm bg-error-container text-on-error-container rounded-lg px-4 py-3">{error}</p>}

                  <div className="flex items-center justify-between gap-4 pt-2 border-t border-outline-variant/10">
                    <div>
                      <p className="text-xs text-on-surface-variant">A devolver</p>
                      <p className="font-display text-2xl text-primary">{pesos(totalADevolver)}</p>
                      <p className="text-[11px] text-outline">{seleccionadas} artículo(s) · al precio pagado</p>
                    </div>
                    <button disabled={seleccionadas === 0 || sinCliente || devolver.isPending}
                      onClick={() => devolver.mutate()}
                      className="bg-primary text-on-primary px-6 py-3 rounded-lg text-sm font-semibold disabled:opacity-40">
                      {devolver.isPending ? 'Registrando…' : 'Registrar devolución'}
                    </button>
                  </div>
                </div>
              )}

              {!puedeDevolver && (
                <p className="text-sm text-on-surface-variant bg-surface-container-low border border-outline-variant/20 rounded-lg px-4 py-3">
                  Podés consultar la venta, pero <strong>la devolución la autoriza un encargado</strong>.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {resultado && (
        <div className="fixed inset-0 bg-primary/40 grid place-items-center z-50 p-4" onClick={() => setResultado(null)}>
          <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 className="font-display text-xl text-primary">Devolución registrada</h3>
              <button onClick={() => setResultado(null)} className="text-outline"><Icon name="close" /></button>
            </div>
            <div className="p-6 text-sm flex flex-col gap-2">
              <div className="flex justify-between"><span className="text-on-surface-variant">Devuelto</span><span className="font-semibold">{pesos(resultado.total)}</span></div>
              {resultado.saldoCredito && (
                <div className="mt-2 p-4 rounded-lg bg-primary-fixed">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Crédito del cliente</span>
                    <span className="font-display text-xl">{pesos(resultado.saldoCredito)}</span>
                  </div>
                  <p className="text-xs mt-1 opacity-80">Ya se puede usar en la próxima venta.</p>
                </div>
              )}
              <p className="text-xs text-outline mt-2">La mercadería volvió al stock de la sucursal.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Ticket({ detalle }: { detalle: VentaDetalleDTO }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="font-display text-xl text-primary">{detalle.cliente?.nombre ?? 'Consumidor Final'}</h2>
          <p className="text-xs text-outline mt-0.5">{new Date(detalle.fechaHora).toLocaleString('es-AR')}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl text-primary">{pesos(detalle.total)}</p>
          {Number(detalle.totalDescuentos) > 0 && (
            <p className="text-[11px] text-on-tertiary-container">incluye − {pesos(detalle.totalDescuentos)} de descuento</p>
          )}
          <p className="text-[11px] text-outline">{detalle.pagos.map((p) => p.medio).join(', ')}</p>
        </div>
      </div>
    </div>
  );
}
