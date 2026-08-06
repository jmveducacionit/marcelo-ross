import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { prisma } from './db.js';
import { bus } from './shared/bus.js';
import { ErrorDescuento, ErrorDevolucion, ventas, type ConfirmarVentaInput, type RegistrarDevolucionInput } from './modules/ventas/index.js';
import { dashboard, rangoDelMes } from './modules/dashboard/index.js';
import { ErrorCredito, clientes } from './modules/clientes/index.js';
import { stock } from './modules/stock/index.js';
import { ErrorCaja, caja } from './modules/caja/index.js';
import { facturacion, iniciarWorkers } from './modules/facturacion/index.js';
import { ErrorProveedor, proveedores } from './modules/proveedores/index.js';
import { ErrorComision, empleados } from './modules/empleados/index.js';
import { login, logout, COOKIE_SESION, ErrorAuth } from './auth/auth.js';
import { requiereAuth, requierePermiso } from './auth/guards.js';
import { permisosDe } from './auth/permisos.js';

// --- Serializar BigInt (Money en centavos) como string en las respuestas JSON ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

const app = Fastify({ logger: false });

// En la nube el front vive en Netlify y la API en Render. El proxy de Netlify
// hace que el navegador los vea en el mismo origen, así que CORS casi no entra
// en juego; POS_ORIGEN_WEB queda para llamadas directas a la API (pruebas,
// health checks externos).
const ORIGEN_WEB = process.env.POS_ORIGEN_WEB;
await app.register(cors, { origin: ORIGEN_WEB ? [ORIGEN_WEB] : true, credentials: true });
await app.register(cookie);

// Consumidor in-process de ejemplo: loguea cada evento publicado (post-commit).
bus.on('*', (e) => console.log(`[evento] ${e.tipo} venta=${e.payload?.ventaId ?? ''}`));

// Facturación reacciona a la venta, no participa de su transacción: el
// comprobante queda PENDIENTE y un worker le saca el CAE cuando hay conexión.
bus.on('VentaConfirmada', (e) => {
  const ventaId = e.payload?.ventaId as string | undefined;
  if (!ventaId) return;
  facturacion.emitirParaVenta(ventaId).catch((err) => {
    // No se propaga: la venta YA está confirmada y no se puede deshacer por
    // esto. El barrido de recuperación lo levanta en la próxima pasada.
    console.error('[facturacion] no se pudo encolar el comprobante:', err?.message ?? err);
  });
});

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
      // En la nube todo es HTTPS: la cookie va `secure`. Se mantiene SameSite=Lax
      // porque el proxy de Netlify deja front y API en el mismo origen — ver
      // netlify.toml. Sin ese proxy habría que pasar a None+secure y sumar un
      // token CSRF (ADR-0009).
      secure: process.env.NODE_ENV === 'production',
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
  return clientes.listado(q.search ?? '');
});
app.get('/api/clientes/:id', { preHandler: requiereAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const det = await clientes.detalle(id);
  if (!det) return reply.code(404).send({ error: 'Cliente no encontrado.' });
  return det;
});

app.get('/api/productos', { preHandler: requiereAuth }, async (req) => {
  const q = req.query as { sucursalId?: string; search?: string };
  if (!q.sucursalId) return [];
  return stock.catalogo(q.sucursalId, q.search ?? '');
});

// Catálogo de descuentos vigentes (ADR-0004). Son datos, no código.
app.get('/api/descuentos', { preHandler: requiereAuth }, async () => {
  const ahora = new Date();
  const filas = await prisma.descuento.findMany({ orderBy: { nombre: 'asc' } });
  return filas
    .filter((d) => (!d.vigenciaDesde || d.vigenciaDesde <= ahora) && (!d.vigenciaHasta || d.vigenciaHasta >= ahora))
    .map((d) => ({
      id: d.id, nombre: d.nombre, tipo: d.tipo,
      requiereAutorizacion: d.requiereAutorizacion,
      // El reintegro bancario no baja el total: el front lo muestra distinto.
      esReintegro: d.tipo === 'PROMO_BANCARIA',
      // COMBO va por línea; el resto puede ir por línea o por ticket.
      soloLinea: d.tipo === 'COMBO',
    }));
});

