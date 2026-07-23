/**
 * Guards de autorización para Fastify (preHandlers).
 *  - requiereAuth: exige sesión válida; adjunta req.usuario.
 *  - requierePermiso(p): exige sesión + permiso p (menor privilegio).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { COOKIE_SESION, usuarioDeSesion, type UsuarioSesion } from './auth.js';
import { tienePermiso, type Permiso } from './permisos.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioSesion;
  }
}

async function resolver(req: FastifyRequest): Promise<UsuarioSesion | null> {
  if (req.usuario) return req.usuario;
  const token = req.cookies?.[COOKIE_SESION];
  const u = await usuarioDeSesion(token);
  if (u) req.usuario = u;
  return u;
}

export async function requiereAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const u = await resolver(req);
  if (!u) {
    await reply.code(401).send({ error: 'No autenticado.' });
  }
}

export function requierePermiso(permiso: Permiso) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const u = await resolver(req);
    if (!u) {
      await reply.code(401).send({ error: 'No autenticado.' });
      return;
    }
    if (!tienePermiso(u.rol, permiso)) {
      await reply.code(403).send({ error: `Tu rol (${u.rol}) no tiene permiso para esta acción.` });
    }
  };
}
