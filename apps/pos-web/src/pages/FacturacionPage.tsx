import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, pesos, type ComprobanteDTO } from '../api';
import { useUser } from '../lib/user';
import { Icon } from '../ui/Icon';

const ESTADO: Record<string, { texto: string; clase: string; icono: string }> = {
  PENDIENTE: { texto: 'Esperando CAE', clase: 'bg-gold-wash text-on-tertiary-container', icono: 'schedule' },
  OBTENIDO: { texto: 'Con CAE', clase: 'bg-primary-fixed text-primary', icono: 'verified' },
  RECHAZADO: { texto: 'Rechazado', clase: 'bg-error-container text-on-error-container', icono: 'error' },
};

export function FacturacionPage() {
  const user = useUser();
  const qc = useQueryClient();
  const { data: ctx } = useQuery({ queryKey: ['contexto'], queryFn: api.contexto });
  const [sucursalId, setSucursalId] = useState(user.sucursalIdPrincipal);
  const [vista, setVista] = useState<'comprobantes' | 'libro'>('comprobantes');

  const { data, isFetching } = useQuery({
    queryKey: ['comprobantes', sucursalId],
    queryFn: () => api.comprobantes(sucursalId),
    refetchInterval: 8000, // la cola se resuelve sola: se ve avanzar
  });
  const { data: libro } = useQuery({
    queryKey: ['libro-iva', sucursalId], queryFn: () => api.libroIva(sucursalId), enabled: vista === 'libro',
  });

  const procesar = useMutation({
    mutationFn: api.procesarCola,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comprobantes'] }); qc.invalidateQueries({ queryKey: ['libro-iva'] }); },
  });

  const resumen = data?.resumen;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-8 pt-8 pb-5 flex flex-wrap justify-between items-end gap-4 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div>
          <h1 className="font-display text-2xl text-primary">Facturación</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            La venta no espera al CAE: se cierra con ticket no fiscal y el comprobante se encola.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/30 rounded px-2">
            <Icon name="storefront" className="text-outline text-lg" />
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className="bg-transparent py-2 pr-1 text-sm focus:outline-none">
              {ctx?.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <button onClick={() => procesar.mutate()} disabled={procesar.isPending}
            className="bg-surface-container-low border border-outline-variant/30 px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-50">
            <Icon name="sync" className="text-lg" />{procesar.isPending ? 'Procesando…' : 'Procesar cola'}
          </button>
        </div>
      </header>

      <div className="px-8 pt-5">
        <div className="inline-flex bg-surface-container-low border border-outline-variant/30 rounded-lg p-0.5">
          {(['comprobantes', 'libro'] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${vista === v ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant'}`}>
              {v === 'comprobantes' ? 'Comprobantes' : 'Libro IVA ventas'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pt-4 flex flex-col gap-6">
        {resumen && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi titulo="Con CAE" valor={String(resumen.obtenidos)} icono="verified" />
            <Kpi titulo="En cola" valor={String(resumen.pendientes)} icono="schedule" alerta={resumen.pendientes > 0} />
            <Kpi titulo="Rechazados" valor={String(resumen.rechazados)} icono="error" error={resumen.rechazados > 0} />
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <Icon name="request_quote" className="text-outline text-lg" /> Facturado
              </div>
              <p className="font-display text-xl text-primary mt-1.5 leading-tight">{pesos(resumen.facturado.total)}</p>
              <p className="text-[11px] text-outline mt-0.5">
                neto {pesos(resumen.facturado.neto)} · IVA {pesos(resumen.facturado.iva)}
              </p>
            </div>
          </div>
        )}

        {vista === 'comprobantes' && (
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <h2 className="font-display text-xl text-primary">Comprobantes</h2>
              {isFetching && <span className="text-xs text-outline">actualizando…</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/10">
                  <tr>
                    <Th>Comprobante</Th><Th>Receptor</Th><Th right>Neto</Th><Th right>IVA</Th><Th right>Total</Th><Th>Estado</Th><Th>CAE</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {(data?.items ?? []).map((c) => <Fila key={c.id} c={c} />)}
                  {(data?.items ?? []).length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">Todavía no hay comprobantes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {vista === 'libro' && libro && (
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10">
              <h2 className="font-display text-xl text-primary">Libro IVA ventas</h2>
              <p className="text-xs text-outline mt-0.5">
                Del {new Date(libro.desde).toLocaleDateString('es-AR')} al {new Date(libro.hasta).toLocaleDateString('es-AR')}.
                Solo comprobantes con CAE: los pendientes todavía no existen fiscalmente.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/10">
                  <tr><Th>Fecha</Th><Th>Tipo</Th><Th>Comprobante</Th><Th>Receptor</Th><Th>CUIT</Th><Th right>Neto</Th><Th right>IVA</Th><Th right>Total</Th></tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {libro.lineas.map((l, k) => (
                    <tr key={k} className="hover:bg-surface-container-low">
                      <Td>{new Date(l.fecha).toLocaleDateString('es-AR')}</Td>
                      <Td>{l.tipo.replace('FACTURA_', 'Factura ')}</Td>
                      <Td mono>{l.comprobante}</Td>
                      <Td>{l.receptor}</Td>
                      <Td mono>{l.cuit ?? '—'}</Td>
                      <Td right>{pesos(l.neto)}</Td>
                      <Td right>{pesos(l.iva)}</Td>
                      <Td right>{pesos(l.total)}</Td>
                    </tr>
                  ))}
                  {libro.lineas.length === 0 && (
                    <tr><td colSpan={8} className="px-6 py-10 text-center text-on-surface-variant">Sin comprobantes con CAE en el período.</td></tr>
                  )}
                </tbody>
                {libro.lineas.length > 0 && (
                  <tfoot className="border-t-2 border-outline-variant/20 font-semibold">
                    <tr>
                      <Td colSpan={5}>Totales</Td>
                      <Td right>{pesos(libro.totales.neto)}</Td>
                      <Td right>{pesos(libro.totales.iva)}</Td>
                      <Td right>{pesos(libro.totales.total)}</Td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-outline">
          <Icon name="info" className="text-sm align-text-bottom" /> Los CAE de esta instalación los emite un
          adaptador <strong>simulado</strong>: no valen ante ARCA. El intermediario real se conecta cambiando ese
          adaptador, sin tocar el resto del sistema (ADR-0005).
        </p>
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, icono, alerta, error }: { titulo: string; valor: string; icono: string; alerta?: boolean; error?: boolean }) {
  return (
    <div className={`border rounded-xl p-5 ${error ? 'bg-error-container border-transparent' : alerta ? 'bg-gold-wash/50 border-gold/20' : 'bg-surface-container-lowest border-outline-variant/10'}`}>
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Icon name={icono} className="text-outline text-lg" /> {titulo}
      </div>
      <p className="font-display text-2xl text-primary mt-1.5 leading-tight">{valor}</p>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-2.5 font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, mono, colSpan }: { children: React.ReactNode; right?: boolean; mono?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-4 py-2.5 ${right ? 'text-right' : ''} ${mono ? 'font-mono text-xs' : ''}`}>{children}</td>;
}

function Fila({ c }: { c: ComprobanteDTO }) {
  const e = ESTADO[c.estadoCae] ?? ESTADO['PENDIENTE']!;
  return (
    <tr className="hover:bg-surface-container-low">
      <Td>
        <span className="font-mono text-xs">{c.etiqueta}</span>
        <span className="block text-[11px] text-outline">{c.tipo.replace('FACTURA_', 'Factura ')}</span>
      </Td>
      <Td>{c.cliente ?? 'Consumidor Final'}</Td>
      <Td right>{pesos(c.neto)}</Td>
      <Td right>{pesos(c.iva)}</Td>
      <Td right><strong>{pesos(c.total)}</strong></Td>
      <Td>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${e.clase}`}>
          <Icon name={e.icono} className="text-sm" />{e.texto}
        </span>
        {c.estadoCae === 'PENDIENTE' && c.intentos > 0 && (
          <span className="block text-[11px] text-outline mt-0.5">{c.intentos} intento(s)</span>
        )}
        {c.error && <span className="block text-[11px] text-on-error-container mt-0.5">{c.error}</span>}
      </Td>
      <Td mono>{c.cae ?? '—'}</Td>
    </tr>
  );
}
