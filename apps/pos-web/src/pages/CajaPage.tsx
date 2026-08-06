import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, pesos, type CajaEstadoDTO } from '../api';
import { useUser } from '../lib/user';
import { Icon } from '../ui/Icon';

const ETIQUETA_MOV: Record<string, { texto: string; icono: string; signo: '+' | '−' }> = {
  VENTA: { texto: 'Cobro de venta', icono: 'point_of_sale', signo: '+' },
  INGRESO_MANUAL: { texto: 'Ingreso manual', icono: 'add_circle', signo: '+' },
  RETIRO: { texto: 'Retiro', icono: 'arrow_circle_up', signo: '−' },
  GASTO: { texto: 'Gasto', icono: 'receipt', signo: '−' },
};

/** Pesos -> centavos. La UI habla en pesos; el sistema, siempre en centavos. */
function aCentavos(pesosTexto: string): number {
  const n = Number(pesosTexto.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function CajaPage() {
  const user = useUser();
  const qc = useQueryClient();
  const puedeOperar = user.permisos.includes('caja.operar');

  const { data: ctx } = useQuery({ queryKey: ['contexto'], queryFn: api.contexto });
  const [sucursalId, setSucursalId] = useState(user.sucursalIdPrincipal);
  const sucursal = ctx?.sucursales.find((s) => s.id === sucursalId);
  const [cajaId, setCajaId] = useState<string>('');
  const cajaActual = cajaId || sucursal?.cajas[0]?.id || '';

  const { data: estado, isFetching } = useQuery({
    queryKey: ['caja', cajaActual],
    queryFn: () => api.cajaEstado(cajaActual),
    enabled: !!cajaActual,
  });

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'abrir' | 'movimiento' | 'cerrar' | null>(null);
  const [arqueo, setArqueo] = useState<Awaited<ReturnType<typeof api.cajaCerrar>> | null>(null);

  function ok(msg: string) {
    setToast(msg); setModal(null); setError(null);
    qc.invalidateQueries({ queryKey: ['caja'] });
    setTimeout(() => setToast(null), 4500);
  }
  const fallo = (e: unknown) => setError(e instanceof Error ? e.message : 'Algo salió mal.');

  const abrir = useMutation({ mutationFn: api.cajaAbrir, onSuccess: () => ok('Caja abierta.'), onError: fallo });
  const movimiento = useMutation({ mutationFn: api.cajaMovimiento, onSuccess: () => ok('Movimiento registrado.'), onError: fallo });
  const cerrar = useMutation({
    mutationFn: api.cajaCerrar,
    onSuccess: (r) => { setArqueo(r); ok(r.cuadra ? 'Caja cerrada: cuadra.' : 'Caja cerrada con diferencia.'); },
    onError: fallo,
  });

  const abierta = !!estado?.sesionCajaId;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-8 pt-8 pb-5 flex flex-wrap justify-between items-end gap-4 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div>
          <h1 className="font-display text-2xl text-primary">Control de Caja</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Apertura, movimientos de efectivo y cierre con arqueo. Lo electrónico se totaliza aparte: no está en el cajón.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/30 rounded px-2">
            <Icon name="storefront" className="text-outline text-lg" />
            <select
              value={sucursalId}
              onChange={(e) => { setSucursalId(e.target.value); setCajaId(''); }}
              className="bg-transparent py-2 pr-1 text-sm focus:outline-none"
            >
              {ctx?.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/30 rounded px-2">
            <Icon name="point_of_sale" className="text-outline text-lg" />
            <select value={cajaActual} onChange={(e) => setCajaId(e.target.value)} className="bg-transparent py-2 pr-1 text-sm focus:outline-none">
              {sucursal?.cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {!cajaActual && <p className="text-on-surface-variant text-sm">Esta sucursal no tiene cajas configuradas.</p>}

        {cajaActual && !abierta && (
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-10 text-center max-w-lg mx-auto">
            <Icon name="lock" className="text-5xl text-outline" />
            <h2 className="font-display text-xl text-primary mt-3">La caja está cerrada</h2>
            <p className="text-on-surface-variant text-sm mt-2">
              No se puede vender con la caja cerrada: un cobro que no cae en una sesión no aparece en ningún arqueo.
            </p>
            {puedeOperar && (
              <button onClick={() => { setError(null); setModal('abrir'); }} className="mt-6 bg-primary text-on-primary px-6 py-2.5 rounded-lg text-sm font-semibold">
                Abrir caja
              </button>
            )}
          </div>
        )}

        {cajaActual && abierta && estado && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Tarjeta titulo="Fondo inicial" valor={pesos(estado.fondoInicial!)} icono="savings" />
              <Tarjeta titulo="Efectivo esperado en el cajón" valor={pesos(estado.efectivoEsperado!)} icono="payments" destacada />
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-on-surface">
                  <Icon name="credit_card" className="text-outline text-lg" /> Cobrado por medio
                </div>
                {Object.keys(estado.totalesPorMedio ?? {}).length === 0
                  ? <p className="text-sm text-on-surface-variant">Todavía no hay cobros en este turno.</p>
                  : (
                    <ul className="text-sm flex flex-col gap-1.5">
                      {Object.entries(estado.totalesPorMedio!).map(([medio, monto]) => (
                        <li key={medio} className="flex justify-between">
                          <span className="text-on-surface-variant">{medio}</span>
                          <span className="font-semibold">{pesos(monto)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                <p className="text-xs text-outline mt-3">Los medios electrónicos se concilian aparte contra la liquidación del procesador.</p>
              </div>
            </div>

            {puedeOperar && (
              <div className="flex flex-wrap gap-3">
                <button onClick={() => { setError(null); setModal('movimiento'); }} className="bg-surface-container-low border border-outline-variant/30 px-5 py-2.5 rounded-lg text-sm flex items-center gap-2">
                  <Icon name="swap_vert" className="text-lg" /> Registrar movimiento
                </button>
                <button onClick={() => { setError(null); setArqueo(null); setModal('cerrar'); }} className="bg-primary text-on-primary px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
                  <Icon name="lock" className="text-lg" /> Cerrar caja y arquear
                </button>
              </div>
            )}

            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
                <h2 className="font-display text-xl text-primary">Movimientos del turno</h2>
                {isFetching && <span className="text-xs text-outline">actualizando…</span>}
              </div>
              {(estado.movimientos ?? []).length === 0
                ? <p className="px-6 py-8 text-sm text-on-surface-variant">Sin movimientos todavía.</p>
                : (
                  <ul className="divide-y divide-outline-variant/10">
                    {estado.movimientos!.map((m) => {
                      const et = ETIQUETA_MOV[m.tipo] ?? { texto: m.tipo, icono: 'circle', signo: '+' as const };
                      return (
                        <li key={m.id} className="px-6 py-3 flex items-center gap-4 text-sm">
                          <Icon name={et.icono} className="text-outline text-lg" />
                          <div className="flex-1 min-w-0">
                            <p className="text-on-surface">{et.texto}</p>
                            <p className="text-xs text-outline">
                              {new Date(m.fechaHora).toLocaleString('es-AR')} · {m.medio}
                            </p>
                          </div>
                          <span className={`font-semibold ${et.signo === '−' ? 'text-on-error-container' : 'text-on-surface'}`}>
                            {et.signo} {pesos(m.monto)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>
          </div>
        )}
      </div>

      {modal === 'abrir' && (
        <Modal titulo="Abrir caja" onCerrar={() => setModal(null)} error={error}>
          <FormMonto
            etiqueta="Fondo inicial (pesos)"
            ayuda="El efectivo con el que arranca el cajón. Puede ser cero."
            confirmar="Abrir caja"
            pendiente={abrir.isPending}
            onConfirmar={(centavos) => abrir.mutate({ cajaId: cajaActual, sucursalId, fondoInicial: centavos })}
          />
        </Modal>
      )}

      {modal === 'movimiento' && estado?.sesionCajaId && (
        <Modal titulo="Movimiento de efectivo" onCerrar={() => setModal(null)} error={error}>
          <FormMovimiento
            pendiente={movimiento.isPending}
            onConfirmar={(tipo, centavos, motivo) =>
              movimiento.mutate({ sesionCajaId: estado.sesionCajaId!, sucursalId, tipo, monto: centavos, motivo })}
          />
        </Modal>
      )}

      {modal === 'cerrar' && estado?.sesionCajaId && (
        <Modal titulo="Cerrar caja y arquear" onCerrar={() => setModal(null)} error={error}>
          <p className="text-sm text-on-surface-variant mb-4">
            Contá el efectivo del cajón y anotá el total. El sistema espera{' '}
            <strong className="text-on-surface">{pesos(estado.efectivoEsperado!)}</strong>, pero no lo mostramos como
            sugerencia: el arqueo sirve si se cuenta primero.
          </p>
          <FormMonto
            etiqueta="Efectivo contado (pesos)"
            ayuda="Lo que hay realmente en el cajón."
            confirmar="Cerrar caja"
            pendiente={cerrar.isPending}
            onConfirmar={(centavos) => cerrar.mutate({ sesionCajaId: estado.sesionCajaId!, sucursalId, totalContado: centavos })}
          />
        </Modal>
      )}

      {arqueo && (
        <Modal titulo="Arqueo" onCerrar={() => setArqueo(null)}>
          <div className="flex flex-col gap-2 text-sm">
            <Fila etiqueta="Esperado" valor={pesos(arqueo.totalEsperado)} />
            <Fila etiqueta="Contado" valor={pesos(arqueo.totalContado)} />
            <div className={`mt-2 p-4 rounded-lg ${arqueo.cuadra ? 'bg-primary-fixed' : 'bg-error-container'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Diferencia</span>
                <span className="font-display text-xl">{pesos(arqueo.diferencia)}</span>
              </div>
              <p className="text-xs mt-1 opacity-80">
                {arqueo.cuadra
                  ? 'La caja cuadra.'
                  : Number(arqueo.diferencia) < 0
                    ? 'Falta efectivo en el cajón.'
                    : 'Sobra efectivo en el cajón.'}
              </p>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-6 py-3 rounded-lg shadow-xl text-sm flex items-center gap-2 z-50">
          <Icon name="check_circle" className="text-lg" /> {toast}
        </div>
      )}
    </div>
  );
}

// --- Piezas ------------------------------------------------------------------

function Tarjeta({ titulo, valor, icono, destacada }: { titulo: string; valor: string; icono: string; destacada?: boolean }) {
  return (
    <div className={`border rounded-xl p-6 ${destacada ? 'bg-primary-fixed border-transparent' : 'bg-surface-container-lowest border-outline-variant/10'}`}>
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Icon name={icono} className="text-outline text-lg" /> {titulo}
      </div>
      <p className="font-display text-2xl text-primary mt-2 leading-tight">{valor}</p>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-on-surface-variant">{etiqueta}</span>
      <span className="font-semibold">{valor}</span>
    </div>
  );
}

function Modal({ titulo, children, onCerrar, error }: { titulo: string; children: React.ReactNode; onCerrar: () => void; error?: string | null }) {
  return (
    <div className="fixed inset-0 bg-primary/40 grid place-items-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
          <h3 className="font-display text-xl text-primary">{titulo}</h3>
          <button onClick={onCerrar} className="text-outline"><Icon name="close" /></button>
        </div>
        <div className="p-6">
          {error && (
            <p className="mb-4 text-sm bg-error-container text-on-error-container rounded-lg px-4 py-3">{error}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function FormMonto({ etiqueta, ayuda, confirmar, pendiente, onConfirmar }: {
  etiqueta: string; ayuda: string; confirmar: string; pendiente: boolean;
  onConfirmar: (centavos: number) => void;
}) {
  const [texto, setTexto] = useState('');
  const centavos = aCentavos(texto);
  const valido = texto.trim() !== '' && Number.isFinite(centavos) && centavos >= 0;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valido) onConfirmar(centavos); }} className="flex flex-col gap-3">
      <label className="text-sm text-on-surface-variant">{etiqueta}</label>
      <input
        autoFocus inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder="0,00"
        className="bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2.5 text-lg font-display focus:outline-none"
      />
      <p className="text-xs text-outline">{ayuda}</p>
      <button type="submit" disabled={!valido || pendiente} className="mt-2 bg-primary text-on-primary py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40">
        {pendiente ? 'Guardando…' : confirmar}
      </button>
    </form>
  );
}

function FormMovimiento({ pendiente, onConfirmar }: {
  pendiente: boolean;
  onConfirmar: (tipo: 'RETIRO' | 'GASTO' | 'INGRESO_MANUAL', centavos: number, motivo: string) => void;
}) {
  const [tipo, setTipo] = useState<'RETIRO' | 'GASTO' | 'INGRESO_MANUAL'>('RETIRO');
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const centavos = aCentavos(texto);
  const valido = Number.isFinite(centavos) && centavos > 0 && motivo.trim() !== '';
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valido) onConfirmar(tipo, centavos, motivo.trim()); }} className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {([['RETIRO', 'Retiro'], ['GASTO', 'Gasto'], ['INGRESO_MANUAL', 'Ingreso']] as const).map(([v, t]) => (
          <button
            key={v} type="button" onClick={() => setTipo(v)}
            className={`py-2 rounded-lg text-sm border ${tipo === v ? 'bg-primary text-on-primary border-transparent' : 'bg-surface-container-low border-outline-variant/30'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <input
        autoFocus inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Monto en pesos"
        className="bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2.5 text-lg font-display focus:outline-none"
      />
      <input
        value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obligatorio)"
        className="bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2.5 text-sm focus:outline-none"
      />
      <p className="text-xs text-outline">Todo movimiento necesita motivo: sin él no se puede auditar después.</p>
      <button type="submit" disabled={!valido || pendiente} className="mt-2 bg-primary text-on-primary py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40">
        {pendiente ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  );
}
