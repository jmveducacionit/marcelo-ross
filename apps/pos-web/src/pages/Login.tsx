import { useState } from 'react';
import { api, type Usuario } from '../api';
import { Icon } from '../ui/Icon';

export function Login({ onLogged }: { onLogged: (u: Usuario) => void }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setCargando(true);
    try { onLogged(await api.login(usuario.trim(), password)); }
    catch (err) { setError((err as Error).message); }
    finally { setCargando(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-primary p-4">
      <form onSubmit={enviar} className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="bg-primary text-on-primary px-8 py-8 flex flex-col items-center gap-3 border-b-2 border-gold">
          <div className="w-14 h-14 rounded-full border border-gold/40 grid place-items-center">
            <Icon name="storefront" className="text-3xl text-gold" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-wide">Marcelo Ross</h1>
            <p className="text-[11px] uppercase tracking-[0.15em] text-on-primary-container mt-1">Heritage Ledger · POS</p>
          </div>
        </div>
        <div className="p-8">
          <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Usuario</label>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus autoComplete="username"
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded px-3 py-2.5 mb-4 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" />
          <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded px-3 py-2.5 mb-5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" />
          {error && (
            <div className="text-sm text-on-error-container bg-error-container rounded px-3 py-2 mb-4 flex items-center gap-2">
              <Icon name="error" className="text-base" /> {error}
            </div>
          )}
          <button type="submit" disabled={cargando || !usuario || !password}
            className="w-full bg-primary text-on-primary rounded py-3 font-semibold uppercase tracking-wider text-sm hover:opacity-90 disabled:opacity-40 transition-opacity">
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>
          <div className="mt-6 text-[11px] text-on-surface-variant border-t border-outline-variant/20 pt-3">
            <div className="font-semibold uppercase tracking-wider mb-1">Usuarios de demo</div>
            <div>admin · encargado · cajero · vendedor</div>
            <div>contraseña: <span className="font-mono text-on-surface">Rol.2026</span></div>
          </div>
        </div>
      </form>
    </div>
  );
}
