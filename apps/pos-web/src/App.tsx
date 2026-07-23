import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import { UserContext } from './lib/user';
import { Login } from './pages/Login';
import { AppShell } from './components/AppShell';
import { VentasPage } from './pages/VentasPage';
import { EnConstruccion } from './pages/EnConstruccion';

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
          <Route path="/stock" element={<EnConstruccion titulo="Gestión de Stock" icon="inventory_2" detalle="Variantes talle×color, ingresos, transferencias e inventario. Próxima pantalla desde el mockup." />} />
          <Route path="/caja" element={<EnConstruccion titulo="Control de Caja" icon="account_balance_wallet" detalle="Apertura/cierre por turno, arqueo y conciliación de medios electrónicos." />} />
          <Route path="/empleados" element={<EnConstruccion titulo="Empleados" icon="badge" detalle="Auth y roles ya implementados. Faltan comisiones, turnos y ranking, más la gestión de usuarios por UI." />} />
          <Route path="/clientes" element={<EnConstruccion titulo="Clientes" icon="group" detalle="Ficha, historial, talles habituales y crédito a favor. Próxima pantalla desde el mockup." />} />
          <Route path="/dashboard" element={<EnConstruccion titulo="Dashboard" icon="dashboard" detalle="KPIs, rotación por marca/talle/temporada y comparativo entre sucursales. Próxima pantalla desde el mockup." />} />
          <Route path="/facturacion" element={<EnConstruccion titulo="Facturación" icon="receipt_long" detalle="Comprobantes A/B, notas de crédito, CAE ante ARCA (vía intermediario) y libro IVA." />} />
          <Route path="/proveedores" element={<EnConstruccion titulo="Proveedores" icon="local_shipping" detalle="Órdenes de compra por temporada, recepción contra remito, cuenta corriente y liquidación de consignación." />} />
          <Route path="*" element={<Navigate to="/ventas" replace />} />
        </Route>
      </Routes>
    </UserContext.Provider>
  );
}
