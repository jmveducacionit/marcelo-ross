import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { prisma } from './db.js';
import { bus } from './shared/bus.js';
import { buscarProductos } from './services/catalogo.js';
import { confirmarVenta } from './services/ventas.js';
import { kpis } from './services/dashboard.js';
import { clientesListado, clienteDetalle } from './services/clientes.js';
import { stock } from './modules/stock/index.js';
import { login, logout, COOKIE_SESION, ErrorAuth } from './auth/auth.js';
import { requiereAuth, requierePermiso } from './auth/guards.js';
import { permisosDe } from './auth/permisos.js';

// --- Serializar BigInt (Money en centavos) como string en las respuestas JSON ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

const app = Fastify({ logger: false });
await app.register(cors, { origin: true, credentials: true });
await app.register(cookie);

// Consumidor in-process de ejemplo: loguea cada evento publicado (post-commit).
bus.on('*', (e) => console.log(`[evento] ${e.tipo} venta=${e.payload?.ventaId ?? ''}`));

const TTL_SESION_SEG = 12 * 60 * 60;

app.get('/api/health', async () => ({ ok: true }));

// --- Autenticación ---------------------------------------------------------
app.post('/api/auth/login', async (req, reply) => {
  const body = req.body as { usuario?: string; password?: string };
  if (!body?.usuario || !body?.password) {
    return reply.code(400).send({ error: 'Faltan usuario y contraseña.' });
  }
  try {
    const userAgent = req.headers['user-agent'];
    const { token, usuario } = await login(body.usuario, body.password, {
      ip: req.ip, ...(userAgent ? { userAgent } : {}),
    });
    reply.setCookie(COOKIE_SESION, token, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: TTL_SESION_SEG,
      // secure: true en producción (HTTPS). En LAN http queda false.
    });
    return { usuario: { ...usuario, permisos: permisosDe(usuario.rol) } };
  } catch (e) {
    if (e instanceof ErrorAuth) return reply.code(401).send({ error: e.message });
    throw e;
  }
});

app.post('/api/auth/logout', async (req, reply) => {
  await logout(req.cookies?.[COOKIE_SESION]);
  reply.clearCookie(COOKIE_SESION, { path: '/' });
  return { ok: true };
});

app.get('/api/auth/me', { preHandler: requiereAuth }, async (req) => {
  const u = req.usuario!;
  return { usuario: { ...u, permisos: permisosDe(u.rol) } };
});

// --- Datos (requieren sesión) ----------------------------------------------
app.get('/api/contexto', { preHandler: requiereAuth }, async () => {
  const sucursales = await prisma.sucursal.findMany({
    orderBy: { nombre: 'asc' },
    include: { cajas: { orderBy: { nombre: 'asc' } } },
  });
  return {
    sucursales: sucursales.map((s) => ({
      id: s.id, nombre: s.nombre, esDepositoCentral: s.esDepositoCentral,
      cajas: s.cajas.map((c) => ({ id: c.id, nombre: c.nombre })),
    })),
  };
});

app.get('/api/clientes', { preHandler: requiereAuth }, async (req) => {
  const q = req.query as { search?: string };
  return clientesListado(q.search ?? '');
});
app.get('/api/clientes/:id', { preHandler: requiereAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const det = await clienteDetalle(id);
  if (!det) return reply.code(404).send({ error: 'Cliente no encontrado.' });
  return det;
});

app.get('/api/productos', { preHandler: requiereAuth }, async (req) => {
  const q = req.query as { sucursalId?: string; search?: string };
  if (!q.sucursalId) return [];
  return buscarProductos(q.sucursalId, q.search ?? '');
});

// Confirmar venta: requiere permiso de cobro. El vendedor sale de la SESIÓN
// (no se confía en el cliente).
app.post('/api/ventas', { preHandler: requierePermiso('ventas.cobrar') }, async (req, reply) => {
  const body = req.body as Parameters<typeof confirmarVenta>[0];
  if (!body?.sucursalId || !body?.cajaId || !Array.isArray(body.lineas) || body.lineas.length === 0) {
    return reply.code(400).send({ error: 'Faltan datos de la venta o no hay líneas.' });
  }
  const res = await confirmarVenta({ ...body, vendedorId: req.usuario!.id, pagos: body.pagos ?? [] });
  return reply.code(201).send(res);
});

