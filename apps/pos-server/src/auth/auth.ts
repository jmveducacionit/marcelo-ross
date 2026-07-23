/**
 * Autenticación segura:
 *  - Hashing de contraseñas con Argon2id (@node-rs/argon2).
 *  - Sesiones server-side revocables (se guarda solo el HASH del token).
 *  - Bloqueo temporal tras N intentos fallidos (anti fuerza bruta).
 *  - Auditoría de login OK/fallido y logout.
 *  - Mensajes de error genéricos (no revelan si el usuario existe).
 */
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { nuevoUuid } from '@pos/core-domain';
import { registrarAuditoria } from '../shared/bus.js';

export const COOKIE_SESION = 'pos_session';
const SESION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h (turno)
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000; // 15 min

/** Error de credenciales (mensaje genérico, sin enumeración de usuarios). */
export class ErrorAuth extends Error {
  constructor(public codigo: 'CREDENCIALES' | 'BLOQUEADO', mensaje: string) {
    super(mensaje);
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Hashea una contraseña con Argon2id. Usar en alta/cambio de contraseña y seed. */
export function hashearPassword(password: string): Promise<string> {
  return argonHash(password); // @node-rs/argon2 usa Argon2id por defecto
}

export interface UsuarioSesion {
  id: string;
  nombre: string;
  usuario: string;
  rol: string;
  sucursalIdPrincipal: string;
}

/** Valida credenciales y crea una sesión. Devuelve el token opaco (para la cookie). */
export async function login(
  usuarioLogin: string,
  password: string,
  ctx: { ip?: string; userAgent?: string },
): Promise<{ token: string; expiraEn: Date; usuario: UsuarioSesion }> {
  const u = await prisma.usuario.findUnique({ where: { usuario: usuarioLogin } });

  // Usuario inexistente o inactivo → mismo costo/mensaje que password inválida.
  if (!u || !u.activo) {
    // Verificación "señuelo" para igualar el tiempo de respuesta (anti timing).
    await argonVerify('$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$RdescvT8xbUOQGyyPdjkETQV0vqm5B0J1B6Q0Q0Q0Q0', password).catch(() => false);
    throw new ErrorAuth('CREDENCIALES', 'Usuario o contraseña inválidos.');
  }

  // Bloqueo temporal activo.
  if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
    throw new ErrorAuth('BLOQUEADO', 'Cuenta bloqueada temporalmente por intentos fallidos. Probá más tarde.');
  }

  const ok = await argonVerify(u.hashPassword, password).catch(() => false);
  if (!ok) {
    const intentos = u.intentosFallidos + 1;
    const bloquear = intentos >= MAX_INTENTOS;
    await prisma.usuario.update({
      where: { id: u.id },
      data: {
        intentosFallidos: bloquear ? 0 : intentos,
        bloqueadoHasta: bloquear ? new Date(Date.now() + BLOQUEO_MS) : u.bloqueadoHasta,
      },
    });
    await auditarAuth(u.id, u.sucursalIdPrincipal, 'LOGIN_FALLIDO', { intentos, bloqueado: bloquear });
    throw new ErrorAuth('CREDENCIALES', 'Usuario o contraseña inválidos.');
  }

  // Éxito: resetear contadores, registrar login, crear sesión.
  const token = randomBytes(32).toString('base64url');
  const expiraEn = new Date(Date.now() + SESION_TTL_MS);
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: u.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoLogin: new Date() },
    }),
    prisma.sesion.create({
      data: {
        id: nuevoUuid(), tokenHash: sha256(token), usuarioId: u.id,
        sucursalId: u.sucursalIdPrincipal, expiraEn,
        ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null,
      },
    }),
  ]);
  await auditarAuth(u.id, u.sucursalIdPrincipal, 'LOGIN_OK', null);

  return {
    token, expiraEn,
    usuario: { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, sucursalIdPrincipal: u.sucursalIdPrincipal },
  };
}

/** Resuelve el usuario de una sesión válida (no vencida ni revocada). */
export async function usuarioDeSesion(token: string | undefined): Promise<UsuarioSesion | null> {
  if (!token) return null;
  const s = await prisma.sesion.findUnique({
    where: { tokenHash: sha256(token) },
    include: { usuario: true },
  });
  if (!s || s.revocadaEn || s.expiraEn < new Date() || !s.usuario.activo) return null;
  const u = s.usuario;
  return { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, sucursalIdPrincipal: u.sucursalIdPrincipal };
}

/** Revoca la sesión (logout). */
export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  const s = await prisma.sesion.findUnique({ where: { tokenHash: sha256(token) } });
  if (s && !s.revocadaEn) {
    await prisma.sesion.update({ where: { id: s.id }, data: { revocadaEn: new Date() } });
    await auditarAuth(s.usuarioId, s.sucursalId ?? 'sistema', 'LOGOUT', null);
  }
}

async function auditarAuth(usuarioId: string, sucursalId: string, accion: string, despues: unknown) {
  await registrarAuditoria(
    prisma as never,
    { usuarioId, sucursalId },
    { entidad: 'Sesion', entidadId: usuarioId, accion, despues },
  );
}
