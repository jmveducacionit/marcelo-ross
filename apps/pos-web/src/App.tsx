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
import { EnConstruccion } from './pages/EnConstruccion';
import { CajaPage } from './pages/CajaPage';
import { DevolucionesPage } from './pages/DevolucionesPage';
import { FacturacionPage } from './pages/FacturacionPage';

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
          <Route path="/empleados" element={<EnConstruccion titulo="Empleados" icon="badge" detalle="Auth y roles ya implementados. Faltan comisiones, turnos y ranking, más la gestión de usuarios por UI." />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/facturacion" element={<FacturacionPage />} />
          <Route path="/proveedores" element={<EnConstruccion titulo="Proveedores" icon="local_shipping" detalle="Órdenes de compra por temporada, recepción contra remito, cuenta corriente y liquidación de consignación." />} />
          <Route path="*" element={<Navigate to="/ventas" replace />} />
        </Route>
      </Routes>
    </UserContext.Provider>
  );
}
