// dashboard.js — Resumen general del panel: KPIs (con comparativa vs. mes
// anterior), alertas accionables, gráficos (Chart.js) y las listas de siempre
// (últimas órdenes, stock bajo, últimas reseñas).

import { $, esc, formatearPrecio, formatearFechaHora, estadoCargando } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

const DIA_MS = 86400000;
const HORA_MS = 3600000;

// Colores alineados con la paleta del panel (admin.css) y los badges.
const COLORES = Object.freeze({
    primario: '#2563eb',
    exito: '#00a650',
    advertencia: '#b45309',
    peligro: '#ef4444',
    secundario: '#64748b',
    enviado: '#4338ca',
    gris: '#94a3b8'
});

// Estados posibles de un pedido (mismos nombres que la BD / pedidos.js).
const ESTADOS = ['Pendiente', 'Procesando', 'Enviado', 'Entregado', 'Cancelado'];
const COLOR_ESTADO = Object.freeze({
    Pendiente: COLORES.advertencia,
    Procesando: COLORES.primario,
    Enviado: COLORES.enviado,
    Entregado: COLORES.exito,
    Cancelado: COLORES.gris
});

// Instancias Chart.js vivas: se destruyen en cada render para no filtrar
// memoria ni duplicar canvas al navegar entre secciones.
let charts = []; // { chart, tipo }

function destruirCharts() {
    charts.forEach((c) => { try { c.chart.destroy(); } catch { /* noop */ } });
    charts = [];
}

// Colores de los gráficos según el tema del panel (admin: no detecta el
// dispositivo; el tema viene de settings.admin_tema vía tema-admin.js).
// Los valores de `oscuro` son los mismos tokens que el bloque
// html[data-tema="dark"] de admin.css: si se cambia la paleta ahí, hay que
// cambiarlos acá también o los gráficos quedan con matiz azul sobre fondo gris.
function coloresChart() {
    const oscuro = document.documentElement.getAttribute('data-tema') === 'dark';
    return {
        ticks: oscuro ? '#a3a3a3' : '#64748b',
        grid: oscuro ? '#2e2e2e' : '#e2e8f0',
        separador: oscuro ? '#1f1f1f' : '#ffffff', // borde entre sectores del donut = superficie
        lineaFill: oscuro ? 'rgba(37, 99, 235, 0.18)' : 'rgba(37, 99, 235, 0.12)'
    };
}

// Ajustar los gráficos vivos al tema activo (evento 'lemora:tema-panel').
// No los recrea: solo recolorea ejes, grids, leyendas y separadores.
function reaplicarTemaCharts() {
    if (!charts.length) return;
    const c = coloresChart();
    charts.forEach(({ chart, tipo }) => {
        if (!chart) return;
        const op = chart.options;
        if (op.scales) {
            Object.values(op.scales).forEach((s) => {
                if (s.ticks) s.ticks.color = c.ticks;
                if (s.grid) s.grid.color = c.grid;
            });
        }
        if (op.plugins?.legend?.labels) {
            op.plugins.legend.labels.color = c.ticks;
        }
        if (tipo === 'line' && chart.data.datasets?.[0]) {
            chart.data.datasets[0].backgroundColor = c.lineaFill;
        }
        if (tipo === 'estados' && chart.data.datasets?.[0]) {
            chart.data.datasets[0].borderColor = c.separador;
        }
        chart.update();
    });
}

// Convierte un timestamp ISO a clave local YYYY-MM-DD (evita el desfase de TZ
// de toISOString al agrupar ventas por día).
function claveDiaLocal(fecha) {
    const d = new Date(fecha);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
}

