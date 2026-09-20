// pedidos.js — Gestión de pedidos: listado, filtros, detalle y cambio de estado.

import { $, esc, toast, estadoCargando, estadoVacio, formatearPrecio, formatearFechaHora } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

const ESTADOS = ['Pendiente', 'Procesando', 'Enviado', 'Entregado', 'Cancelado'];

let todos = [];
let filtroEstado = 'Todos';
let busqueda = '';
let expandidoId = null;

export async function renderizar(contenedor) {
    estadoCargando(contenedor, 'Cargando pedidos…');
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('orders')
        .select('id, numero, token, cliente, subtotal, descuento, porcentaje, cupon, total, estado, created_at, items:order_items(product_id, nombre, variante_texto, quantity, precio_unitario)')
        .order('created_at', { ascending: false })
        .limit(300);

    if (error) throw error;
    todos = data || [];

    expandidoId = null;
    pintar(contenedor);
}

function pintar(contenedor) {
    const filtrados = todos.filter((o) => {
        const porEstado = filtroEstado === 'Todos' || o.estado === filtroEstado;
        const busca = busqueda.toLowerCase();
        const porBusqueda = !busca
            || String(o.numero || '').toLowerCase().includes(busca)
            || String(clienteDe(o)?.nombre || '').toLowerCase().includes(busca);
        return porEstado && porBusqueda;
    });

    const contar = (estado) => estado === 'Todos'
        ? todos.length
        : todos.filter((o) => o.estado === estado).length;

    contenedor.innerHTML = `
        <div class="admin-filtros">
            <button type="button" class="admin-chip ${filtroEstado === 'Todos' ? 'active' : ''}" data-estado="Todos">Todos (${contar('Todos')})</button>
            ${ESTADOS.map((e) => `<button type="button" class="admin-chip ${filtroEstado === e ? 'active' : ''}" data-estado="${esc(e)}">${esc(e)} (${contar(e)})</button>`).join('')}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
            <div style="flex:1; min-width:220px; max-width:360px;">
                <input type="text" id="pedBuscar" placeholder="Buscar por número o cliente…"
                       value="${esc(busqueda)}"
                       style="width:100%; padding:0.55rem 0.7rem; border:1px solid var(--border); border-radius:8px; font-family:inherit;">
            </div>
            <p style="color:var(--text-muted); margin:0; font-size:0.85rem;">${filtrados.length} pedido(s)</p>
        </div>

        ${filtrados.length === 0 ? '<div class="admin-card"><div class="admin-empty"><i class="fa-solid fa-receipt"></i><h3>Sin pedidos</h3><p>No se encontraron pedidos con estos filtros.</p></div></div>' : `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr>
                        <th></th><th>Número</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Cupón</th><th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtrados.map((o) => filaPedido(o)).join('')}
                </tbody>
            </table>
        </div>`}
    `;

    contenedor.querySelectorAll('.admin-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            filtroEstado = btn.dataset.estado;
            pintar(contenedor);
        });
    });

    const buscarInput = $('#pedBuscar');
    if (buscarInput) {
        buscarInput.addEventListener('input', () => {
            busqueda = buscarInput.value.trim();
            pintar(contenedor);
        });
        buscarInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') pintar(contenedor);
        });
    }

    contenedor.querySelectorAll('[data-expandir]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.dataset.expandir);
            expandidoId = expandidoId === id ? null : id;
            pintar(contenedor);
        });
    });

    contenedor.querySelectorAll('[data-estado-cambiar]').forEach((select) => {
        select.addEventListener('change', async () => {
            const id = Number(select.dataset.estadoCambiar);
            const nuevo = select.value;
            const anterior = select.dataset.anterior;
            try {
                const sb = await clienteAdmin();
                const { error } = await sb.from('orders').update({ estado: nuevo }).eq('id', id);
                if (error) throw error;
                const orden = todos.find((o) => o.id === id);
                if (orden) orden.estado = nuevo;
                seleccionarAjustar(select, nuevo);
                toast(`Pedido ${esc(orden?.numero || '')} → ${esc(nuevo)}`);
                pintar($('#adminView'));
            } catch (error) {
                toast(`No se pudo actualizar el estado: ${error.message}`, 'error');
                seleccionarAjustar(select, anterior);
            }
        });
    });
}

function seleccionarAjustar(select, valor) {
    select.value = valor;
    select.dataset.anterior = valor;
}

