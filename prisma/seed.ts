/**
 * Seed de datos FICTICIOS para pruebas (Etapa 1 / Slice A).
 * NO son datos reales del comercio — sirven para inspeccionar el modelo con datos.
 *
 * Uso: pnpm db:seed  (requiere DATABASE_URL apuntando a un Postgres migrado).
 *
 * Genera: sucursales, cajas, escalas de talle heterogéneas, categorías, colores,
 * temporadas, proveedores/marcas (con consignación), un catálogo de productos con
 * su matriz talle×color (variantes), precios versionados, stock por sucursal con
 * su ledger de ingreso, clientes con talles habituales, y algunas ventas con
 * pagos mixtos, movimientos de stock y comprobantes en cola de CAE.
 *
 * Convenciones respetadas: IDs UUIDv7 (nuevoUuid), dinero en centavos (Money),
 * stock a nivel variante y por sucursal, snapshot de precio en la línea de venta.
 */

import { PrismaClient } from '@prisma/client';
import { nuevoUuid, desdePesos, multiplicarPorCantidad, aplicarPorcentaje } from '@pos/core-domain';

const prisma = new PrismaClient();

// --- PRNG determinístico (mulberry32) para que el seed sea reproducible --------
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(20260721);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const entre = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

let barcodeSeq = 0;
const nuevoCodigoBarras = () => String(7790000000000 + ++barcodeSeq);

async function limpiar() {
  // Orden inverso a las dependencias (para re-ejecutar el seed).
  await prisma.$transaction([
    prisma.movimientoStock.deleteMany(),
    prisma.pago.deleteMany(),
    prisma.lineaVenta.deleteMany(),
    prisma.venta.deleteMany(),
    prisma.colaCae.deleteMany(),
    prisma.comprobante.deleteMany(),
    prisma.puntoVenta.deleteMany(),
    prisma.talleHabitual.deleteMany(),
    prisma.creditoCliente.deleteMany(),
    prisma.cliente.deleteMany(),
    prisma.precioVariante.deleteMany(),
    prisma.stockPorSucursal.deleteMany(),
    prisma.variante.deleteMany(),
    prisma.productoPadre.deleteMany(),
    prisma.temporada.deleteMany(),
    prisma.marca.deleteMany(),
    prisma.proveedor.deleteMany(),
    prisma.color.deleteMany(),
    prisma.talle.deleteMany(),
    prisma.categoria.deleteMany(),
    prisma.escalaTalle.deleteMany(),
    prisma.caja.deleteMany(),
    prisma.sucursal.deleteMany(),
  ]);
}