function formatoDia(d) {
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

// Serie de ingresos diarios (confirmados, sin cancelados) para los últimos N
// días, con ceros en los días sin ventas (para que el área se vea completa).
function serieIngresosDiarios(ordenes, dias = 30) {
    const hoy = new Date();
    const mapa = new Map();
    const etiquetas = [];
    for (let i = dias - 1; i >= 0; i--) {
        const d = new Date(hoy); d.setDate(hoy.getDate() - i);
        mapa.set(claveDiaLocal(d), 0);
        etiquetas.push(formatoDia(d));
    }
    for (const o of ordenes || []) {
        if (o.estado === 'Cancelado') continue;
        const clave = claveDiaLocal(o.created_at);
        if (mapa.has(clave)) mapa.set(clave, mapa.get(clave) + Number(o.total || 0));
    }
    return { etiquetas, valores: [...mapa.values()] };
}

// Delta % entre dos periodos. Devuelve { texto, clase } o null si no aplica.
// Si el periodo anterior era 0 (sin ventas) y hoy hay actividad, mostramos
// "Nuevo" en verde: son ingresos nuevos, no un crecimiento calculable.
function calcularDelta(actual, anterior) {
    if (!Number.isFinite(actual) || !Number.isFinite(anterior)) return null;
    if (anterior <= 0) {
        if (actual <= 0) return null;
        return { texto: '● Nuevo', clase: 'up', titulo: 'Sin ventas en el periodo anterior' };
    }
    const pct = ((actual - anterior) / anterior) * 100;
    if (Math.abs(pct) < 0.05) return null;
    const flecha = pct >= 0 ? '▲' : '▼';
    return {
        texto: `${flecha} ${Math.abs(pct).toFixed(0)} %`,
        clase: pct >= 0 ? 'up' : 'down',
        titulo: 'vs. los 30 días anteriores'
    };
}

function kpi(icono, valor, etiqueta, delta = null, clase = '') {
    // Ojo: el template usa `delta`, no `d`. Leer `d` acá (la const que se está
    // inicializando) es un TDZ: "Cannot access 'd' before initialization".
    const d = delta
        ? `<span class="kpi-delta ${esc(delta.clase)}" title="${esc(delta.titulo || 'vs. los 30 días anteriores')}">${esc(delta.texto)}</span>`
        : '';
    return `
        <div class="admin-stat ${esc(clase)}">
            <i class="fa-solid ${esc(icono)}"></i>
            <div><div class="valor">${valor}${d}</div><div class="etiqueta">${esc(etiqueta)}</div></div>
        </div>`;
}

// Contadores por estado (para el donut).
function conteoEstados(ordenes) {
    const conteo = { Pendiente: 0, Procesando: 0, Enviado: 0, Entregado: 0, Cancelado: 0 };
    for (const o of ordenes || []) {
        if (conteo[o.estado] !== undefined) conteo[o.estado]++;
    }
    return conteo;
}

function crearChart(canvasId, config, tipo = '') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof window.Chart === 'undefined') return null;
    const chart = new window.Chart(canvas, config);
    charts.push({ chart, tipo });
    return chart;
}

// Al cambiar el tema del panel (Configuración → Apariencia), los gráficos se
// recolorean en vivo sin recargar los datos.
window.addEventListener('lemora:tema-panel', reaplicarTemaCharts);

