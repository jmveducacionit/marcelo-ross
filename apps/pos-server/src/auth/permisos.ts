/**
 * RBAC estático: mapa rol → permisos. Right-sized para 4 roles (sin ACL en DB).
 * Ver la matriz en docs/ (módulo Empleados). Jerarquía: ADMIN > ENCARGADO > CAJERO ≈ VENDEDOR.
 */

export const ROLES = ['ADMIN', 'ENCARGADO', 'CAJERO', 'VENDEDOR', 'CONTADOR_RO'] as const;
export type Rol = (typeof ROLES)[number];

export const PERMISOS = [
  'usuarios.gestionar', // alta/baja de usuarios, roles, config global
  'reportes.ver', // dashboard / reportes
  'precios.gestionar', // actualizar precios
  'ventas.anular', // anular ventas
  'stock.transferir', // transferencias entre sucursales, ajustes
  'caja.operar', // abrir/cerrar caja, arqueo
  'descuentos.autorizar', // descuentos por encima del límite
  'devoluciones.autorizar', // aprobar devoluciones
  'ventas.cobrar', // confirmar venta con cobro (cerrar el ticket)
  'ventas.armar', // armar el ticket / carrito
  'catalogo.ver', // consultar stock y precios
] as const;
export type Permiso = (typeof PERMISOS)[number];

export const PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]> = {
  ADMIN: PERMISOS, // todo
  ENCARGADO: [
    'reportes.ver', 'precios.gestionar', 'ventas.anular', 'stock.transferir',
    'caja.operar', 'descuentos.autorizar', 'devoluciones.autorizar',
    'ventas.cobrar', 'ventas.armar', 'catalogo.ver',
  ],
  CAJERO: ['caja.operar', 'ventas.cobrar', 'ventas.armar', 'catalogo.ver'],
  VENDEDOR: ['ventas.armar', 'catalogo.ver'],
  CONTADOR_RO: ['reportes.ver'], // contador externo: solo lectura de reportes
};

export function permisosDe(rol: string): Permiso[] {
  return [...(PERMISOS_POR_ROL[rol as Rol] ?? [])];
}

export function tienePermiso(rol: string, permiso: Permiso): boolean {
  return permisosDe(rol).includes(permiso);
}
