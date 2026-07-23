import { createContext, useContext } from 'react';
import type { Usuario } from '../api';

export const UserContext = createContext<Usuario | null>(null);
export function useUser(): Usuario {
  const u = useContext(UserContext);
  if (!u) throw new Error('useUser fuera de sesión');
  return u;
}
export function usePermiso(permiso: string): boolean {
  const u = useUser();
  return u.permisos.includes(permiso);
}