app.get('/api/ventas', { preHandler: requiereAuth }, async (req) => {
  const q = req.query as { sucursalId?: string };
  const ventas = await prisma.venta.findMany({
    where: q.sucursalId ? { sucursalId: q.sucursalId } : {},
    orderBy: { fechaHora: 'desc' },
    take: 15,
    include: { lineas: true, pagos: true, cliente: true },
  });
  return ventas.map((v) => ({
    id: v.id, fechaHora: v.fechaHora, total: v.total.toString(), estadoEntrega: v.estadoEntrega,
    items: v.lineas.reduce((n, l) => n + l.cantidad, 0),
    cliente: v.cliente?.nombre ?? 'Consumidor Final',
    medios: [...new Set(v.pagos.map((p) => p.medio))], vendedorId: v.vendedorId,
  }));
});

app.get('/api/actividad', { preHandler: requiereAuth }, async (req) => {
  const q = req.query as { sucursalId?: string };
  const where = q.sucursalId ? { sucursalId: q.sucursalId } : {};
  const [eventos, auditoria] = await Promise.all([
    prisma.outbox.findMany({ where, orderBy: { ocurridoEn: 'desc' }, take: 12 }),
    prisma.registroAuditoria.findMany({ where, orderBy: { ocurridoEn: 'desc' }, take: 12 }),
  ]);
  const items = [
    ...eventos.map((e) => ({ tipo: 'evento' as const, clave: e.tipoEvento, estado: e.estado, ocurridoEn: e.ocurridoEn })),
    ...auditoria.map((a) => ({ tipo: 'auditoria' as const, clave: a.accion, estado: a.usuarioId, ocurridoEn: a.ocurridoEn })),
  ].sort((a, b) => +new Date(b.ocurridoEn) - +new Date(a.ocurridoEn)).slice(0, 16);
  return items;
});

// Dashboard: KPIs (requiere permiso de reportes → Admin / Encargado / Contador).
app.get('/api/dashboard', { preHandler: requierePermiso('reportes.ver') }, async () => kpis());

// Stock: listado + detalle con matriz talle×color (consulta: cualquier usuario).
app.get('/api/stock', { preHandler: requiereAuth }, async (req) => {
  const q = req.query as { sucursalId?: string; search?: string };
  if (!q.sucursalId) return [];
  return stock.listado(q.sucursalId, q.search ?? '');
});
app.get('/api/stock/:productoId', { preHandler: requiereAuth }, async (req, reply) => {
  const { productoId } = req.params as { productoId: string };
  const q = req.query as { sucursalId?: string };
  if (!q.sucursalId) return reply.code(400).send({ error: 'Falta sucursalId.' });
  const detalle = await stock.detalle(productoId, q.sucursalId);
  if (!detalle) return reply.code(404).send({ error: 'Producto no encontrado.' });
  return detalle;
});

// Escritura de stock (requiere permiso stock.transferir → Admin / Encargado).
app.post('/api/stock/ingreso', { preHandler: requierePermiso('stock.transferir') }, async (req, reply) => {
  const b = req.body as { varianteId?: string; sucursalId?: string; cantidad?: number };
  if (!b?.varianteId || !b?.sucursalId || b.cantidad == null) return reply.code(400).send({ error: 'Faltan datos.' });
  try { return await stock.ingresar(b.varianteId, b.sucursalId, b.cantidad, { usuarioId: req.usuario!.id, sucursalId: b.sucursalId }); }
  catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
});
app.post('/api/stock/ajuste', { preHandler: requierePermiso('stock.transferir') }, async (req, reply) => {
  const b = req.body as { varianteId?: string; sucursalId?: string; nuevaCantidad?: number };
  if (!b?.varianteId || !b?.sucursalId || b.nuevaCantidad == null) return reply.code(400).send({ error: 'Faltan datos.' });
  try { return await stock.ajustar(b.varianteId, b.sucursalId, b.nuevaCantidad, { usuarioId: req.usuario!.id, sucursalId: b.sucursalId }); }
  catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
});
app.post('/api/stock/transferencia', { preHandler: requierePermiso('stock.transferir') }, async (req, reply) => {
  const b = req.body as { varianteId?: string; origenId?: string; destinoId?: string; cantidad?: number };
  if (!b?.varianteId || !b?.origenId || !b?.destinoId || b.cantidad == null) return reply.code(400).send({ error: 'Faltan datos.' });
  try { return await stock.transferir(b.varianteId, b.origenId, b.destinoId, b.cantidad, { usuarioId: req.usuario!.id, sucursalId: b.origenId }); }
  catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
});

const PORT = Number(process.env.PORT ?? 3000);
await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`[pos-server] escuchando en http://127.0.0.1:${PORT}`);