async function main() {
  await limpiar();

  // --- Sucursales y cajas -----------------------------------------------------
  const centroId = nuevoUuid();
  const shoppingId = nuevoUuid();
  await prisma.sucursal.createMany({
    data: [
      { id: centroId, nombre: 'Local Centro', direccion: 'San Martín, Córdoba', esDepositoCentral: true },
      { id: shoppingId, nombre: 'Local Shopping', direccion: 'Nuevocentro', esDepositoCentral: false },
    ],
  });
  const sucursales = [centroId, shoppingId];
  await prisma.caja.createMany({
    data: [
      { id: nuevoUuid(), sucursalId: centroId, nombre: 'Centro Caja 1' },
      { id: nuevoUuid(), sucursalId: centroId, nombre: 'Centro Caja 2' },
      { id: nuevoUuid(), sucursalId: shoppingId, nombre: 'Shopping Caja 1' },
    ],
  });

  // --- Escalas de talle heterogéneas + talles ---------------------------------
  const escalas = {
    camiseria: { id: nuevoUuid(), nombre: 'Camisería 38-44', talles: ['38', '40', '42', '44'] },
    denim: { id: nuevoUuid(), nombre: 'Denim 28-36', talles: ['28', '30', '32', '34', '36'] },
    calzado: { id: nuevoUuid(), nombre: 'Calzado 39-45', talles: ['39', '40', '41', '42', '43', '44', '45'] },
    sacos: { id: nuevoUuid(), nombre: 'Sacos 46-54', talles: ['46', '48', '50', '52', '54'] },
    unico: { id: nuevoUuid(), nombre: 'Talle único', talles: ['U'] },
  };
  await prisma.escalaTalle.createMany({
    data: Object.values(escalas).map((e) => ({ id: e.id, nombre: e.nombre })),
  });
  const talleIds: Record<string, string> = {}; // `${escalaId}:${etiqueta}` -> talleId
  const tallesData = Object.values(escalas).flatMap((e) =>
    e.talles.map((etiqueta, i) => {
      const id = nuevoUuid();
      talleIds[`${e.id}:${etiqueta}`] = id;
      return { id, escalaTalleId: e.id, etiqueta, orden: i };
    }),
  );
  await prisma.talle.createMany({ data: tallesData });

  // --- Categorías (cada una con su escala) ------------------------------------
  const categorias = [
    { id: nuevoUuid(), nombre: 'Camisería', escala: escalas.camiseria, precioBase: 45000 },
    { id: nuevoUuid(), nombre: 'Denim', escala: escalas.denim, precioBase: 72000 },
    { id: nuevoUuid(), nombre: 'Calzado', escala: escalas.calzado, precioBase: 95000 },
    { id: nuevoUuid(), nombre: 'Sacos', escala: escalas.sacos, precioBase: 130000 },
    { id: nuevoUuid(), nombre: 'Accesorios', escala: escalas.unico, precioBase: 18000 },
  ];
  await prisma.categoria.createMany({
    data: categorias.map((c) => ({ id: c.id, nombre: c.nombre, escalaTalleId: c.escala.id })),
  });

  // --- Colores ----------------------------------------------------------------
  const coloresDef = [
    ['Blanco', '#FFFFFF'], ['Negro', '#000000'], ['Azul', '#1B3B6F'],
    ['Celeste', '#7FB2E5'], ['Gris', '#808080'], ['Bordó', '#5C0A16'], ['Beige', '#D9C6A5'],
  ];
  const colores = coloresDef.map(([nombre, codigoHex]) => ({ id: nuevoUuid(), nombre: nombre!, codigoHex: codigoHex! }));
  await prisma.color.createMany({ data: colores });

  // --- Temporadas -------------------------------------------------------------
  const temporadas = [
    { id: nuevoUuid(), nombre: 'Primavera-Verano', anio: 2026 },
    { id: nuevoUuid(), nombre: 'Otoño-Invierno', anio: 2026 },
  ];
  await prisma.temporada.createMany({ data: temporadas });

  // --- Proveedores y marcas (12 marcas, algunas en consignación) --------------
  const proveedoresDef = [
    { razonSocial: 'Textil Córdoba SA', consig: false, marcas: ['Ross Classic', 'Ross Denim', 'Ross Formal'] },
    { razonSocial: 'Indumentaria del Sur SRL', consig: false, marcas: ['Norte Jeans', 'Camisería París'] },
    { razonSocial: 'Calzados Andinos SA', consig: false, marcas: ['Andino', 'PasoFirme'] },
    { razonSocial: 'Accesorios Premium SRL', consig: true, marcas: ['Nudo & Co', 'CueroFino'] },
    { razonSocial: 'Distribuidora Italiana SA', consig: true, marcas: ['Milano Sartoria', 'Bergamo', 'Veneto'] },
  ];
  const marcas: { id: string; nombre: string; consig: boolean }[] = [];
  const proveedoresData: any[] = [];
  const marcasData: any[] = [];
  for (const p of proveedoresDef) {
    const provId = nuevoUuid();
    proveedoresData.push({
      id: provId, razonSocial: p.razonSocial, cuit: `30-${entre(10000000, 99999999)}-${entre(0, 9)}`,
      condicionIva: 'Responsable Inscripto', esConsignatario: p.consig,
    });
    for (const nombre of p.marcas) {
      const id = nuevoUuid();
      marcas.push({ id, nombre, consig: p.consig });
      marcasData.push({ id, nombre, proveedorId: provId, markupObjetivo: 0.55 + rnd() * 0.75 });
    }
  }
  await prisma.proveedor.createMany({ data: proveedoresData });
  await prisma.marca.createMany({ data: marcasData });

  // --- Productos + variantes (matriz talle×color) + precios + stock -----------
  const nombresPorCategoria: Record<string, string[]> = {
    Camisería: ['Camisa Oxford', 'Camisa Lino', 'Camisa Slim', 'Camisa Vestir', 'Camisa Cuadros', 'Camisa Denim', 'Camisa Manga Corta', 'Camisa Príncipe'],
    Denim: ['Jean Slim', 'Jean Recto', 'Jean Chupín', 'Jean Comfort', 'Jean Rígido', 'Jean Elastizado', 'Jean Carpintero', 'Jean Negro'],
    Calzado: ['Zapato Oxford', 'Mocasín', 'Zapato Derby', 'Botineta', 'Zapatilla Urbana', 'Náutico', 'Borcego', 'Zapato Charol'],
    Sacos: ['Saco Cruzado', 'Saco Príncipe', 'Blazer Liso', 'Saco Espiga', 'Traje Slim', 'Saco Lino', 'Blazer Azul', 'Saco Clásico'],
    Accesorios: ['Corbata Seda', 'Cinturón Cuero', 'Pañuelo', 'Gemelos', 'Billetera', 'Moño', 'Tirantes', 'Bufanda'],
  };

  const variantesParaVenta: { id: string; precio: bigint; sucursalId: string }[] = [];
  const productosData: any[] = [];
  const variantesData: any[] = [];
  const preciosData: any[] = [];
  const stockData: any[] = [];
  const movimientosData: any[] = [];

  for (const cat of categorias) {
    const talles = cat.escala.talles.map((t) => talleIds[`${cat.escala.id}:${t}`]!);
    // 2–3 colores por producto para no explotar el conteo.
    for (const nombre of nombresPorCategoria[cat.nombre]!) {
      const marca = pick(marcas);
      const temporada = pick(temporadas);
      const productoId = nuevoUuid();
      productosData.push({
        id: productoId, nombre: `${nombre} ${marca.nombre}`, marcaId: marca.id,
        categoriaId: cat.id, temporadaId: temporada.id,
        descripcion: `${nombre} de la marca ${marca.nombre}`,
      });
      // precio del producto: base de categoría ± variación
      const precioPesos = cat.precioBase + entre(-8000, 25000);
      const precio = desdePesos(precioPesos);
      const coloresProd = [...colores].sort(() => rnd() - 0.5).slice(0, entre(2, 3));
      for (const talleId of talles) {
        for (const color of coloresProd) {
          const varianteId = nuevoUuid();
          variantesData.push({
            id: varianteId, productoPadreId: productoId, talleId, colorId: color.id,
            codigoBarras: nuevoCodigoBarras(), esConsignacion: marca.consig,
          });
          preciosData.push({
            id: nuevoUuid(), varianteId, precio, vigenteDesde: new Date('2026-07-01'),
            motivo: 'Precio inicial de temporada',
          });
          // stock por sucursal + ledger de ingreso
          for (const sucursalId of sucursales) {
            const cantidad = entre(0, 8);
            stockData.push({ id: nuevoUuid(), varianteId, sucursalId, cantidad });
            if (cantidad > 0) {
              movimientosData.push({
                id: nuevoUuid(), varianteId, sucursalId, tipo: 'INGRESO', cantidad,
                motivo: 'Carga inicial (seed)', usuarioId: 'seed', ocurridoEn: new Date('2026-07-01'),
              });
              variantesParaVenta.push({ id: varianteId, precio, sucursalId });
            }
          }
        }
      }
    }
  }
  await prisma.productoPadre.createMany({ data: productosData });
  await prisma.variante.createMany({ data: variantesData });
  await prisma.precioVariante.createMany({ data: preciosData });
  await prisma.stockPorSucursal.createMany({ data: stockData });
  await prisma.movimientoStock.createMany({ data: movimientosData });

  // --- Clientes + talles habituales -------------------------------------------
  const clientesDef = [
    { nombre: 'Juan Pérez', iva: 'Consumidor Final' },
    { nombre: 'Carlos Gómez', iva: 'Consumidor Final' },
    { nombre: 'Estudio Contable SRL', iva: 'Responsable Inscripto', cuit: '30-71122334-5' },
    { nombre: 'Martín Suárez', iva: 'Consumidor Final' },
    { nombre: 'Distribuidora López SA', iva: 'Responsable Inscripto', cuit: '30-70998877-1' },
    { nombre: 'Diego Fernández', iva: 'Consumidor Final' },
    { nombre: 'Roberto Díaz', iva: 'Consumidor Final' },
    { nombre: 'Consultora RH SRL', iva: 'Responsable Inscripto', cuit: '30-71455667-8' },
  ];
  const clientesData: any[] = [];
  const tallesHabitualesData: any[] = [];
  for (const c of clientesDef) {
    const id = nuevoUuid();
    clientesData.push({
      id, nombre: c.nombre, condicionIva: c.iva, cuit: c.cuit ?? null,
      razonSocial: c.cuit ? c.nombre : null,
      domicilioFiscal: c.cuit ? 'Córdoba, Argentina' : null,
    });
    // 1–2 talles habituales
    for (let k = 0; k < entre(1, 2); k++) {
      const cat = pick(categorias);
      const etiqueta = pick(cat.escala.talles);
      tallesHabitualesData.push({
        id: nuevoUuid(), clienteId: id, categoriaId: cat.id,
        talleId: talleIds[`${cat.escala.id}:${etiqueta}`]!,
      });
    }
  }
  await prisma.cliente.createMany({ data: clientesData });
  await prisma.talleHabitual.createMany({ data: tallesHabitualesData });

  // --- Puntos de venta (uno por sucursal) -------------------------------------
  const ptoVentaCentroId = nuevoUuid();
  const ptoVentaShoppingId = nuevoUuid();
  await prisma.puntoVenta.createMany({
    data: [
      { id: ptoVentaCentroId, sucursalId: centroId, numeroArca: 1 },
      { id: ptoVentaShoppingId, sucursalId: shoppingId, numeroArca: 2 },
    ],
  });

  // --- Ventas de ejemplo (pagos mixtos, movimientos, comprobante PENDIENTE) ----
  const cajasCentro = await prisma.caja.findMany({ where: { sucursalId: centroId } });
  const clientes = await prisma.cliente.findMany();
  const disponiblesCentro = variantesParaVenta.filter((x) => x.sucursalId === centroId);
  const IVA = 21;
  let comprobNumero = 0;

  for (let v = 0; v < 8; v++) {
    const sucursalId = centroId;
    const caja = pick(cajasCentro);
    const cliente = rnd() > 0.4 ? pick(clientes) : null;
    const cant = entre(1, 3);
    const elegidas = [...disponiblesCentro].sort(() => rnd() - 0.5).slice(0, cant);

    const ventaId = nuevoUuid();
    const lineas: any[] = [];
    const movs: any[] = [];
    let subtotal = 0n;
    for (const vr of elegidas) {
      const unidades = entre(1, 2);
      const sub = multiplicarPorCantidad(vr.precio as any, unidades);
      subtotal += sub;
      lineas.push({
        id: nuevoUuid(), ventaId, varianteId: vr.id, cantidad: unidades,
        precioUnitario: vr.precio, subtotalLinea: sub, requiereAjuste: false,
      });
      movs.push({
        id: nuevoUuid(), varianteId: vr.id, sucursalId, tipo: 'VENTA', cantidad: -unidades,
        motivo: 'Venta (seed)', referenciaId: ventaId, usuarioId: 'seed', ocurridoEn: new Date(),
      });
    }
    const total = subtotal;
    const requiereAjuste = rnd() > 0.75;

    await prisma.venta.create({
      data: {
        id: ventaId, sucursalId, cajaId: caja.id, vendedorId: 'seed',
        clienteId: cliente?.id ?? null, estadoVenta: 'CONFIRMADA',
        estadoEntrega: requiereAjuste ? 'PENDIENTE_AJUSTE' : 'ENTREGADA',
        subtotal, totalDescuentos: 0n, total,
        lineas: { create: lineas.map(({ ventaId: _omit, ...l }) => l) },
        pagos: {
          create:
            rnd() > 0.5
              ? [{ id: nuevoUuid(), medio: 'EFECTIVO', monto: total }]
              : [
                  { id: nuevoUuid(), medio: 'EFECTIVO', monto: aplicarPorcentaje(total as any, 40) },
                  { id: nuevoUuid(), medio: 'DEBITO', monto: (total - aplicarPorcentaje(total as any, 40)) as bigint },
                ],
        },
      },
    });
    await prisma.movimientoStock.createMany({ data: movs });

    // Comprobante fiscal en cola de CAE (offline-first: PENDIENTE)
    const esFacturaA = cliente?.condicionIva === 'Responsable Inscripto';
    const neto = total;
    const comprobanteId = nuevoUuid();
    await prisma.comprobante.create({
      data: {
        id: comprobanteId, tipo: esFacturaA ? 'FACTURA_A' : 'FACTURA_B',
        puntoVentaId: ptoVentaCentroId, numero: ++comprobNumero, ventaId,
        clienteId: cliente?.id ?? null, neto, iva: aplicarPorcentaje(neto as any, IVA),
        total: (neto + aplicarPorcentaje(neto as any, IVA)) as bigint, estadoCae: 'PENDIENTE', intentos: 0,
        cola: { create: { id: nuevoUuid(), estado: 'PENDIENTE', proximoIntento: new Date() } },
      },
    });
  }

  // --- Resumen ----------------------------------------------------------------
  const [nVar, nStock, nVentas] = await Promise.all([
    prisma.variante.count(), prisma.stockPorSucursal.count(), prisma.venta.count(),
  ]);
  console.log(`Seed OK: ${nVar} variantes, ${nStock} filas de stock, ${nVentas} ventas.`);
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
