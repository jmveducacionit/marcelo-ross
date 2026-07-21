import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from './db.js';
import { bus } from './shared/bus.js';
import { buscarProductos } from './services/catalogo.js';
import { confirmarVenta } from './services/ventas.js';

// --- Serializar BigInt (Money en centavos) como string en las respuestas JSON ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

// Consumidor in-process de ejemplo: loguea cada evento publicado (post-commit).
bus.on('*', (e) => console.log(`[evento] ${e.tipo} venta=${e.payload?.ventaId ?? ''}`));

// Vendedores de demo (sin auth real todavía — ver roadmap Etapa 8).
const VENDEDORES = [
  { id: 'vend-ana', nombre: 'Ana' },
  { id: 'vend-bruno', nombre: 'Bruno' },
  { id: 'vend-caro', nombre: 'Caro' },
];

app.get('/api/health', async () => ({ ok: true }));

// Contexto para poblar los selectores del front.
app.get('/api/contexto', async () => {
  const sucursales = await prisma.sucursal.findMany({
    orderBy: { nombre: 'asc' },
    include: { cajas: { orderBy: { nombre: 'asc' } } },
  });
  return {
    sucursales: sucursales.map((s) => ({
      id: s.id, nombre: s.nombre, esDepositoCentral: s.esDepositoCentral,
      cajas: s.cajas.map((c) => ({ id: c.id, nombre: c.nombre })),
    })),
    vendedores: VENDEDORES,
  };
});

app.get('/api/clientes', async () => {
  const clientes = await prisma.cliente.findMany({ orderBy: { nombre: 'asc' } });
  return clientes.map((c) => ({ id: c.id, nombre: c.nombre, condicionIva: c.condicionIva, esFacturaA: !!c.cuit }));
});

app.get('/api/productos', async (req) => {
  const q = req.query as { sucursalId?: string; search?: string };
  if (!q.sucursalId) return [];
  return buscarProductos(q.sucursalId, q.search ?? '');
});

app.post('/api/ventas', async (req, reply) => {
  const body = req.body as Parameters<typeof confirmarVenta>[0];
  if (!body?.sucursalId || !body?.cajaId || !body?.vendedorId || !Array.isArray(body.lineas) || body.lineas.length === 0) {
    return reply.code(400).send({ error: 'Faltan datos de la venta o no hay líneas.' });
  }
  const res = await confirmarVenta({ ...body, pagos: body.pagos ?? [] });
  return reply.code(201).send(res);
});

app.get('/api/ventas', async (req) => {
  const q = req.query as { sucursalId?: string };
  const ventas = await prisma.venta.findMany({
    where: q.sucursalId ? { sucursalId: q.sucursalId } : {},
    orderBy: { fechaHora: 'desc' },
    take: 15,
    include: { lineas: true, pagos: true, cliente: true },
  });
  return ventas.map((v) => ({
    id: v.id,
    fechaHora: v.fechaHora,
    total: v.total.toString(),
    estadoEntrega: v.estadoEntrega,
    items: v.lineas.reduce((n, l) => n + l.cantidad, 0),
    cliente: v.cliente?.nombre ?? 'Consumidor Final',
    medios: [...new Set(v.pagos.map((p) => p.medio))],
    vendedorId: v.vendedorId,
  }));
});

// Actividad: eventos de dominio (Outbox) + auditoría, mezclados por tiempo.
app.get('/api/actividad', async (req) => {
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

const PORT = Number(process.env.PORT ?? 3000);
await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`[pos-server] escuchando en http://127.0.0.1:${PORT}`);
