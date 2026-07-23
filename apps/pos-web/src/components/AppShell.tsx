import { NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { api } from '../api';
import { useUser } from '../lib/user';

const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Administrador', ENCARGADO: 'Encargado', CAJERO: 'Cajero', VENDEDOR: 'Vendedor', CONTADOR_RO: 'Contador',
};

const NAV = [
  { to: '/ventas', icon: 'shopping_cart', label: 'Ventas' },
  { to: '/stock', icon: 'inventory_2', label: 'Stock' },
  { to: '/caja', icon: 'account_balance_wallet', label: 'Control de Caja' },
  { to: '/empleados', icon: 'badge', label: 'Empleados' },
  { to: '/clientes', icon: 'group', label: 'Clientes' },
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/facturacion', icon: 'receipt_long', label: 'Facturación' },
  { to: '/proveedores', icon: 'local_shipping', label: 'Proveedores' },
];

async function salir() {
  try { await api.logout(); } finally { window.location.reload(); }
}

export function AppShell() {
  const user = useUser();
  const iniciales = user.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="h-screen flex bg-surface text-on-background overflow-hidden">
      <nav className="w-64 flex-shrink-0 flex flex-col border-r border-outline-variant/20 bg-surface-container-low">
        <div className="p-6 border-b border-outline-variant/10 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full grid place-items-center bg-surface-container-lowest border border-outline-variant/20">
            <Icon name="storefront" className="text-3xl text-primary" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold text-primary">Marcelo Ross</h1>
            <p className="text-[10px] uppercase tracking-[0.12em] text-on-surface-variant mt-0.5">Heritage Ledger POS</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 mx-2 mb-1 rounded-lg text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
              {({ isActive }) => (<><Icon name={n.icon} fill={isActive} /><span>{n.label}</span></>)}
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-outline-variant/10">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="w-9 h-9 rounded-full grid place-items-center bg-primary text-on-primary text-xs font-semibold">{iniciales}</div>
            <div className="leading-tight min-w-0">
              <div className="text-sm text-on-surface truncate">{user.nombre}</div>
              <div className="text-[11px] text-gold uppercase tracking-wide">{ROL_LABEL[user.rol] ?? user.rol}</div>
            </div>
          </div>
          <button onClick={salir}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <Icon name="logout" /><span>Cerrar Sesión</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
