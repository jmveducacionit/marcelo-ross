import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import { UserContext } from './lib/user';
import { Login } from './pages/Login';
import { AppShell } from './components/AppShell';
import { VentasPage } from './pages/VentasPage';
import { DashboardPage } from './pages/DashboardPage';
import { StockPage } from './pages/StockPage';
import { ClientesPage } from './pages/ClientesPage';
import { CajaPage } from './pages/CajaPage';
import { DevolucionesPage } from './pages/DevolucionesPage';
import { FacturacionPage } from './pages/FacturacionPage';
import { ProveedoresPage } from './pages/ProveedoresPage';
import { EmpleadosPage } from './pages/EmpleadosPage';

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });

  if (me.isLoading) {
    return <div className="min-h-screen grid place-items-center bg-background text-on-surface-variant">Cargando…</div>;
  }
  if (me.isError || !me.data) {
    return <Login onLogged={(u) => qc.setQueryData(['me'], u)} />;
  }

  return (
    <UserContext.Provider value={me.data}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/ventas" replace />} />
          <Route path="/ventas" element={<VentasPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/caja" element={<CajaPage />} />
          <Route path="/devoluciones" element={<DevolucionesPage />} />
          <Route path="/empleados" element={<EmpleadosPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/facturacion" element={<FacturacionPage />} />
          <Route path="/proveedores" element={<ProveedoresPage />} />
          <Route path="*" element={<Navigate to="/ventas" replace />} />
        </Route>
      </Routes>
    </UserContext.Provider>
  );
}
