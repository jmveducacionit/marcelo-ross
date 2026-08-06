import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, pesos, type DescuentoDTO, type DescuentoPedidoDTO, type ProductoDTO, type VarianteDTO } from '../api';
import { useUser } from '../lib/user';
import { Icon } from '../ui/Icon';

interface CartItem {
  varianteId: string; producto: string; talle: string; color: string;
  precio: string; cantidad: number; stock: number; requiereAjuste: boolean;
}

const MEDIOS: { id: string; label: string; icon: string }[] = [
  { id: 'EFECTIVO', label: 'Efectivo', icon: 'payments' },
  { id: 'DEBITO', label: 'Débito', icon: 'credit_card' },
  { id: 'CREDITO', label: 'Crédito', icon: 'credit_card' },
  { id: 'QR', label: 'MODO / QR', icon: 'qr_code_scanner' },
  { id: 'TRANSFERENCIA', label: 'Transferencia', icon: 'account_balance' },
];

export function VentasPage() {
  const user = useUser();
  const qc = useQueryClient();
  const { data: ctx } = useQuery({ queryKey: ['contexto'], queryFn: api.contexto });

  const [sucursalId, setSucursalId] = useState(user.sucursalIdPrincipal);
  const [cajaId, setCajaId] = useState('');
  const [search, setSearch] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [medio, setMedio] = useState('EFECTIVO');
  const [toast, setToast] = useState<string | null>(null);
  const [descuentos, setDescuentos] = useState<DescuentoPedidoDTO[]>([]);
  const [modalDesc, setModalDesc] = useState(false);

  const puedeCobrar = user.permisos.includes('ventas.cobrar');
  const puedeAutorizar = user.permisos.includes('descuentos.autorizar');

  useEffect(() => {
    if (ctx && !cajaId) {
      const s = ctx.sucursales.find((x) => x.id === sucursalId) ?? ctx.sucursales[0];
      if (s) { setSucursalId(s.id); setCajaId(s.cajas[0]?.id ?? ''); }
    }
  }, [ctx, sucursalId, cajaId]);

  const sucursal = ctx?.sucursales.find((s) => s.id === sucursalId);
  const { data: productos = [], isFetching } = useQuery({
    queryKey: ['productos', sucursalId, search], queryFn: () => api.productos(sucursalId, search), enabled: !!sucursalId,
  });

  const items = useMemo(() => cart.reduce((n, i) => n + i.cantidad, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((s, i) => s + Number(i.precio) * i.cantidad, 0), [cart]);
  const hayAjuste = cart.some((i) => i.requiereAjuste);

  const { data: catalogoDesc = [] } = useQuery({ queryKey: ['descuentos'], queryFn: api.descuentos });

  // El total con descuentos lo calcula el SERVIDOR, con el mismo motor que usa
  // al confirmar. Reimplementar el redondeo acá sería la forma más rápida de
  // que la pantalla y el ticket muestren números distintos.
  const { data: preview, error: errorPreview } = useQuery({
    queryKey: ['preview', cart.map((i) => `${i.varianteId}x${i.cantidad}`).join(','), JSON.stringify(descuentos)],
    queryFn: () => api.previewVenta({
      lineas: cart.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })),
      descuentos,
    }),
    enabled: cart.length > 0,
    retry: false,
  });

  const totalDescuentos = Number(preview?.totalDescuentos ?? 0);
  const total = preview ? Number(preview.total) : subtotal;
  const reintegros = preview?.reintegros ?? [];

  const nombreDesc = (id: string) => catalogoDesc.find((d) => d.id === id)?.nombre ?? 'Descuento';

  const confirmar = useMutation({
    mutationFn: () => api.confirmarVenta({
      sucursalId, cajaId,
      lineas: cart.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad, requiereAjuste: i.requiereAjuste })),
      pagos: [{ medio, monto: total }],
      descuentos,
    }),
    onSuccess: (r) => {
      setToast(`Venta confirmada · ${pesos(r.total)} · ${r.estadoEntrega === 'PENDIENTE_AJUSTE' ? 'con ajuste (entrega diferida)' : 'entregada'}`);
      setCart([]); setDescuentos([]);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      setTimeout(() => setToast(null), 4500);
    },
    onError: (e: Error) => { setToast(`Error: ${e.message}`); setTimeout(() => setToast(null), 4500); },
  });

  function agregar(p: ProductoDTO, v: VarianteDTO) {
    if (v.stock <= 0) return;
    setCart((prev) => {
      const ex = prev.find((i) => i.varianteId === v.id);
      if (ex) return ex.cantidad >= ex.stock ? prev : prev.map((i) => (i.varianteId === v.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      return [...prev, { varianteId: v.id, producto: p.nombre, talle: v.talle, color: v.color, precio: v.precio, cantidad: 1, stock: v.stock, requiereAjuste: false }];
    });
  }
  const cambiar = (id: string, d: number) => setCart((prev) => prev.flatMap((i) => {
    if (i.varianteId !== id) return [i];
    const c = Math.max(0, Math.min(i.stock, i.cantidad + d));
    return c === 0 ? [] : [{ ...i, cantidad: c }];
  }));
  function quitar(id: string) {
    const idx = cart.findIndex((i) => i.varianteId === id);
    setCart((prev) => prev.filter((i) => i.varianteId !== id));
    // Los descuentos referencian líneas por POSICIÓN: al quitar una, los que
    // apuntaban a ella dejan de existir y los de más abajo se corren.
    setDescuentos((prev) => prev.flatMap((d) => {
      if (d.indiceLinea == null) return [d];
      if (d.indiceLinea === idx) return [];
      return [{ ...d, indiceLinea: d.indiceLinea > idx ? d.indiceLinea - 1 : d.indiceLinea }];
    }));
  }
  const toggleAjuste = (id: string) => setCart((prev) => prev.map((i) => (i.varianteId === id ? { ...i, requiereAjuste: !i.requiereAjuste } : i)));

  return (
    <>
      {/* Top app bar */}
      <header className="h-20 flex-shrink-0 flex items-center gap-4 px-8 bg-surface-container-lowest border-b border-outline-variant/10">
        <div className="relative flex-1 max-w-xl">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-xl" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
            placeholder="Buscar por nombre, SKU o código de barras…"
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded pl-10 pr-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" />
        </div>
        {isFetching && <span className="text-xs text-on-surface-variant">buscando…</span>}
        <div className="ml-auto flex items-center gap-3">
          <Sel value={sucursalId} onChange={(v) => { setSucursalId(v); const s = ctx?.sucursales.find((x) => x.id === v); setCajaId(s?.cajas[0]?.id ?? ''); }}
            options={ctx?.sucursales.map((s) => ({ v: s.id, t: s.nombre })) ?? []} icon="storefront" />
          <Sel value={cajaId} onChange={setCajaId} options={sucursal?.cajas.map((c) => ({ v: c.id, t: c.nombre })) ?? []} icon="point_of_sale" />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Catálogo */}
        <section className="flex-1 overflow-y-auto p-6">
          <h2 className="font-display text-xl text-on-surface mb-4">Catálogo</h2>
          <div className="space-y-2">
            {productos.map((p) => (
              <div key={p.id} className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg overflow-hidden">
                <button onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container-low transition-colors text-left">
                  <div>
                    <div className="font-display text-lg text-on-surface">{p.nombre}</div>
                    <div className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5">
                      <span className="uppercase tracking-wide">{p.marca}</span><span>·</span><span>{p.categoria}</span>
                      {p.variantes.some((v) => v.esConsignacion) && (
                        <span className="px-1.5 py-0.5 rounded bg-gold-wash text-tertiary-container text-[10px] uppercase tracking-wide">consignación</span>
                      )}
                    </div>
                  </div>
                  <Icon name={expandido === p.id ? 'expand_less' : 'expand_more'} className="text-outline" />
                </button>
                {expandido === p.id && (
                  <div className="px-4 pb-4 flex flex-wrap gap-1.5">
                    {p.variantes.map((v) => (
                      <button key={v.id} disabled={v.stock <= 0} onClick={() => agregar(p, v)}
                        title={`${v.color} · ${pesos(v.precio)} · stock ${v.stock}`}
                        className={`text-xs rounded px-2.5 py-1.5 border transition-colors flex items-center gap-1.5 ${
                          v.stock <= 0 ? 'border-outline-variant/20 text-outline-variant line-through cursor-not-allowed'
                            : 'border-outline-variant/40 hover:border-primary hover:bg-surface-container-low text-on-surface'}`}>
                        <span className="font-semibold">{v.talle}</span>
                        <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ backgroundColor: v.colorHex ?? '#ccc' }} />
                        <span className="text-on-surface-variant">{v.stock}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {productos.length === 0 && <div className="text-sm text-on-surface-variant py-10 text-center">Sin resultados. Buscá un producto arriba.</div>}
          </div>
        </section>

        {/* Checkout */}
        <section className="w-[400px] flex-shrink-0 bg-surface-container-lowest border-l border-outline-variant/10 flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.02)]">
          <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
            <h2 className="font-display text-xl text-on-surface">Ticket</h2>
            <span className="text-xs uppercase tracking-wide text-on-surface-variant">{items} art.</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cart.length === 0 && (
              <div className="text-sm text-on-surface-variant py-10 text-center flex flex-col items-center gap-2">
                <Icon name="shopping_cart" className="text-3xl text-outline-variant" />Agregá productos desde el catálogo.
              </div>
            )}
            {cart.map((i) => (
              <div key={i.varianteId} className={`bg-surface-container-low border border-outline-variant/10 rounded p-3 ${i.requiereAjuste ? 'border-l-2 border-l-gold' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-on-surface leading-tight truncate">{i.producto}</div>
                    <div className="flex gap-1 mt-1">
                      <Tag>{i.talle}</Tag><Tag>{i.color}</Tag>
                    </div>
                    {i.requiereAjuste && (
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-on-tertiary-container">
                        <Icon name="design_services" className="text-sm" />Ajuste · entrega diferida
                      </div>
                    )}
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="font-display text-lg text-on-surface">{pesos(Number(i.precio) * i.cantidad)}</div>
                    <div className="text-[11px] text-on-surface-variant">{pesos(i.precio)} c/u</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center border border-outline-variant/30 rounded">
                    <button onClick={() => cambiar(i.varianteId, -1)} className="px-2 text-on-surface-variant hover:bg-surface-container-high">−</button>
                    <span className="px-2 text-sm w-6 text-center">{i.cantidad}</span>
                    <button onClick={() => cambiar(i.varianteId, 1)} disabled={i.cantidad >= i.stock} className="px-2 text-on-surface-variant hover:bg-surface-container-high disabled:text-outline-variant">+</button>
                  </div>
                  <button onClick={() => toggleAjuste(i.varianteId)} title="Ajuste de prenda"
                    className={`p-1.5 rounded transition-colors ${i.requiereAjuste ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
                    <Icon name="content_cut" className="text-base" />
                  </button>
                  <button onClick={() => quitar(i.varianteId)} title="Quitar" className="p-1.5 rounded text-on-surface-variant hover:text-error transition-colors ml-auto">
                    <Icon name="delete" className="text-base" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {hayAjuste && (
            <div className="px-6 py-2 bg-gold-wash/30 border-t border-gold/20 flex items-center gap-2 text-[11px] text-on-surface">
              <Icon name="info" className="text-on-tertiary-container text-base" />
              Contiene ajustes: quedará <strong className="mx-1">vendido sin entregar</strong>.
            </div>
          )}

          <div className="px-6 py-4 border-t border-outline-variant/10">
            <div className="flex justify-between text-sm text-on-surface-variant mb-1"><span>Subtotal</span><span>{pesos(subtotal)}</span></div>
            <div className={`flex justify-between text-sm mb-3 ${totalDescuentos > 0 ? 'text-on-tertiary-container font-semibold' : 'text-on-surface-variant'}`}>
              <span>Descuentos</span><span>{totalDescuentos > 0 ? `− ${pesos(totalDescuentos)}` : '$ 0'}</span>
            </div>
            {descuentos.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1">
                {descuentos.map((d, k) => (
                  <li key={k} className="flex items-center justify-between gap-2 text-[11px] bg-surface-container-low border border-outline-variant/20 rounded px-2 py-1">
                    <span className="truncate">
                      {nombreDesc(d.descuentoId)}
                      <span className="text-outline"> · {d.indiceLinea == null ? 'ticket' : `línea ${d.indiceLinea + 1}`}</span>
                    </span>
                    <button onClick={() => setDescuentos((prev) => prev.filter((_, j) => j !== k))} className="text-outline hover:text-error">
                      <Icon name="close" className="text-sm" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {errorPreview && (
              <p className="mb-3 text-[11px] bg-error-container text-on-error-container rounded px-2 py-1.5">
                {(errorPreview as Error).message}
              </p>
            )}
            <div className="flex justify-between items-end pt-3 border-t border-outline-variant/10">
              <span className="font-display text-lg">Total</span>
              <span className="font-display text-3xl text-primary">{pesos(total)}</span>
            </div>
            {reintegros.length > 0 && (
              <div className="mt-3 text-[11px] bg-gold-wash/40 border border-gold/20 rounded px-2.5 py-2 flex items-start gap-1.5">
                <Icon name="account_balance" className="text-on-tertiary-container text-sm mt-px" />
                <span>
                  Reintegro bancario de <strong>{pesos(reintegros.reduce((a, r) => a + Number(r.monto), 0))}</strong>.
                  No baja el total: lo devuelve el banco después.
                </span>
              </div>
            )}
          </div>

          <div className="px-6 pb-3">
            <h3 className="text-xs uppercase tracking-wider text-on-surface-variant mb-2">Medio de pago</h3>
            <div className="grid grid-cols-3 gap-2">
              {MEDIOS.map((m) => (
                <button key={m.id} onClick={() => setMedio(m.id)}
                  className={`p-2.5 border rounded flex flex-col items-center gap-1 transition-all ${
                    medio === m.id ? 'border-primary bg-surface-container-high' : 'border-outline-variant/30 bg-surface-container-low hover:border-outline'}`}>
                  <Icon name={m.icon} className="text-primary" />
                  <span className="text-[11px] font-semibold text-center leading-tight">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 pt-2 border-t border-outline-variant/10">
            <button disabled={cart.length === 0} onClick={() => setModalDesc(true)}
              className="w-full py-2.5 mb-2 border border-primary text-primary rounded uppercase tracking-wider text-sm font-semibold hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Aplicar descuento
            </button>
            <button disabled={cart.length === 0 || confirmar.isPending || !cajaId || !puedeCobrar} onClick={() => confirmar.mutate()}
              className="w-full py-3.5 bg-primary text-on-primary rounded uppercase tracking-wider text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">
              {confirmar.isPending ? 'Finalizando…' : 'Finalizar venta'}
            </button>
            {!puedeCobrar && (
              <p className="text-[11px] text-on-surface-variant mt-2 text-center">
                Armás el ticket; el <strong>cobro lo cierra un Cajero</strong>.
              </p>
            )}
          </div>
        </section>
      </div>

      {modalDesc && (
        <ModalDescuentos
          catalogo={catalogoDesc}
          lineas={cart.map((i, k) => ({ indice: k, texto: `${i.producto} · ${i.talle} ${i.color}` }))}
          puedeAutorizar={puedeAutorizar}
          usuarioId={user.id}
          onCerrar={() => setModalDesc(false)}
          onAplicar={(d) => { setDescuentos((prev) => [...prev, d]); setModalDesc(false); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-6 py-3 rounded-lg shadow-xl text-sm flex items-center gap-2 z-50">
          <Icon name="check_circle" className="text-gold" />{toast}
        </div>
      )}
    </>
  );
}

function Sel({ value, onChange, options, icon }: { value: string; onChange: (v: string) => void; options: { v: string; t: string }[]; icon: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/30 rounded px-2">
      <Icon name={icon} className="text-outline text-lg" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent py-2 pr-1 text-sm focus:outline-none">
        {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 bg-surface-container border border-outline-variant/20 rounded text-[11px] font-semibold">{children}</span>;
}

/**
 * Elegir un descuento y a qué se aplica.
 *
 * Los que exigen autorización solo los puede aplicar quien tiene el permiso, y
 * quedan registrados a su nombre. Un cajero ve el descuento pero no lo puede
 * usar: tiene que venir un encargado, que es exactamente la regla del mostrador.
 */
function ModalDescuentos({ catalogo, lineas, puedeAutorizar, usuarioId, onCerrar, onAplicar }: {
  catalogo: DescuentoDTO[];
  lineas: { indice: number; texto: string }[];
  puedeAutorizar: boolean;
  usuarioId: string;
  onCerrar: () => void;
  onAplicar: (d: DescuentoPedidoDTO) => void;
}) {
  const [sel, setSel] = useState<DescuentoDTO | null>(null);
  const [destino, setDestino] = useState<'ticket' | number>('ticket');

  const bloqueado = !!sel?.requiereAutorizacion && !puedeAutorizar;
  // El combo se aplica sobre una línea (cuenta unidades del mismo artículo) y el
  // reintegro sobre el ticket: no tiene sentido pedir el destino.
  const destinoFijo = sel?.soloLinea ? 'linea' : sel?.esReintegro ? 'ticket' : null;

  return (
    <div className="fixed inset-0 bg-primary/40 grid place-items-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
          <h3 className="font-display text-xl text-primary">Aplicar descuento</h3>
          <button onClick={onCerrar} className="text-outline"><Icon name="close" /></button>
        </div>

        <div className="p-6 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-col gap-2">
            {catalogo.map((d) => {
              const noPuede = d.requiereAutorizacion && !puedeAutorizar;
              return (
                <button key={d.id} onClick={() => { setSel(d); setDestino(d.soloLinea ? 0 : 'ticket'); }} disabled={noPuede}
                  className={`text-left border rounded-lg px-4 py-3 transition-colors ${
                    sel?.id === d.id ? 'border-primary bg-surface-container-high'
                      : noPuede ? 'border-outline-variant/20 opacity-50 cursor-not-allowed'
                        : 'border-outline-variant/30 hover:border-outline'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{d.nombre}</span>
                    {d.esReintegro && <span className="text-[10px] uppercase tracking-wide bg-gold-wash text-on-tertiary-container px-1.5 py-0.5 rounded">reintegro</span>}
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {d.esReintegro ? 'No baja el total: lo devuelve el banco.' : d.soloLinea ? 'Se aplica a una línea.' : 'Línea o ticket.'}
                    {d.requiereAutorizacion && (noPuede ? ' · Requiere un encargado.' : ' · Lo autorizás vos.')}
                  </p>
                </button>
              );
            })}
          </div>

          {sel && !destinoFijo && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-on-surface-variant mb-2">Aplicar a</h4>
              <select value={String(destino)} onChange={(e) => setDestino(e.target.value === 'ticket' ? 'ticket' : Number(e.target.value))}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none">
                <option value="ticket">Todo el ticket</option>
                {lineas.map((l) => <option key={l.indice} value={l.indice}>{l.texto}</option>)}
              </select>
            </div>
          )}

          {sel?.soloLinea && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-on-surface-variant mb-2">Línea</h4>
              <select value={String(destino)} onChange={(e) => setDestino(Number(e.target.value))}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none">
                {lineas.map((l) => <option key={l.indice} value={l.indice}>{l.texto}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline-variant/10">
          <button
            disabled={!sel || bloqueado}
            onClick={() => sel && onAplicar({
              descuentoId: sel.id,
              ...(sel.esReintegro || destino === 'ticket' ? {} : { indiceLinea: Number(destino) }),
              ...(sel.requiereAutorizacion ? { autorizadoPor: usuarioId } : {}),
            })}
            className="w-full py-2.5 bg-primary text-on-primary rounded text-sm font-semibold disabled:opacity-40">
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
