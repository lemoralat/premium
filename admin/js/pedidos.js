// pedidos.js — Gestión de pedidos: listado, filtros, detalle y cambio de estado.

import { $, esc, toast, estadoCargando, estadoVacio, confirmarBorrado, formatearPrecio, formatearFechaHora } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

const ESTADOS = ['Pendiente', 'Procesando', 'Enviado', 'Entregado', 'Cancelado'];

let todos = [];
let filtroEstado = 'Todos';
let busqueda = '';
let expandidoId = null;
let seleccionados = new Set();

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
    seleccionados.clear();
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

    const conSeleccion = seleccionados.size > 0;
    const todosVisibles = filtrados.length > 0 && filtrados.every((o) => seleccionados.has(o.id));
    const algunosVisibles = !todosVisibles && filtrados.some((o) => seleccionados.has(o.id));

    contenedor.innerHTML = `
        <div class="admin-filtros admin-filtros-chips">
            <button type="button" class="admin-chip ${filtroEstado === 'Todos' ? 'active' : ''}" data-estado="Todos">Todos (${contar('Todos')})</button>
            ${ESTADOS.map((e) => `<button type="button" class="admin-chip ${filtroEstado === e ? 'active' : ''}" data-estado="${esc(e)}">${esc(e)} (${contar(e)})</button>`).join('')}
        </div>

        <div class="admin-toolbar">
            <input type="text" id="pedBuscar" class="admin-busqueda" placeholder="Buscar por número o cliente…"
                   value="${esc(busqueda)}">
            <p>${filtrados.length} pedido(s)</p>
        </div>

        ${conSeleccion ? `
        <div class="admin-bulkbar" role="status">
            <span class="admin-bulkbar-info"><i class="fa-solid fa-square-check"></i> <strong>${seleccionados.size}</strong> pedido(s) seleccionado(s)</span>
            <div class="admin-bulkbar-acciones">
                <button type="button" class="btn btn-sm btn-outline" id="btnLimpiarSeleccion">Quitar selección</button>
                <button type="button" class="btn btn-sm btn-danger" id="btnBorrarSeleccion"><i class="fa-solid fa-trash-can"></i> Borrar seleccionados</button>
            </div>
        </div>` : ''}

        ${filtrados.length === 0 ? '<div class="admin-card"><div class="admin-empty"><i class="fa-solid fa-receipt"></i><h3>Sin pedidos</h3><p>No se encontraron pedidos con estos filtros.</p></div></div>' : `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr>
                        <th class="th-check"><label class="admin-check" title="Seleccionar todos los visibles"><input type="checkbox" id="selTodos" aria-label="Seleccionar todos los visibles" ${todosVisibles ? 'checked' : ''}></label></th>
                        <th></th><th>Número</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Cupón</th><th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtrados.map((o) => filaPedido(o)).join('')}
                </tbody>
            </table>
        </div>`}
    `;

    const selTodos = $('#selTodos');
    if (selTodos) selTodos.indeterminate = algunosVisibles;

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

    // Selección de filas (checkbox individual)
    contenedor.querySelectorAll('[data-seleccion]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const id = Number(cb.dataset.seleccion);
            if (cb.checked) seleccionados.add(id);
            else seleccionados.delete(id);
            pintar(contenedor);
        });
    });

    // Seleccionar / deseleccionar todos los visibles
    const selTodosCheck = $('#selTodos');
    if (selTodosCheck) {
        selTodosCheck.addEventListener('change', () => {
            const ids = filtrados.map((o) => o.id);
            if (selTodosCheck.checked) ids.forEach((id) => seleccionados.add(id));
            else ids.forEach((id) => seleccionados.delete(id));
            pintar(contenedor);
        });
    }

    // Borrar un pedido (ícono papelera de la fila)
    contenedor.querySelectorAll('[data-borrar-uno]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.borrarUno);
            const orden = todos.find((o) => o.id === id);
            const cliente = clienteDe(orden);
            const ok = await confirmarBorrado(
                `¿Eliminar el pedido <strong>${esc(orden?.numero || '')}</strong> de ${esc(cliente?.nombre || '—')}?`
                + '<br><br>Se borrarán también sus líneas de productos. Esta acción no se puede deshacer.'
            );
            if (!ok) return;
            try {
                const sb = await clienteAdmin();
                const { data: n, error } = await sb.rpc('borrar_pedidos', { p_ids: [id] });
                if (error) throw error;
                todos = todos.filter((o) => o.id !== id);
                seleccionados.delete(id);
                if (expandidoId === id) expandidoId = null;
                toast(`Pedido ${esc(orden?.numero || '')} eliminado`);
                pintar(contenedor);
            } catch (error) {
                toast(`No se pudo eliminar el pedido: ${error.message}`, 'error');
            }
        });
    });

    // Barra de lote: quitar selección
    const btnLimpiarSel = $('#btnLimpiarSeleccion');
    if (btnLimpiarSel) {
        btnLimpiarSel.addEventListener('click', () => {
            seleccionados.clear();
            pintar(contenedor);
        });
    }

    // Barra de lote: borrar seleccionados
    const btnBorrarSel = $('#btnBorrarSeleccion');
    if (btnBorrarSel) {
        btnBorrarSel.addEventListener('click', async () => {
            const ids = [...seleccionados];
            const ok = await confirmarBorrado(
                `¿Eliminar <strong>${ids.length}</strong> pedido(s)?`
                + '<br><br>Se borrarán también sus líneas de productos. Esta acción no se puede deshacer.'
            );
            if (!ok) return;
            try {
                const sb = await clienteAdmin();
                const { data: n, error } = await sb.rpc('borrar_pedidos', { p_ids: ids });
                if (error) throw error;
                const eliminados = new Set(ids);
                const estabaExpandido = [...eliminados].some((id) => expandidoId === id);
                todos = todos.filter((o) => !eliminados.has(o.id));
                seleccionados.clear();
                if (estabaExpandido) expandidoId = null;
                toast(`${Number(n) || ids.length} pedido(s) eliminado(s)`);
                pintar(contenedor);
            } catch (error) {
                toast(`No se pudo eliminar: ${error.message}`, 'error');
            }
        });
    }
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
            <td class="td-check">
                <label class="admin-check" title="Seleccionar este pedido">
                    <input type="checkbox" data-seleccion="${esc(o.id)}" aria-label="Seleccionar pedido ${esc(o.numero)}" ${seleccionados.has(o.id) ? 'checked' : ''}>
                </label>
            </td>
            <td class="td-expandir">
                <div class="pedido-acciones">
                    <button type="button" class="btn btn-sm btn-outline" data-expandir="${esc(o.id)}" aria-label="Ver detalle">
                        <i class="fa-solid ${expandido ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" data-borrar-uno="${esc(o.id)}" aria-label="Eliminar pedido ${esc(o.numero)}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
            <td data-label="Número"><strong>${esc(o.numero)}</strong></td>
            <td data-label="Fecha">${esc(formatearFechaHora(o.created_at))}</td>
            <td data-label="Cliente">${esc(cliente?.nombre || '—')}</td>
            <td data-label="Productos">${esc(cantidad)}</td>
            <td data-label="Total"><strong>$${formatearPrecio(o.total)}</strong>
                ${o.descuento > 0 ? `<br><span style="color:var(--success); font-size:0.75rem;">-$${formatearPrecio(o.descuento)}</span>` : ''}
            </td>
            <td data-label="Cupón">${o.cupon && o.cupon !== 'NINGUNO'
                ? `<span class="estado-badge estado-pendiente">${esc(o.cupon)}</span>`
                : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td data-label="Estado">
                <select class="admin-estado-select" data-estado-cambiar="${esc(o.id)}" data-anterior="${esc(o.estado)}">
                    ${ESTADOS.map((e) => `<option value="${esc(e)}" ${e === o.estado ? 'selected' : ''}>${esc(e)}</option>`).join('')}
                </select>
            </td>
        </tr>
        ${expandido ? `
        <tr class="admin-fila-expandida">
            <td colspan="9">
                <div class="pedido-detalle-grid">
                    <div>
                        <h4 style="margin:0 0 0.7rem; font-size:0.9rem;">Productos</h4>
                        <div class="admin-pedido-items">
                            ${items.map((i) => `
                                <div class="admin-pedido-item">
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