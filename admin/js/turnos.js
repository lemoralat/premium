// turnos.js — Gestión de solicitudes de turno: listado, filtros, detalle,
// cambio de estado y borrado. Espejo simplificado de pedidos.js: un turno no
// tiene montos ni cupón, pero sí fecha/hora preferidas y un servicio opcional.

import { $, esc, toast, estadoCargando, confirmarBorrado, formatearFechaHora } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

const ESTADOS = ['Pendiente', 'Confirmado', 'Realizado', 'Cancelado'];

let todos = [];
let filtroEstado = 'Todos';
let busqueda = '';
let expandidoId = null;
let seleccionados = new Set();

export async function renderizar(contenedor) {
    estadoCargando(contenedor, 'Cargando turnos…');
    const sb = await clienteAdmin();

    // El alta entra solo por RPC (insertar_turno); acá se lee y se administra.
    const { data, error } = await sb.from('turnos')
        .select('id, numero, token, cliente, fecha, hora, producto_ref, notas, estado, created_at')
        .order('created_at', { ascending: false })
        .limit(300);

    if (error) throw error;
    todos = data || [];

    expandidoId = null;
    seleccionados.clear();
    pintar(contenedor);
}

function pintar(contenedor) {
    const filtrados = todos.filter((t) => {
        const porEstado = filtroEstado === 'Todos' || t.estado === filtroEstado;
        const busca = busqueda.toLowerCase();
        const porBusqueda = !busca
            || String(t.numero || '').toLowerCase().includes(busca)
            || String(clienteDe(t)?.nombre || '').toLowerCase().includes(busca);
        return porEstado && porBusqueda;
    });

    const contar = (estado) => estado === 'Todos'
        ? todos.length
        : todos.filter((t) => t.estado === estado).length;

    const conSeleccion = seleccionados.size > 0;
    const todosVisibles = filtrados.length > 0 && filtrados.every((t) => seleccionados.has(t.id));
    const algunosVisibles = !todosVisibles && filtrados.some((t) => seleccionados.has(t.id));

    contenedor.innerHTML = `
        <div class="admin-filtros admin-filtros-chips">
            <button type="button" class="admin-chip ${filtroEstado === 'Todos' ? 'active' : ''}" data-estado="Todos">Todos (${contar('Todos')})</button>
            ${ESTADOS.map((e) => `<button type="button" class="admin-chip ${filtroEstado === e ? 'active' : ''}" data-estado="${esc(e)}">${esc(e)} (${contar(e)})</button>`).join('')}
        </div>

        <div class="admin-toolbar">
            <input type="text" id="turnoBuscar" class="admin-busqueda" placeholder="Buscar por número o cliente…"
                   value="${esc(busqueda)}">
            <p>${filtrados.length} solicitud(es)</p>
        </div>

        ${conSeleccion ? `
        <div class="admin-bulkbar" role="status">
            <span class="admin-bulkbar-info"><i class="fa-solid fa-square-check"></i> <strong>${seleccionados.size}</strong> solicitud(es) seleccionada(s)</span>
            <div class="admin-bulkbar-acciones">
                <button type="button" class="btn btn-sm btn-outline" id="btnLimpiarSeleccionTurnos">Quitar selección</button>
                <button type="button" class="btn btn-sm btn-danger" id="btnBorrarSeleccionTurnos"><i class="fa-solid fa-trash-can"></i> Borrar seleccionadas</button>
            </div>
        </div>` : ''}

        ${filtrados.length === 0 ? '<div class="admin-card"><div class="admin-empty"><i class="fa-solid fa-calendar-check"></i><h3>Sin solicitudes de turno</h3><p>No se encontraron solicitudes con estos filtros.</p></div></div>' : `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr>
                        <th class="th-check"><label class="admin-check" title="Seleccionar todos los visibles"><input type="checkbox" id="selTodosTurnos" aria-label="Seleccionar todos los visibles" ${todosVisibles ? 'checked' : ''}></label></th>
                        <th></th><th>Número</th><th>Recibida</th><th>Cliente</th><th>Cita solicitada</th><th>Servicio</th><th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtrados.map((t) => filaTurno(t)).join('')}
                </tbody>
            </table>
        </div>`}
    `;

    const selTodos = $('#selTodosTurnos');
    if (selTodos) selTodos.indeterminate = algunosVisibles;

    contenedor.querySelectorAll('.admin-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            filtroEstado = btn.dataset.estado;
            pintar(contenedor);
        });
    });

    const buscarInput = $('#turnoBuscar');
    if (buscarInput) {
        buscarInput.addEventListener('input', () => {
            busqueda = buscarInput.value.trim();
            pintar(contenedor);
        });
        buscarInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') pintar(contenedor);
        });
    }

    contenedor.querySelectorAll('[data-expandir-turno]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.dataset.expandirTurno);
            expandidoId = expandidoId === id ? null : id;
            pintar(contenedor);
        });
    });

    contenedor.querySelectorAll('[data-estado-cambiar-turno]').forEach((select) => {
        select.addEventListener('change', async () => {
            const id = Number(select.dataset.estadoCambiarTurno);
            const nuevo = select.value;
            const anterior = select.dataset.anterior;
            try {
                const sb = await clienteAdmin();
                const { error } = await sb.from('turnos').update({ estado: nuevo }).eq('id', id);
                if (error) throw error;
                const turno = todos.find((t) => t.id === id);
                if (turno) turno.estado = nuevo;
                seleccionarAjustar(select, nuevo);
                toast(`Turno ${esc(turno?.numero || '')} → ${esc(nuevo)}`);
                pintar($('#adminView'));
            } catch (error) {
                toast(`No se pudo actualizar el estado: ${error.message}`, 'error');
                seleccionarAjustar(select, anterior);
            }
        });
    });

    contenedor.querySelectorAll('[data-seleccion-turno]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const id = Number(cb.dataset.seleccionTurno);
            if (cb.checked) seleccionados.add(id);
            else seleccionados.delete(id);
            pintar(contenedor);
        });
    });

    const selTodosCheck = $('#selTodosTurnos');
    if (selTodosCheck) {
        selTodosCheck.addEventListener('change', () => {
            const ids = filtrados.map((t) => t.id);
            if (selTodosCheck.checked) ids.forEach((id) => seleccionados.add(id));
            else ids.forEach((id) => seleccionados.delete(id));
            pintar(contenedor);
        });
    }

    // Borrar una solicitud (ícono papelera de la fila). El borrado entra por la
    // RPC borrar_turnos (la escritura directa está revocada, como en pedidos).
    contenedor.querySelectorAll('[data-borrar-uno-turno]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.borrarUnoTurno);
            const turno = todos.find((t) => t.id === id);
            const cliente = clienteDe(turno);
            const ok = await confirmarBorrado(
                `¿Eliminar la solicitud <strong>${esc(turno?.numero || '')}</strong> de ${esc(cliente?.nombre || '—')}?`
                + '<br><br>Esta acción no se puede deshacer.'
                , { html: true }
            );
            if (!ok) return;
            try {
                const sb = await clienteAdmin();
                const { error } = await sb.rpc('borrar_turnos', { p_ids: [id] });
                if (error) throw error;
                todos = todos.filter((t) => t.id !== id);
                seleccionados.delete(id);
                if (expandidoId === id) expandidoId = null;
                toast(`Turno ${esc(turno?.numero || '')} eliminado`);
                pintar(contenedor);
            } catch (error) {
                toast(`No se pudo eliminar la solicitud: ${error.message}`, 'error');
            }
        });
    });

    const btnLimpiarSel = $('#btnLimpiarSeleccionTurnos');
    if (btnLimpiarSel) {
        btnLimpiarSel.addEventListener('click', () => {
            seleccionados.clear();
            pintar(contenedor);
        });
    }

    const btnBorrarSel = $('#btnBorrarSeleccionTurnos');
    if (btnBorrarSel) {
        btnBorrarSel.addEventListener('click', async () => {
            const ids = [...seleccionados];
            const ok = await confirmarBorrado(
                `¿Eliminar <strong>${ids.length}</strong> solicitud(es)?`
                + '<br><br>Esta acción no se puede deshacer.'
                , { html: true }
            );
            if (!ok) return;
            try {
                const sb = await clienteAdmin();
                const { data: n, error } = await sb.rpc('borrar_turnos', { p_ids: ids });
                if (error) throw error;
                const eliminados = new Set(ids);
                const estabaExpandido = [...eliminados].some((id) => expandidoId === id);
                todos = todos.filter((t) => !eliminados.has(t.id));
                seleccionados.clear();
                if (estabaExpandido) expandidoId = null;
                toast(`${Number(n) || ids.length} solicitud(es) eliminada(s)`);
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

function clienteDe(t) {
    if (!t.cliente) return null;
    if (typeof t.cliente === 'string') {
        try { return JSON.parse(t.cliente); } catch { return null; }
    }
    return t.cliente;
}

function filaTurno(t) {
    const cliente = clienteDe(t);
    const expandido = expandidoId === t.id;

    return `
        <tr ${expandido ? 'class="admin-fila-activa"' : ''}>
            <td class="td-check">
                <label class="admin-check" title="Seleccionar esta solicitud">
                    <input type="checkbox" data-seleccion-turno="${esc(t.id)}" aria-label="Seleccionar turno ${esc(t.numero)}" ${seleccionados.has(t.id) ? 'checked' : ''}>
                </label>
            </td>
            <td class="td-expandir">
                <div class="pedido-acciones">
                    <button type="button" class="btn btn-sm btn-outline" data-expandir-turno="${esc(t.id)}" aria-label="Ver detalle">
                        <i class="fa-solid ${expandido ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" data-borrar-uno-turno="${esc(t.id)}" aria-label="Eliminar turno ${esc(t.numero)}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
            <td data-label="Número"><strong>${esc(t.numero)}</strong></td>
            <td data-label="Recibida">${esc(formatearFechaHora(t.created_at))}</td>
            <td data-label="Cliente">${esc(cliente?.nombre || '—')}</td>
            <td data-label="Cita solicitada">
                ${esc(t.fecha || '—')}${t.hora ? ` <span style="color:var(--text-muted);">· ${esc(t.hora)}</span>` : ''}
            </td>
            <td data-label="Servicio">
                ${servicioDe(t)
                    ? `<span class="estado-badge estado-pendiente">${esc(servicioDe(t)?.nombre || '')}</span>`
                    : '<span style="color:var(--text-muted);">—</span>'}
            </td>
            <td data-label="Estado">
                <select class="admin-estado-select" data-estado-cambiar-turno="${esc(t.id)}" data-anterior="${esc(t.estado)}">
                    ${ESTADOS.map((e) => `<option value="${esc(e)}" ${e === t.estado ? 'selected' : ''}>${esc(e)}</option>`).join('')}
                </select>
            </td>
        </tr>
        ${expandido ? `
        <tr class="admin-fila-expandida">
            <td colspan="8">
                <div class="pedido-detalle-grid">
                    <div>
                        <h4 style="margin:0 0 0.7rem; font-size:0.9rem;">Solicitud</h4>
                        <div style="display:flex; flex-direction:column; gap:0.3rem; font-size:0.85rem;">
                            <span>📅 Fecha preferida: <strong>${esc(t.fecha || '—')}</strong></span>
                            ${t.hora ? `<span>🕐 Hora preferida: <strong>${esc(t.hora)}</strong></span>` : ''}
                            ${servicioDe(t) ? `<span>💼 Servicio: <strong>${esc(servicioDe(t).nombre || '')}</strong></span>` : ''}
                            ${t.notas ? `<span style="white-space:pre-line;">📝 Notas: ${esc(t.notas)}</span>` : ''}
                        </div>
                    </div>
                    <div>
                        <h4 style="margin:0 0 0.7rem; font-size:0.9rem;">Datos del cliente</h4>
                        ${cliente ? `
                        <div class="admin-pedido-cliente">
                            <strong>${esc(cliente.nombre || '')}</strong>
                            ${cliente.telefono ? `<br>📱 ${esc(cliente.telefono)}` : ''}
                            ${cliente.email ? `<br>📧 ${esc(cliente.email)}` : ''}
                        </div>` : '<p style="color:var(--text-muted);">Sin datos del cliente.</p>'}
                    </div>
                </div>
            </td>
        </tr>` : ''}
    `;
}

function servicioDe(t) {
    if (!t.producto_ref) return null;
    if (typeof t.producto_ref === 'string') {
        try { return JSON.parse(t.producto_ref); } catch { return null; }
    }
    return t.producto_ref;
}