function clienteDe(o) {
    if (!o.cliente) return null;
    if (typeof o.cliente === 'string') {
        try { return JSON.parse(o.cliente); } catch { return null; }
    }
    return o.cliente;
}

function filaPedido(o) {
    const cliente = clienteDe(o);
    const items = Array.isArray(o.items) ? o.items : [];
    const cantidad = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const expandido = expandidoId === o.id;

    return `
        <tr ${expandido ? 'class="admin-fila-activa"' : ''}>
            <td>
                <button type="button" class="btn btn-sm btn-outline" data-expandir="${esc(o.id)}" aria-label="Ver detalle">
                    <i class="fa-solid ${expandido ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                </button>
            </td>
            <td><strong>${esc(o.numero)}</strong></td>
            <td>${esc(formatearFechaHora(o.created_at))}</td>
            <td>${esc(cliente?.nombre || '—')}</td>
            <td>${esc(cantidad)}</td>
            <td><strong>$${formatearPrecio(o.total)}</strong>
                ${o.descuento > 0 ? `<br><span style="color:var(--success); font-size:0.75rem;">-$${formatearPrecio(o.descuento)}</span>` : ''}
            </td>
            <td>${o.cupon && o.cupon !== 'NINGUNO'
                ? `<span class="estado-badge estado-pendiente">${esc(o.cupon)}</span>`
                : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td>
                <select class="admin-estado-select" data-estado-cambiar="${esc(o.id)}" data-anterior="${esc(o.estado)}"
                        style="padding:0.4rem 0.6rem; border:1px solid var(--border); border-radius:8px; font-family:inherit; font-size:0.8rem;">
                    ${ESTADOS.map((e) => `<option value="${esc(e)}" ${e === o.estado ? 'selected' : ''}>${esc(e)}</option>`).join('')}
                </select>
            </td>
        </tr>
        ${expandido ? `
        <tr class="admin-fila-expandida">
            <td colspan="8">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.25rem;" class="pedido-detalle-grid">
                    <div>
                        <h4 style="margin:0 0 0.7rem; font-size:0.9rem;">Productos</h4>
                        <div class="admin-pedido-items">
                            ${items.map((i) => `
                                <div style="display:flex; justify-content:space-between; gap:1rem; padding:0.3rem 0; border-bottom:1px dashed var(--border);">
                                    <span>${esc(i.quantity)} × ${esc(i.nombre)}
                                        ${i.variante_texto ? `<span style="color:var(--text-muted); font-size:0.75rem;">(${esc(i.variante_texto)})</span>` : ''}
                                    </span>
                                    <span>$${formatearPrecio(Number(i.precio_unitario) * Number(i.quantity))}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div style="margin-top:0.7rem; font-size:0.85rem; display:flex; flex-direction:column; gap:0.2rem;">
                            <span>Subtotal: <strong>$${formatearPrecio(o.subtotal)}</strong></span>
                            ${o.descuento > 0 ? `<span>Descuento (${esc(o.porcentaje)}%): <strong style="color:var(--success);">-$${formatearPrecio(o.descuento)}</strong></span>` : ''}
                            <span>Total final: <strong>$${formatearPrecio(o.total)}</strong></span>
                        </div>
                    </div>
                    <div>
                        <h4 style="margin:0 0 0.7rem; font-size:0.9rem;">Datos del cliente</h4>
                        ${cliente ? `
                        <div class="admin-pedido-cliente">
                            <strong>${esc(cliente.nombre || '')}</strong>
                            ${cliente.email ? `<br>📧 ${esc(cliente.email)}` : ''}
                            ${cliente.telefono ? `<br>📱 ${esc(cliente.telefono)}` : ''}
                            ${cliente.direccion ? `<br>📍 ${esc(cliente.direccion)}${cliente.ciudad ? `, ${esc(cliente.ciudad)}` : ''}${cliente.provincia ? `, ${esc(cliente.provincia)}` : ''}` : ''}
                            ${cliente.codigoPostal ? `<br>CP: ${esc(cliente.codigoPostal)}` : ''}
                            ${cliente.notas ? `<br><br>📝 ${esc(cliente.notas)}` : ''}
                        </div>` : '<p style="color:var(--text-muted);">Sin datos del cliente.</p>'}
                    </div>
                </div>
            </td>
        </tr>` : ''}
    `;
}