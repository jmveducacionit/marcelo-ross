import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, pesos, type ProductoDTO, type VarianteDTO, type Usuario } from './api';

interface CartItem {
  varianteId: string; producto: string; talle: string; color: string;
  precio: string; cantidad: number; stock: number; requiereAjuste: boolean;
}

const MEDIOS = ['EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'QR'];
const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Administrador', ENCARGADO: 'Encargado', CAJERO: 'Cajero',
  VENDEDOR: 'Vendedor', CONTADOR_RO: 'Contador',
};

/** Gate de autenticación: login o POS según haya sesión. */
export function App() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'], queryFn: api.me, retry: false,
  });

  if (me.isLoading) {
    return <div className="min-h-screen grid place-items-center bg-stone-100 text-stone-400">Cargando…</div>;
  }
  if (me.isError || !me.data) {
    return <Login onLogged={(u) => qc.setQueryData(['me'], u)} />;
  }
  return <Pos user={me.data} />;
}

// ---------------------------------------------------------------------------
function Login({ onLogged }: { onLogged: (u: Usuario) => void }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setCargando(true);
    try {
      const u = await api.login(usuario.trim(), password);
      onLogged(u);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-stone-900 p-4">
      <form onSubmit={enviar} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="font-bold text-xl tracking-wide">
            <span className="text-amber-500">MARCELO ROSS</span> HOMBRE
          </div>
          <div className="text-xs text-stone-400 mt-1">Punto de venta · iniciar sesión</div>
        </div>
        <label className="block text-sm text-stone-600 mb-1">Usuario</label>
        <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus autoComplete="username"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-amber-400" />
        <label className="block text-sm text-stone-600 mb-1">Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-400" />
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</div>}
        <button type="submit" disabled={cargando || !usuario || !password}
          className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-stone-300 text-white font-semibold rounded-lg py-2.5 transition">
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>
        <div className="mt-6 text-[11px] text-stone-400 border-t border-stone-100 pt-3">
          <div className="font-medium text-stone-500 mb-1">Usuarios de demo:</div>
          <div>admin · encargado · cajero · vendedor</div>
          <div>contraseña: <span className="font-mono">Rol.2026</span> (ej. <span className="font-mono">Admin.2026</span>)</div>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Pos({ user }: { user: Usuario }) {
  const qc = useQueryClient();
  const { data: ctx } = useQuery({ queryKey: ['contexto'], queryFn: api.contexto });

  const [sucursalId, setSucursalId] = useState(user.sucursalIdPrincipal);
  const [cajaId, setCajaId] = useState('');
  const [search, setSearch] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [medio, setMedio] = useState('EFECTIVO');
  const [toast, setToast] = useState<string | null>(null);

  const puedeCobrar = user.permisos.includes('ventas.cobrar');

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
  const { data: ventas = [] } = useQuery({ queryKey: ['ventas', sucursalId], queryFn: () => api.ventas(sucursalId), enabled: !!sucursalId });
  const { data: actividad = [] } = useQuery({ queryKey: ['actividad', sucursalId], queryFn: () => api.actividad(sucursalId), enabled: !!sucursalId });

  const total = useMemo(() => cart.reduce((s, i) => s + Number(i.precio) * i.cantidad, 0), [cart]);

  const confirmar = useMutation({
    mutationFn: () => api.confirmarVenta({
      sucursalId, cajaId,
      lineas: cart.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad, requiereAjuste: i.requiereAjuste })),
      pagos: [{ medio, monto: total }],
    }),
    onSuccess: (r) => {
      setToast(`Venta confirmada · ${pesos(r.total)} · ${r.estadoEntrega === 'PENDIENTE_AJUSTE' ? 'con ajuste (entrega diferida)' : 'entregada'}`);
      setCart([]);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['actividad'] });
      setTimeout(() => setToast(null), 4500);
    },
    onError: (e: Error) => { setToast(`Error: ${e.message}`); setTimeout(() => setToast(null), 4500); },
  });

  async function salir() {
    // Logout robusto: revoca la sesión en el server y recarga para volver al
    // login con estado limpio (evita races del cache de queries).
    try { await api.logout(); } finally { window.location.reload(); }
  }

  function agregar(p: ProductoDTO, v: VarianteDTO) {
    if (v.stock <= 0) return;
    setCart((prev) => {
      const ex = prev.find((i) => i.varianteId === v.id);
      if (ex) return ex.cantidad >= ex.stock ? prev : prev.map((i) => (i.varianteId === v.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      return [...prev, { varianteId: v.id, producto: p.nombre, talle: v.talle, color: v.color, precio: v.precio, cantidad: 1, stock: v.stock, requiereAjuste: false }];
    });
  }
  const cambiarCantidad = (id: string, delta: number) =>
    setCart((prev) => prev.flatMap((i) => {
      if (i.varianteId !== id) return [i];
      const c = Math.max(0, Math.min(i.stock, i.cantidad + delta));
      return c === 0 ? [] : [{ ...i, cantidad: c }];
    }));
  const toggleAjuste = (id: string) =>
    setCart((prev) => prev.map((i) => (i.varianteId === id ? { ...i, requiereAjuste: !i.requiereAjuste } : i)));

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="bg-stone-900 text-stone-100 px-5 py-3 flex flex-wrap items-center gap-4 shadow">
        <div className="font-semibold tracking-wide">
          <span className="text-amber-400">MARCELO ROSS</span> HOMBRE
          <span className="ml-2 text-xs text-stone-400 font-normal">· POS</span>
        </div>
        <div className="flex items-center gap-2 ml-auto text-sm">
          <Selector label="Sucursal" value={sucursalId} onChange={(v) => { setSucursalId(v); const s = ctx?.sucursales.find((x) => x.id === v); setCajaId(s?.cajas[0]?.id ?? ''); }}
            options={ctx?.sucursales.map((s) => ({ v: s.id, t: s.nombre })) ?? []} />
          <Selector label="Caja" value={cajaId} onChange={setCajaId} options={sucursal?.cajas.map((c) => ({ v: c.id, t: c.nombre })) ?? []} />
          <div className="flex items-center gap-2 pl-3 ml-1 border-l border-stone-700">
            <div className="text-right leading-tight">
              <div className="text-stone-100">{user.nombre}</div>
              <div className="text-[11px] text-amber-400">{ROL_LABEL[user.rol] ?? user.rol}</div>
            </div>
            <button onClick={salir} className="text-xs bg-stone-700 hover:bg-stone-600 rounded-md px-2 py-1">Salir</button>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_0.9fr] gap-4 p-4 max-w-[1500px] mx-auto">
        {/* Catálogo */}
        <section className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-stone-700">Catálogo</h2>
            {isFetching && <span className="text-xs text-stone-400">buscando…</span>}
          </div>
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre (ej. Camisa, Jean, Saco)…"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-amber-400" />
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {productos.map((p) => (
              <div key={p.id} className="border border-stone-200 rounded-lg">
                <button onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-stone-50 rounded-lg text-left">
                  <div>
                    <div className="font-medium text-stone-800">{p.nombre}</div>
                    <div className="text-xs text-stone-500">{p.marca} · {p.categoria}
                      {p.variantes.some((v) => v.esConsignacion) && <span className="ml-2 text-violet-600">consignación</span>}
                    </div>
                  </div>
                  <div className="text-stone-400 text-sm">{expandido === p.id ? '▲' : '▼'}</div>
                </button>
                {expandido === p.id && (
                  <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                    {p.variantes.map((v) => (
                      <button key={v.id} disabled={v.stock <= 0} onClick={() => agregar(p, v)}
                        title={`${v.color} · ${pesos(v.precio)} · stock ${v.stock}`}
                        className={`text-xs rounded-md px-2 py-1 border transition ${v.stock <= 0 ? 'border-stone-200 text-stone-300 cursor-not-allowed line-through' : 'border-stone-300 hover:border-amber-500 hover:bg-amber-50 text-stone-700'}`}>
                        <span className="font-semibold">{v.talle}</span>
                        <span className="mx-1 inline-block w-2 h-2 rounded-full align-middle" style={{ backgroundColor: v.colorHex ?? '#ccc', border: '1px solid #0002' }} />
                        <span className="text-stone-500">{v.stock}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {productos.length === 0 && <div className="text-sm text-stone-400 py-6 text-center">Sin resultados.</div>}
          </div>
        </section>

        {/* Ticket */}
        <section className="bg-white rounded-xl shadow-sm p-4 flex flex-col">
          <h2 className="font-semibold text-stone-700 mb-3">Ticket</h2>
          <div className="flex-1 space-y-2 min-h-[120px] max-h-[52vh] overflow-y-auto">
            {cart.length === 0 && <div className="text-sm text-stone-400 py-6 text-center">Agregá productos desde el catálogo.</div>}
            {cart.map((i) => (
              <div key={i.varianteId} className="border border-stone-200 rounded-lg p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium text-stone-800 leading-tight">{i.producto}</div>
                    <div className="text-xs text-stone-500">Talle {i.talle} · {i.color} · {pesos(i.precio)} c/u</div>
                  </div>
                  <div className="text-sm font-semibold text-stone-800 whitespace-nowrap">{pesos(Number(i.precio) * i.cantidad)}</div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center border border-stone-300 rounded-md">
                    <button onClick={() => cambiarCantidad(i.varianteId, -1)} className="px-2 text-stone-600 hover:bg-stone-100">−</button>
                    <span className="px-2 text-sm w-6 text-center">{i.cantidad}</span>
                    <button onClick={() => cambiarCantidad(i.varianteId, 1)} disabled={i.cantidad >= i.stock} className="px-2 text-stone-600 hover:bg-stone-100 disabled:text-stone-300">+</button>
                  </div>
                  <label className="text-xs text-stone-500 flex items-center gap-1 ml-auto cursor-pointer">
                    <input type="checkbox" checked={i.requiereAjuste} onChange={() => toggleAjuste(i.varianteId)} /> ajuste (ruedo/entalle)
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-stone-200 mt-3 pt-3">
            <div className="flex items-center justify-between text-lg font-semibold mb-3"><span>Total</span><span>{pesos(total)}</span></div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-stone-500">Pago</span>
              <select value={medio} onChange={(e) => setMedio(e.target.value)} className="border border-stone-300 rounded-md px-2 py-1 text-sm flex-1">
                {MEDIOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button disabled={cart.length === 0 || confirmar.isPending || !cajaId || !puedeCobrar}
              onClick={() => confirmar.mutate()}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-stone-300 text-white font-semibold rounded-lg py-2.5 transition">
              {confirmar.isPending ? 'Confirmando…' : 'Confirmar venta'}
            </button>
            {!puedeCobrar && (
              <div className="text-xs text-stone-500 mt-2 text-center">
                Tu rol ({ROL_LABEL[user.rol] ?? user.rol}) arma el ticket; el <b>cobro lo cierra un Cajero</b>.
              </div>
            )}
          </div>
        </section>

        {/* Actividad */}
        <section className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="font-semibold text-stone-700 mb-2">Últimas ventas</h2>
            <div className="space-y-1.5 max-h-[36vh] overflow-y-auto">
              {ventas.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm border-b border-stone-100 pb-1.5">
                  <div>
                    <div className="text-stone-700">{v.cliente} · {v.items} art.</div>
                    <div className="text-xs text-stone-400">{v.medios.join(', ')}{v.estadoEntrega === 'PENDIENTE_AJUSTE' && <span className="ml-1 text-amber-600">· ajuste</span>}</div>
                  </div>
                  <div className="font-semibold text-stone-800">{pesos(v.total)}</div>
                </div>
              ))}
              {ventas.length === 0 && <div className="text-sm text-stone-400 py-4 text-center">Todavía no hay ventas.</div>}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="font-semibold text-stone-700 mb-2">Actividad (eventos + auditoría)</h2>
            <div className="space-y-1 max-h-[30vh] overflow-y-auto text-xs">
              {actividad.map((a, k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${a.tipo === 'evento' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                  <span className="font-mono text-stone-700">{a.clave}</span>
                  <span className="ml-auto text-stone-300">{new Date(a.ocurridoEn).toLocaleTimeString('es-AR')}</span>
                </div>
              ))}
              {actividad.length === 0 && <div className="text-stone-400 py-4 text-center">Sin actividad.</div>}
            </div>
          </div>
        </section>
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-stone-900 text-white px-5 py-3 rounded-lg shadow-lg text-sm">{toast}</div>
      )}
    </div>
  );
}

function Selector({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { v: string; t: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-stone-400 text-xs">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-stone-800 border border-stone-700 rounded-md px-2 py-1 text-stone-100">
        {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </label>
  );
}