export async function renderizar(contenedor) {
    estadoCargando(contenedor, 'Reuniendo los datos de la tienda…');
    destruirCharts(); // descarta instancias de renders previos
    const sb = await clienteAdmin();

    const ahora = Date.now();
    const inicio30 = new Date(ahora - 30 * DIA_MS).toISOString();
    const inicio60 = new Date(ahora - 60 * DIA_MS).toISOString();
    const hace48h = new Date(ahora - 48 * HORA_MS).toISOString();

    const [
        statsProductos,
        stockBajo,
        agotados,
        pom,
        pendientesR,
        ordenes60,       // último 60 días: ingresos, deltas, donut, cupones
        ordenes30Items,  // último 30 días con items (top productos + categorías)
        ultimasOrdenes,
        reseñas
    ] = await Promise.all([
        Promise.all([
            sb.from('products').select('id', { count: 'exact', head: true }).eq('activo', true),
            sb.from('products').select('id', { count: 'exact', head: true })
        ]),
        sb.from('products').select('id, nombre, stock').gte('stock', 1).lt('stock', 5).order('stock', { ascending: true }).limit(8),
        sb.from('products').select('id', { count: 'exact', head: true }).eq('activo', true).eq('stock', 0),
        sb.from('orders').select('id', { count: 'exact', head: true }).eq('estado', 'Pendiente').lt('created_at', hace48h),
        sb.from('orders').select('id', { count: 'exact', head: true }).eq('estado', 'Pendiente'),
        sb.from('orders').select('total, estado, cupon, descuento, created_at').gte('created_at', inicio60)
            .order('created_at', { ascending: true }),
        sb.from('orders').select('created_at, order_items(quantity, product_id, nombre, products(nombre, categoria:categories(name)))')
            .gte('created_at', inicio30).neq('estado', 'Cancelado'),
        sb.from('orders').select('id, numero, cliente, total, estado, created_at')
            .order('created_at', { ascending: false }).limit(6),
        sb.from('reviews').select('nombre, valoracion, resena, fecha').eq('activo', true)
            .order('fecha', { ascending: false })
    ]);

    const [activosR, totalesR] = statsProductos;
    const activos = activosR.error ? 0 : (activosR.count ?? 0);
    const totales = totalesR.error ? 0 : (totalesR.count ?? 0);
    const agotadosN = agotados.error ? 0 : (agotados.count ?? 0);
    const pedidosColgados = pom.error ? 0 : (pom.count ?? 0);
    const pendientes = pendientesR.error ? 0 : (pendientesR.count ?? 0);

    // ---- Precálculo de métricas sobre la ventana de 60 días ----
    const ventana = (ordenes60.error ? [] : (ordenes60.data || []))
        .map((o) => ({ ...o, ts: Date.parse(o.created_at) || 0 }));

    const ingresos = (lista) => lista
        .filter((o) => o.estado !== 'Cancelado')
        .reduce((s, o) => s + Number(o.total || 0), 0);

    const ventana30 = ventana.filter((o) => o.ts >= Date.parse(inicio30));
    const ventanaPrev = ventana.filter((o) => o.ts < Date.parse(inicio30));

    const ingresos30 = ingresos(ventana30);
    const ingresosPrev = ingresos(ventanaPrev);
    const pedidos30 = ventana30.filter((o) => o.estado !== 'Cancelado').length;
    const pedidosPrev = ventanaPrev.filter((o) => o.estado !== 'Cancelado').length;
    const ticketPromedio = pedidos30 > 0 ? ingresos30 / pedidos30 : 0;

    const deltaIngresos = calcularDelta(ingresos30, ingresosPrev);
    const deltaPedidos = calcularDelta(pedidos30, pedidosPrev);
    const deltaTicket = calcularDelta(ticketPromedio, pedidosPrev > 0 ? ingresosPrev / pedidosPrev : 0);

    // ---- Cupones (últimos 30 días) ----
    const cupones = new Map(); // cupon -> { pedidos, descuento }
    for (const o of ventana30) {
        if (!o.cupon || o.cupon === 'NINGUNO') continue;
        const c = cupones.get(o.cupon) || { pedidos: 0, descuento: 0 };
        c.pedidos++;
        c.descuento += Number(o.descuento || 0);
        cupones.set(o.cupon, c);
    }
    const topCupones = [...cupones.entries()]
        .sort((a, b) => b[1].pedidos - a[1].pedidos)
        .slice(0, 5);

    // ---- Top productos y categorías (30 días, por cantidad vendida) ----
    const porProducto = new Map(); // clave -> { nombre, cantidad }
    const porCategoria = new Map(); // nombre -> cantidad
    const ordenes30ItemsOk = ordenes30Items.error ? [] : (ordenes30Items.data || []);
    for (const o of ordenes30ItemsOk) {
        for (const it of (o.order_items || [])) {
            const nombreProd = it.products?.nombre || it.nombre || 'Producto eliminado';
            const cat = it.products?.categoria?.name || 'Sin categoría';
            const qty = Number(it.quantity) || 0;

            const cl = it.product_id ?? nombreProd;
            const p = porProducto.get(cl) || { nombre: nombreProd, cantidad: 0 };
            p.nombre = nombreProd;
            p.cantidad += qty;
            porProducto.set(cl, p);

            porCategoria.set(cat, (porCategoria.get(cat) || 0) + qty);
        }
    }
    const topProductos = [...porProducto.values()]
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);
    const topCategorias = [...porCategoria.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    // ---- Reseñas: promedio + últimas 4 ----
    const reseñasActivas = reseñas.error ? [] : (reseñas.data || []);
    const valoracionPromedio = reseñasActivas.length
        ? reseñasActivas.reduce((s, r) => s + Number(r.valoracion || 0), 0) / reseñasActivas.length
        : 0;
    const ultimasResenas = reseñasActivas.slice(0, 4);

    const ordenes = ultimasOrdenes.error ? [] : (ultimasOrdenes.data || []);
    const bajoStock = stockBajo.error ? [] : (stockBajo.data || []);

    // ---- Alertas accionables ----
    const alertas = [];
    if (agotadosN > 0) {
        alertas.push({ clase: 'peligro', icono: 'fa-box-open', texto: `${agotadosN} producto${agotadosN === 1 ? '' : 's'} sin stock.`, enlace: '#/productos', enlaceTexto: 'Ir a productos' });
    }
    if (pedidosColgados > 0) {
        alertas.push({ clase: 'advertencia', icono: 'fa-clock', texto: `${pedidosColgados} pedido${pedidosColgados === 1 ? '' : 's'} pendiente${pedidosColgados === 1 ? '' : 's'} hace más de 48 h.`, enlace: '#/pedidos', enlaceTexto: 'Ir a pedidos' });
    }

    const hayVentas30 = ventana30.length > 0 && ingresos30 > 0;
    const hayChart = typeof window.Chart !== 'undefined';
    // Aviso que se muestra cuando Chart.js no cargó (p. ej. SRI/red bloqueó el
    // CDN): el resto del dashboard sigue funcionando sin gráficos.
    const sinChart = '<div class="admin-empty"><p>Los gráficos no están disponibles (no se pudo cargar Chart.js). El resto del panel funciona con normalidad.</p></div>';

    // ---- HTML del dashboard ----
    contenedor.innerHTML = `
        ${alertas.length ? `
        <div class="alertas-dashboard">
            ${alertas.map((a) => `
                <div class="alerta-item ${esc(a.clase)}">
                    <i class="fa-solid ${esc(a.icono)}"></i>
                    <p>${esc(a.texto)} <a href="${esc(a.enlace)}">${esc(a.enlaceTexto)}</a></p>
                </div>`).join('')}
        </div>` : ''}

        <div class="admin-grid">
            ${kpi('fa-sack-dollar', `$${formatearPrecio(ingresos30)}`, 'Ingresos últimos 30 días', deltaIngresos)}
            ${kpi('fa-cart-shopping', pedidos30, 'Pedidos últimos 30 días', deltaPedidos)}
            ${kpi('fa-receipt', pedidos30 ? `$${formatearPrecio(ticketPromedio)}` : '—', 'Ticket promedio', deltaTicket)}
            ${kpi('fa-box', activos, `Productos activos (${totales} totales)`)}
            ${kpi('fa-clock', pendientes, 'Pedidos pendientes', null, 'warning')}
            ${kpi('fa-star', reseñasActivas.length ? `★ ${valoracionPromedio.toFixed(1)}` : '—', `Valoración (${reseñasActivas.length} reseñas)`, null, 'success')}
        </div>

        <div class="admin-card">
            <h2>Ingresos últimos 30 días</h2>
            <p class="card-sub">Ventas diarias confirmadas (sin cancelados)</p>
            ${!hayVentas30
                ? '<div class="admin-empty"><p>Todavía no hay ventas en este periodo.</p></div>'
                : (hayChart
                    ? `<div class="admin-chart" role="img" aria-label="Gráfico de línea: ingresos diarios de los últimos 30 días"><canvas id="chart-ingresos"></canvas></div>`
                    : sinChart)}
        </div>

        <div class="dashboard-dos-col">
            <div class="admin-card">
                <h2>Pedidos por estado</h2>
                <p class="card-sub">Últimos 30 días</p>
                ${!hayVentas30
                    ? '<div class="admin-empty"><p>Todavía no hay pedidos en este periodo.</p></div>'
                    : (hayChart
                        ? `<div class="admin-chart" role="img" aria-label="Gráfico de torta: pedidos por estado"><canvas id="chart-estados"></canvas></div>`
                        : sinChart)}
            </div>
            <div class="admin-card">
                <h2>Top productos vendidos</h2>
                <p class="card-sub">Por cantidad, últimos 30 días</p>
                ${!topProductos.length
                    ? '<div class="admin-empty"><p>Sin ventas todavía.</p></div>'
                    : (hayChart
                        ? `<div class="admin-chart" role="img" aria-label="Gráfico de barras: productos más vendidos"><canvas id="chart-productos"></canvas></div>`
                        : sinChart)}
            </div>
        </div>

        <div class="dashboard-dos-col">
            <div class="admin-card">
                <h2>Ventas por categoría</h2>
                <p class="card-sub">Unidades, últimos 30 días</p>
                ${!topCategorias.length
                    ? '<div class="admin-empty"><p>Sin ventas todavía.</p></div>'
                    : (hayChart
                        ? `<div class="admin-chart" role="img" aria-label="Gráfico de barras: ventas por categoría"><canvas id="chart-categorias"></canvas></div>`
                        : sinChart)}
            </div>
            <div class="admin-card">
                <h2>Cupones usados</h2>
                <p class="card-sub">Últimos 30 días</p>
                ${tablaCupones(topCupones)}
            </div>
        </div>

        <div class="admin-card">
            <h2>Últimas órdenes</h2>
            <p class="card-sub">Los pedidos más recientes de la tienda</p>
            ${tablaOrdenes(ordenes)}
        </div>

        <div class="dashboard-dos-col">
            <div class="admin-card">
                <h2>Stock bajo</h2>
                <p class="card-sub">Productos con menos de 5 unidades disponibles</p>
                ${listaStockBajo(bajoStock)}
            </div>
            <div class="admin-card">
                <h2>Últimas reseñas</h2>
                <p class="card-sub">Testimonios recibidos</p>
                ${listaResenas(ultimasResenas)}
            </div>
        </div>
        `;

    // ---- Instanciar gráficos (solo si Chart.js cargó y hay datos) ----
    if (typeof window.Chart !== 'undefined' && hayVentas30) {
        const cc = coloresChart(); // colores de ejes/grid según tema actual
        const serie = serieIngresosDiarios(ventana30, 30);
        crearChart('chart-ingresos', {
            type: 'line',
            data: {
                labels: serie.etiquetas,
                datasets: [{
                    label: 'Ingresos',
                    data: serie.valores,
                    borderColor: COLORES.primario,
                    backgroundColor: cc.lineaFill,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` $${formatearPrecio(ctx.parsed.y || 0)}` } }
                },
                scales: {
                    x: { grid: { display: false, color: cc.grid }, ticks: { maxTicksLimit: 10, font: { size: 10 }, color: cc.ticks } },
                    y: { beginAtZero: true, grid: { color: cc.grid }, ticks: { callback: (v) => `$${formatearPrecio(v)}`, font: { size: 10 }, color: cc.ticks } }
                }
            }
        }, 'line');

        const conteo = conteoEstados(ventana30);
        const etiquetas = ESTADOS.filter((e) => conteo[e] > 0);
        crearChart('chart-estados', {
            type: 'doughnut',
            data: {
                labels: etiquetas,
                datasets: [{
                    data: etiquetas.map((e) => conteo[e]),
                    backgroundColor: etiquetas.map((e) => COLOR_ESTADO[e]),
                    borderWidth: 2,
                    borderColor: cc.separador
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 }, color: cc.ticks } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}` } }
                }
            }
        }, 'estados');

        crearChart('chart-productos', {
            type: 'bar',
            data: {
                labels: topProductos.map((p) => esc(p.nombre)),
                datasets: [{
                    label: 'Unidades',
                    data: topProductos.map((p) => p.cantidad),
                    backgroundColor: COLORES.primario,
                    borderRadius: 4,
                    maxBarThickness: 26
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false, labels: { font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x} un.` } }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: cc.grid }, ticks: { precision: 0, font: { size: 10 }, color: cc.ticks } },
                    y: { grid: { display: false }, ticks: { font: { size: 11 }, color: cc.ticks } }
                }
            }
        });

        crearChart('chart-categorias', {
            type: 'bar',
            data: {
                labels: topCategorias.map(([nombre]) => esc(nombre)),
                datasets: [{
                    label: 'Unidades',
                    data: topCategorias.map(([, qty]) => qty),
                    backgroundColor: COLORES.exito,
                    borderRadius: 4,
                    maxBarThickness: 34
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} un.` } }
                },
                scales: {
                    x: { grid: { display: false, color: cc.grid }, ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0, color: cc.ticks } },
                    y: { beginAtZero: true, grid: { color: cc.grid }, ticks: { precision: 0, font: { size: 10 }, color: cc.ticks } }
                }
            }
        });
    }
}

function tablaCupones(topCupones) {
    if (!topCupones.length) {
        return '<div class="admin-empty"><p>Ningún cupón usado en este periodo.</p></div>';
    }
    return `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead><tr><th>Cupón</th><th>Pedidos</th><th>Descuento</th></tr></thead>
                <tbody>
                    ${topCupones.map(([nombre, c]) => `
                        <tr>
                            <td data-label="Cupón"><span class="estado-badge estado-cupon">${esc(nombre)}</span></td>
                            <td data-label="Pedidos">${esc(c.pedidos)}</td>
                            <td data-label="Descuento">$${formatearPrecio(c.descuento)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}

function tablaOrdenes(ordenes) {
    if (!ordenes.length) {
        return '<div class="admin-empty"><p>Todavía no hay pedidos.</p></div>';
    }
    return `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr>
                        <th>Número</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${ordenes.map((o) => `
                        <tr>
                            <td data-label="Número"><strong>${esc(o.numero)}</strong></td>
                            <td data-label="Fecha">${esc(formatearFechaHora(o.created_at))}</td>
                            <td data-label="Cliente">${esc(extraerClientes(o)?.nombre || '—')}</td>
                            <td data-label="Total">$${formatearPrecio(o.total)}</td>
                            <td data-label="Estado"><span class="estado-badge estado-${esc(o.estado.toLowerCase())}">${esc(o.estado)}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}

function extraerClientes(o) {
    if (!o.cliente) return null;
    if (typeof o.cliente === 'string') {
        try { return JSON.parse(o.cliente); } catch { return null; }
    }
    return o.cliente;
}

function listaStockBajo(lista) {
    if (!lista.length) {
        return '<div class="admin-empty"><p>Ningún producto necesita reposición. 🎉</p></div>';
    }
    return `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead><tr><th>Producto</th><th>Stock</th></tr></thead>
                <tbody>
                    ${lista.map((p) => `
                        <tr>
                            <td data-label="Producto">${esc(p.nombre)}</td>
                            <td data-label="Stock"><span class="admin-stock-bajo">${esc(p.stock)}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}

function listaResenas(lista) {
    if (!lista.length) {
        return '<div class="admin-empty"><p>Todavía no hay reseñas.</p></div>';
    }
    return `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead><tr><th>Cliente</th><th>Valoración</th><th>Fecha</th></tr></thead>
                <tbody>
                    ${lista.map((r) => `
                        <tr>
                            <td data-label="Cliente">${esc(r.nombre)}</td>
                            <td data-label="Valoración">${'★'.repeat(r.valoracion || 0)}${'☆'.repeat(5 - (r.valoracion || 0))}</td>
                            <td data-label="Fecha">${esc(formatearFechaHora(r.fecha))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}