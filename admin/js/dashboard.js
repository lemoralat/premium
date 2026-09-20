// dashboard.js — Resumen general del panel: métricas, últimas órdenes y stock bajo.

import { $, esc, formatearPrecio, formatearFechaHora, estadoCargando } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

export async function renderizar(contenedor) {
    estadoCargando(contenedor, 'Reuniendo los datos de la tienda…');
    const sb = await clienteAdmin();

    const inicioMes = new Date(Date.now() - 30 * 86400000).toISOString();

    const [statsProductos, stockBajo, pedidosPend, ingresosMes, ultimasOrdenes, ultimasResenas] = await Promise.all([
        Promise.all([
            sb.from('products').select('id', { count: 'exact', head: true }).eq('activo', true),
            sb.from('products').select('id', { count: 'exact', head: true })
        ]),
        sb.from('products').select('id, nombre, stock').gte('stock', 1).lt('stock', 5).order('stock', { ascending: true }).limit(8),
        sb.from('orders').select('id', { count: 'exact', head: true }).eq('estado', 'Pendiente'),
        sb.from('orders').select('total').gte('created_at', inicioMes).neq('estado', 'Cancelado'),
        sb.from('orders').select('id, numero, cliente, total, estado, created_at')
            .order('created_at', { ascending: false }).limit(6),
        sb.from('reviews').select('id, nombre, valoracion, fecha').eq('activo', true)
            .order('fecha', { ascending: false }).limit(4)
    ]);

    const [activosR, totalesR] = statsProductos;
    const activos = activosR.error ? 0 : (activosR.count ?? 0);
    const totales = totalesR.error ? 0 : (totalesR.count ?? 0);

    const pendientes = pedidosPend.error ? 0 : (pedidosPend.count ?? 0);

    const ingresos = ingresosMes.error ? 0 : (ingresosMes.data || []).reduce((s, o) => s + Number(o.total || 0), 0);

    const ordenes = ultimasOrdenes.error ? [] : (ultimasOrdenes.data || []);
    const reseñas = ultimasResenas.error ? [] : (ultimasResenas.data || []);
    const bajoStock = stockBajo.error ? [] : (stockBajo.data || []);

    contenedor.innerHTML = `
        <div class="admin-grid">
            <div class="admin-stat">
                <i class="fa-solid fa-box"></i>
                <div><div class="valor">${esc(activos)}</div><div class="etiqueta">Productos activos (${esc(totales)} totales)</div></div>
            </div>
            <div class="admin-stat warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <div><div class="valor">${esc(bajoStock.length)}</div><div class="etiqueta">Stock bajo (menos de 5)</div></div>
            </div>
            <div class="admin-stat">
                <i class="fa-solid fa-clock"></i>
                <div><div class="valor">${esc(pendientes)}</div><div class="etiqueta">Pedidos pendientes</div></div>
            </div>
            <div class="admin-stat success">
                <i class="fa-solid fa-sack-dollar"></i>
                <div><div class="valor">$${formatearPrecio(ingresos)}</div><div class="etiqueta">Ingresos últimos 30 días</div></div>
            </div>
        </div>

        <div class="admin-card">
            <h2>Últimas órdenes</h2>
            <p class="card-sub">Los pedidos más recientes de la tienda</p>
            ${tablaOrdenes(ordenes)}
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.25rem;" class="dashboard-dos-col">
            <div class="admin-card">
                <h2>Stock bajo</h2>
                <p class="card-sub">Productos con menos de 5 unidades disponibles</p>
                ${listaStockBajo(bajoStock)}
            </div>
            <div class="admin-card">
                <h2>Últimas reseñas</h2>
                <p class="card-sub">Testimonios recibidos</p>
                ${listaResenas(reseñas)}
            </div>
        </div>
        `;
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
                            <td><strong>${esc(o.numero)}</strong></td>
                            <td>${esc(formatearFechaHora(o.created_at))}</td>
                            <td>${esc(extraerClientes(o)?.nombre || '—')}</td>
                            <td>$${formatearPrecio(o.total)}</td>
                            <td><span class="estado-badge estado-${esc(o.estado.toLowerCase())}">${esc(o.estado)}</span></td>
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
                            <td>${esc(p.nombre)}</td>
                            <td><span class="admin-stock-bajo">${esc(p.stock)}</span></td>
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
                            <td>${esc(r.nombre)}</td>
                            <td>${'★'.repeat(r.valoracion)}${'☆'.repeat(5 - r.valoracion)}</td>
                            <td>${esc(formatearFechaHora(r.fecha))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}