// Previsualización del ticket: mismos números que confirmar, sin escribir.
app.post('/api/ventas/preview', { preHandler: requiereAuth }, async (req, reply) => {
  const b = req.body as { lineas?: Array<{ varianteId: string; cantidad: number }>; descuentos?: Array<{ descuentoId: string; indiceLinea?: number; autorizadoPor?: string }> };
  if (!Array.isArray(b?.lineas)) return reply.code(400).send({ error: 'Faltan las líneas.' });
  try {
    return await ventas.previsualizar({ lineas: b.lineas, descuentos: b.descuentos ?? [] });
  } catch (e) {
    if (e instanceof ErrorDescuento) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

// Confirmar venta: requiere permiso de cobro. El vendedor sale de la SESIÓN
// (no se confía en el cliente).
app.post('/api/ventas', { preHandler: requierePermiso('ventas.cobrar') }, async (req, reply) => {
  const body = req.body as ConfirmarVentaInput;
  if (!body?.sucursalId || !body?.cajaId || !Array.isArray(body.lineas) || body.lineas.length === 0) {
    return reply.code(400).send({ error: 'Faltan datos de la venta o no hay líneas.' });
  }
  try {
    const res = await ventas.confirmar({ ...body, vendedorId: req.usuario!.id, pagos: body.pagos ?? [] });
    return reply.code(201).send(res);
  } catch (e) {
    // Un descuento vencido o sin autorización es error del pedido, no del servidor.
    if (e instanceof ErrorDescuento || e instanceof ErrorCaja || e instanceof ErrorCredito) {
      return reply.code(400).send({ error: e.message });
    }
    throw e;
  }
});

app.get('/api/ventas/:id', { preHandler: requiereAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const det = await ventas.detalle(id);
  if (!det) return reply.code(404).send({ error: 'Venta no encontrada.' });
  return det;
});

// Devoluciones y cambios. Requiere permiso: no cualquiera devuelve plata.
app.post('/api/devoluciones', { preHandler: requierePermiso('devoluciones.autorizar') }, async (req, reply) => {
  const body = req.body as RegistrarDevolucionInput;
  if (!body?.sucursalId || !body?.cajaId || !body?.resolucion) {
    return reply.code(400).send({ error: 'Faltan datos de la devolución.' });
  }
  try {
    const res = await ventas.devolver({ ...body, usuarioId: req.usuario!.id });
    return reply.code(201).send(res);
  } catch (e) {
    if (e instanceof ErrorDevolucion) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

app.get('/api/ventas', { preHandler: requiereAuth }, async (req) => {
  const q = req.query as { sucursalId?: string };
  const registros = await prisma.venta.findMany({
    where: q.sucursalId ? { sucursalId: q.sucursalId } : {},
    orderBy: { fechaHora: 'desc' },
    take: 15,
    include: { lineas: true, pagos: true, cliente: true },
  });
  return registros.map((v) => ({
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

// --- Empleados -------------------------------------------------------------
function periodoDe(q: { periodo?: string }): string {
  if (q.periodo) return q.periodo;
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

app.get('/api/empleados', { preHandler: requierePermiso('usuarios.gestionar') }, async () => empleados.listar());

app.get('/api/empleados/comisiones', { preHandler: requierePermiso('reportes.ver') }, async (req) => {
  const q = req.query as { periodo?: string; sucursalId?: string };
  const periodo = periodoDe(q);
  return { periodo, filas: await empleados.ranking(periodo, q.sucursalId) };
});

app.post('/api/empleados/comisiones/liquidar', { preHandler: requierePermiso('usuarios.gestionar') }, async (req, reply) => {
  const b = req.body as { periodo?: string; sucursalId?: string };
  if (!b?.periodo || !b?.sucursalId) return reply.code(400).send({ error: 'Faltan período o sucursal.' });
  try {
    return await empleados.liquidar({ periodo: b.periodo, sucursalId: b.sucursalId, usuarioId: req.usuario!.id });
  } catch (e) {
    if (e instanceof ErrorComision) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

// --- Proveedores -----------------------------------------------------------
const PERMISO_PROV = 'precios.gestionar';

app.get('/api/proveedores', { preHandler: requierePermiso(PERMISO_PROV) }, async () => proveedores.listar());

app.get('/api/proveedores/:id', { preHandler: requierePermiso(PERMISO_PROV) }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const det = await proveedores.detalle(id);
  if (!det) return reply.code(404).send({ error: 'Proveedor no encontrado.' });
  return det;
});

app.get('/api/proveedores/:id/consignacion', { preHandler: requierePermiso(PERMISO_PROV) }, async (req) => {
  const { id } = req.params as { id: string };
  const q = req.query as { periodo?: string };
  const hoy = new Date();
  const periodo = q.periodo ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const [anio, mes] = periodo.split('-').map(Number);
  const desde = new Date(anio!, mes! - 1, 1);
  const hasta = new Date(anio!, mes!, 0, 23, 59, 59, 999);
  return { periodo, ...(await proveedores.calcularConsignacion(id, desde, hasta)) };
});

app.post('/api/proveedores/:id/liquidar', { preHandler: requierePermiso(PERMISO_PROV) }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const b = req.body as { periodo?: string; sucursalId?: string };
  if (!b?.periodo || !b?.sucursalId) return reply.code(400).send({ error: 'Faltan período o sucursal.' });
  try {
    return await proveedores.liquidar({ proveedorId: id, periodo: b.periodo, sucursalId: b.sucursalId, usuarioId: req.usuario!.id });
  } catch (e) {
    if (e instanceof ErrorProveedor) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

app.post('/api/proveedores/:id/pagar', { preHandler: requierePermiso(PERMISO_PROV) }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const b = req.body as { monto?: number; sucursalId?: string };
  if (b?.monto == null || !b?.sucursalId) return reply.code(400).send({ error: 'Faltan monto o sucursal.' });
  try {
    return await proveedores.pagar({ proveedorId: id, monto: b.monto, sucursalId: b.sucursalId, usuarioId: req.usuario!.id });
  } catch (e) {
    if (e instanceof ErrorProveedor) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

app.post('/api/remitos', { preHandler: requierePermiso(PERMISO_PROV) }, async (req, reply) => {
  const b = req.body as Omit<import('./modules/proveedores/index.js').RecibirRemitoInput, 'usuarioId'>;
  if (!b?.proveedorId || !b?.sucursalId || !Array.isArray(b.lineas)) {
    return reply.code(400).send({ error: 'Faltan datos del remito.' });
  }
  try {
    return reply.code(201).send(await proveedores.recibirRemito({ ...b, usuarioId: req.usuario!.id }));
  } catch (e) {
    if (e instanceof ErrorProveedor) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

// --- Facturación -----------------------------------------------------------
app.get('/api/comprobantes', { preHandler: requierePermiso('reportes.ver') }, async (req) => {
  const q = req.query as { sucursalId?: string };
  const [items, resumen] = await Promise.all([
    facturacion.listar(q.sucursalId),
    facturacion.resumen(q.sucursalId),
  ]);
  return { items, resumen };
});

// Forzar una pasada de la cola. En producción lo hace el worker solo; acá sirve
// para no esperar en la demo.
app.post('/api/comprobantes/procesar', { preHandler: requierePermiso('reportes.ver') }, async () => {
  await facturacion.recuperar();
  return facturacion.procesarCola();
});

app.get('/api/libro-iva', { preHandler: requierePermiso('reportes.ver') }, async (req) => {
  const q = req.query as { desde?: string; hasta?: string; sucursalId?: string };
  const hasta = q.hasta ? new Date(q.hasta) : new Date();
  const desde = q.desde ? new Date(q.desde) : new Date(hasta.getFullYear(), hasta.getMonth(), 1);
  return facturacion.libroIva(desde, hasta, q.sucursalId);
});

// --- Control de Caja -------------------------------------------------------
app.get('/api/caja/:cajaId', { preHandler: requierePermiso('caja.operar') }, async (req) => {
  const { cajaId } = req.params as { cajaId: string };
  return (await caja.estado(cajaId)) ?? { sesionCajaId: null };
});

app.post('/api/caja/abrir', { preHandler: requierePermiso('caja.operar') }, async (req, reply) => {
  const b = req.body as { cajaId?: string; sucursalId?: string; fondoInicial?: number };
  if (!b?.cajaId || !b?.sucursalId || b.fondoInicial == null) {
    return reply.code(400).send({ error: 'Faltan caja, sucursal o fondo inicial.' });
  }
  try {
    return reply.code(201).send(await caja.abrir({ ...b, cajaId: b.cajaId, sucursalId: b.sucursalId, fondoInicial: b.fondoInicial, usuarioId: req.usuario!.id }));
  } catch (e) {
    if (e instanceof ErrorCaja) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

app.post('/api/caja/movimiento', { preHandler: requierePermiso('caja.operar') }, async (req, reply) => {
  const b = req.body as { sesionCajaId?: string; tipo?: 'RETIRO' | 'GASTO' | 'INGRESO_MANUAL'; monto?: number; motivo?: string; sucursalId?: string };
  if (!b?.sesionCajaId || !b?.tipo || b.monto == null || !b?.sucursalId) {
    return reply.code(400).send({ error: 'Faltan datos del movimiento.' });
  }
  try {
    return await caja.movimiento({ ...b, sesionCajaId: b.sesionCajaId, tipo: b.tipo, monto: b.monto, motivo: b.motivo ?? '', sucursalId: b.sucursalId, usuarioId: req.usuario!.id });
  } catch (e) {
    if (e instanceof ErrorCaja) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

app.post('/api/caja/cerrar', { preHandler: requierePermiso('caja.operar') }, async (req, reply) => {
  const b = req.body as { sesionCajaId?: string; totalContado?: number; observaciones?: string; sucursalId?: string };
  if (!b?.sesionCajaId || b.totalContado == null || !b?.sucursalId) {
    return reply.code(400).send({ error: 'Faltan sesión, total contado o sucursal.' });
  }
  try {
    return await caja.cerrar({ ...b, sesionCajaId: b.sesionCajaId, totalContado: b.totalContado, sucursalId: b.sucursalId, usuarioId: req.usuario!.id });
  } catch (e) {
    if (e instanceof ErrorCaja) return reply.code(400).send({ error: e.message });
    throw e;
  }
});

// Dashboard: KPIs (requiere permiso de reportes → Admin / Encargado / Contador).
app.get('/api/dashboard', { preHandler: requierePermiso('reportes.ver') }, async () => dashboard.kpis());

app.get('/api/dashboard/analitica', { preHandler: requierePermiso('reportes.ver') }, async (req) => {
  const q = req.query as { periodo?: string; sucursalId?: string };
  const rango = rangoDelMes(q.periodo);
  const [m, r] = await Promise.all([
    dashboard.margenes(rango, q.sucursalId),
    dashboard.rotacion(rango, q.sucursalId),
  ]);
  return { periodo: q.periodo ?? `${rango.desde.getFullYear()}-${String(rango.desde.getMonth() + 1).padStart(2, '0')}`, margenes: m, rotacion: r };
});

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

// --- Front estático ---------------------------------------------------------
// En este despliegue el front lo sirve Netlify, no este proceso. El bloque se
// conserva para desarrollo local (donde tampoco se activa, porque el directorio
// no existe y lo sirve Vite).
const WEB_DIR = process.env.POS_WEB_DIR
  ?? resolve(dirname(fileURLToPath(import.meta.url)), 'web');

if (existsSync(WEB_DIR)) {
  await app.register(fastifyStatic, { root: WEB_DIR });
  // Fallback de SPA: cualquier ruta que no sea /api/ devuelve index.html para que
  // el router del front resuelva. /api/ inexistente sigue siendo 404 de verdad.
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api/')) return reply.code(404).send({ error: 'Ruta no encontrada.' });
    return reply.sendFile('index.html');
  });
  console.log(`[web] sirviendo el front desde ${WEB_DIR}`);
}

// Workers de fondo: recuperación de comprobantes + cola de CAE.
iniciarWorkers();

const PORT = Number(process.env.PORT ?? 3000);
// 127.0.0.1 por defecto: la demo corre en una sola máquina. Para varias cajas en
// la LAN de la sucursal se levanta con POS_HOST=0.0.0.0.
const HOST = process.env.POS_HOST ?? '127.0.0.1';
await app.listen({ port: PORT, host: HOST });
console.log(`[pos] Sucursal lista en http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
console.log(`[pos-server] escuchando en http://127.0.0.1:${PORT}`);
