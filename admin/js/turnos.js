// turnos.js — Gestión de solicitudes de turno: listado, filtros, detalle,
// cambio de estado y borrado. Espejo simplificado de pedidos.js: un turno no
// tiene cupón, pero sí fecha/hora preferidas y los servicios solicitados
// (producto_ref para solicitudes viejas; items con el snapshot del carrito
// desde la migración 0053).

import { $, esc, toast, estadoCargando, confirmarBorrado, abrirModal, cerrarModal, formatearFechaHora, formatearPrecio } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

const ESTADOS = ['Pendiente', 'Confirmado', 'Realizado', 'Cancelado'];

let todos = [];
let filtroEstado = 'Todos';
let busqueda = '';
let expandidoId = null;
let seleccionados = new Set();

// Vista del listado: "lista" (tabla) o "calendario" (mes, turnos por día).
let vista = 'lista';
let mesVisible = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const MAX_TURNOS_VISIBLES = 3; // chips por día antes del botón "+N más"

export async function renderizar(contenedor) {
    estadoCargando(contenedor, 'Cargando turnos…');
    const sb = await clienteAdmin();

    // El alta entra solo por RPC (insertar_turno); acá se lee y se administra.
    const { data, error } = await sb.from('turnos')
        .select('id, numero, token, cliente, fecha, hora, producto_ref, notas, items, estado, created_at')
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

    // La vista "calendario" filtra solo por estado (los chips); la búsqueda por
    // número/cliente es propia del listado.
    const turnosVista = vista === 'calendario'
        ? todos.filter((t) => filtroEstado === 'Todos' || t.estado === filtroEstado)
        : filtrados;

    contenedor.innerHTML = `
        ${controlesVista()}

        <div class="admin-filtros admin-filtros-chips">
            <button type="button" class="admin-chip ${filtroEstado === 'Todos' ? 'active' : ''}" data-estado="Todos">Todos (${contar('Todos')})</button>
            ${ESTADOS.map((e) => `<button type="button" class="admin-chip ${filtroEstado === e ? 'active' : ''}" data-estado="${esc(e)}">${esc(e)} (${contar(e)})</button>`).join('')}
        </div>

        ${vista === 'calendario'
            ? calendarioHTML(turnosVista)
            : listaHTML({ filtrados, conSeleccion, todosVisibles })}
    `;

    const selTodos = $('#selTodosTurnos');
    if (selTodos) selTodos.indeterminate = algunosVisibles;

    contenedor.querySelectorAll('.admin-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            filtroEstado = btn.dataset.estado;
            pintar(contenedor);
        });
    });

    // Cambio de vista lista ↔ calendario.
    contenedor.querySelectorAll('[data-vista]').forEach((btn) => {
        btn.addEventListener('click', () => {
            vista = btn.dataset.vista;
            pintar(contenedor);
        });
    });

    // Navegación del calendario: mes anterior / siguiente / "Hoy".
    contenedor.querySelectorAll('[data-cal-mes]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const delta = Number(btn.dataset.calMes);
            mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + delta, 1);
            pintar(contenedor);
        });
    });
    const btnCalHoy = $('#btnCalHoy');
    if (btnCalHoy) {
        btnCalHoy.addEventListener('click', () => {
            mesVisible = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            pintar(contenedor);
        });
    }

    // Chips de turno en el calendario → detalle del turno (modal).
    contenedor.querySelectorAll('[data-cal-turno]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const turno = todos.find((x) => x.id === Number(btn.dataset.calTurno));
            if (turno) abrirDetalleTurno(turno);
        });
    });

    // Celdas con turnos → ver el día completo (a menos que el click haya sido
    // sobre un chip). Soporta teclado (Enter/Espacio) en la celda.
    contenedor.querySelectorAll('[data-cal-dia]').forEach((celda) => {
        const abrir = () => {
            const turnos = turnosDeDia(turnosVista, celda.dataset.calDia);
            if (turnos.length) abrirDiaModal(turnos, celda.dataset.calDia);
        };
        celda.addEventListener('click', (e) => {
            if (e.target.closest('[data-cal-turno]')) return;
            abrir();
        });
        celda.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
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
            const ok = await actualizarEstadoTurno(id, nuevo);
            seleccionarAjustar(select, ok ? nuevo : anterior);
            if (ok) pintar($('#adminView'));
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
                ${itemsDe(t).length
                    ? `<span class="estado-badge estado-pendiente" title="${esc(itemsDe(t).map((i) => i.nombre).join(', '))}">${itemsDe(t).length} servicio${itemsDe(t).length === 1 ? '' : 's'}</span>`
                    : servicioDe(t)
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
                            ${servicioDe(t) && !itemsDe(t).length ? `<span>💼 Servicio: <strong>${esc(servicioDe(t).nombre || '')}</strong></span>` : ''}
                            ${itemsDe(t).length ? `
                            <div style="margin-top:0.5rem;">
                                <strong style="font-size:0.8rem;">Servicios solicitados (${itemsDe(t).length}):</strong>
                                <ul style="margin:0.3rem 0 0 1rem; padding:0; list-style:disc;">
                                    ${itemsDe(t).map((i) => {
                                        const nombre = esc(String(i.nombre || '').trim());
                                        const variante = i.variante_texto ? ` [${esc(String(i.variante_texto).trim())}]` : '';
                                        const cantidad = Number(i.cantidad) > 1 ? ` × ${Number(i.cantidad)}` : '';
                                        const precio = Number(i.precio_unitario) > 0
                                            ? ` — $${formatearPrecio(Number(i.precio_unitario) * (Number(i.cantidad) || 1))}`
                                            : '';
                                        return `<li style="font-size:0.85rem;">${nombre}${variante}${cantidad}${precio}</li>`;
                                    }).join('')}
                                </ul>
                                ${totalItems(t) > 0 ? `<span style="font-size:0.85rem; margin-top:0.2rem; display:inline-block;">💰 Total estimado: <strong>$${formatearPrecio(totalItems(t))}</strong></span>` : ''}
                            </div>` : ''}
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

// Ítems del turno (0053): snapshot del carrito en turnos.items.
function itemsDe(t) {
    if (!t.items) return [];
    if (typeof t.items === 'string') {
        try { t.items = JSON.parse(t.items); } catch { return []; }
    }
    return Array.isArray(t.items) ? t.items : [];
}

// Total estimado del turno en base a los ítems (snapshot guardado, no
// recalculado): es la cifra que vio el cliente al solicitar.
function totalItems(t) {
    return itemsDe(t).reduce((sum, i) => sum + (Number(i.precio_unitario) || 0) * (Number(i.cantidad) || 0), 0);
}

// ============================================================================
// Vista calendario (mes): turnos asignados por día con color por estado.
// Complementa el listado: misma fuente de datos (todos), sin refetch.
// ============================================================================

const VISTAS = [
    { valor: 'lista', icono: 'fa-list', etiqueta: 'Lista' },
    { valor: 'calendario', icono: 'fa-calendar-days', etiqueta: 'Calendario' }
];
const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Clase CSS del estado (consistente con las badges del listado).
function claseEstado(estado) {
    const e = String(estado || '').toLowerCase();
    if (e === 'pendiente') return 'pendiente';
    if (e === 'confirmado') return 'confirmado';
    if (e === 'realizado') return 'realizado';
    return 'cancelado';
}

function nombreCorto(t) {
    const n = String(clienteDe(t)?.nombre || '').trim();
    return n.length > 12 ? n.slice(0, 12).trimEnd() + '…' : (n || '—');
}

function controlesVista() {
    return `
        <div class="admin-vista-toggle" role="tablist" aria-label="Vista de turnos">
            ${VISTAS.map((v) => `
                <button type="button" class="admin-vista-btn ${vista === v.valor ? 'active' : ''}" data-vista="${v.valor}" role="tab" aria-selected="${vista === v.valor}">
                    <i class="fa-solid ${v.icono}"></i> ${v.etiqueta}
                </button>`).join('')}
        </div>`;
}

// Bloque del listado (tabla + toolbar + bulkbar). Se extrajo para que el mismo
// pintar() sirva a las dos vistas.
function listaHTML({ filtrados: f, conSeleccion, todosVisibles }) {
    return `
        <div class="admin-toolbar">
            <input type="text" id="turnoBuscar" class="admin-busqueda" placeholder="Buscar por número o cliente…"
                   value="${esc(busqueda)}">
            <p>${f.length} solicitud(es)</p>
        </div>

        ${conSeleccion ? `
        <div class="admin-bulkbar" role="status">
            <span class="admin-bulkbar-info"><i class="fa-solid fa-square-check"></i> <strong>${seleccionados.size}</strong> solicitud(es) seleccionada(s)</span>
            <div class="admin-bulkbar-acciones">
                <button type="button" class="btn btn-sm btn-outline" id="btnLimpiarSeleccionTurnos">Quitar selección</button>
                <button type="button" class="btn btn-sm btn-danger" id="btnBorrarSeleccionTurnos"><i class="fa-solid fa-trash-can"></i> Borrar seleccionadas</button>
            </div>
        </div>` : ''}

        ${f.length === 0 ? '<div class="admin-card"><div class="admin-empty"><i class="fa-solid fa-calendar-check"></i><h3>Sin solicitudes de turno</h3><p>No se encontraron solicitudes con estos filtros.</p></div></div>' : `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr>
                        <th class="th-check"><label class="admin-check" title="Seleccionar todos los visibles"><input type="checkbox" id="selTodosTurnos" aria-label="Seleccionar todos los visibles" ${todosVisibles ? 'checked' : ''}></label></th>
                        <th></th><th>Número</th><th>Recibida</th><th>Cliente</th><th>Cita solicitada</th><th>Servicio</th><th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${f.map((t) => filaTurno(t)).join('')}
                </tbody>
            </table>
        </div>`}`;
}

function claveFecha(anio, mes, dia) {
    return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function fechaLegible(clave) {
    const [a, m, d] = clave.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Celdas del mes visible (semana empezando en lunes), rellenando los bordes
// con días de los meses vecinos (marcados como "fuera").
function celdasDelMes() {
    const anio = mesVisible.getFullYear();
    const mes = mesVisible.getMonth();
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    const offset = (mesVisible.getDay() + 6) % 7; // lun=0 … dom=6
    const celdas = [];
    for (let i = offset - 1; i >= 0; i--) {
        const dia = new Date(anio, mes, -i);
        celdas.push({ fuera: true, num: dia.getDate(), clave: claveFecha(dia.getFullYear(), dia.getMonth(), dia.getDate()) });
    }
    for (let d = 1; d <= diasEnMes; d++) celdas.push({ fuera: false, num: d, clave: claveFecha(anio, mes, d) });
    while (celdas.length % 7 !== 0) {
        const [a, m, dd] = celdas[celdas.length - 1].clave.split('-').map(Number);
        const dia = new Date(a, m - 1, dd + 1);
        celdas.push({ fuera: true, num: dia.getDate(), clave: claveFecha(dia.getFullYear(), dia.getMonth(), dia.getDate()) });
    }
    return celdas;
}

function turnosDeDia(turnos, clave) {
    return turnos.filter((t) => String(t.fecha || '') === clave);
}

function chipTurno(t) {
    const estado = claseEstado(t.estado);
    const titulo = esc(`${String(t.hora || '')} ${nombreCorto(t)} — ${t.estado || ''}`);
    return `
        <button type="button" class="cal-turno cal-turno--${estado}" data-cal-turno="${esc(t.id)}"
                title="${titulo}" aria-label="Ver turno ${esc(t.numero || '')} — ${titulo}">
            <span class="cal-turno-hora">${esc(t.hora || '')}</span>
            <span class="cal-turno-nombre">${esc(nombreCorto(t))}</span>
        </button>`;
}

function calendarioHTML(turnos) {
    const hoy = new Date();
    const hoyClave = claveFecha(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const celdas = celdasDelMes();
    const titulo = `${NOMBRES_MES[mesVisible.getMonth()]} ${mesVisible.getFullYear()}`;

    const cuerpo = celdas.map((c) => {
        const delDia = turnosDeDia(turnos, c.clave);
        const conTurnos = !c.fuera && delDia.length > 0;
        const esHoy = c.clave === hoyClave;
        const restantes = delDia.length - MAX_TURNOS_VISIBLES;
        return `
            <div class="cal-celda ${c.fuera ? 'cal-celda--fuera' : ''} ${esHoy ? 'cal-celda--hoy' : ''} ${conTurnos ? 'cal-celda--con-turnos' : ''}"
                 data-cal-dia="${c.clave}"
                 ${conTurnos ? `role="button" tabindex="0" aria-label="Ver turnos del ${esc(fechaLegible(c.clave))} — ${delDia.length} solicitud(es)"` : ''}>
                <span class="cal-num">${c.num}</span>
                ${conTurnos ? `
                <div class="cal-turnos">
                    ${delDia.slice(0, MAX_TURNOS_VISIBLES).map(chipTurno).join('')}
                    ${restantes > 0 ? `<button type="button" class="cal-mas" data-cal-mas="${c.clave}">+${restantes} más</button>` : ''}
                </div>` : ''}
            </div>`;
    }).join('');

    return `
        <div class="cal-marco">
            <div class="cal-header">
                <button type="button" class="cal-nav-btn" data-cal-mes="-1" aria-label="Mes anterior"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="cal-titulo">
                    <strong>${esc(titulo)}</strong>
                    <button type="button" class="btn btn-sm btn-outline" id="btnCalHoy">Hoy</button>
                </div>
                <button type="button" class="cal-nav-btn" data-cal-mes="1" aria-label="Mes siguiente"><i class="fa-solid fa-chevron-right"></i></button>
            </div>

            <div class="cal-leyenda" aria-hidden="true">
                ${ESTADOS.map((e) => `<span class="cal-leyenda-item"><i class="cal-dot cal-dot--${claseEstado(e)}"></i> ${esc(e)}</span>`).join('')}
            </div>

            <div class="cal-cabeza" aria-hidden="true">
                ${DIAS_SEMANA.map((d) => `<span class="cal-dia-cabeza">${d}</span>`).join('')}
            </div>

            <div class="cal-grid">
                ${cuerpo}
            </div>
        </div>`;
}

// Cambio de estado compartido (tabla, modal del turno y lista del día).
async function actualizarEstadoTurno(id, nuevo) {
    try {
        const sb = await clienteAdmin();
        const { error } = await sb.from('turnos').update({ estado: nuevo }).eq('id', id);
        if (error) throw error;
        const turno = todos.find((t) => t.id === id);
        if (turno) turno.estado = nuevo;
        toast(`Turno ${esc(turno?.numero || '')} → ${esc(nuevo)}`);
        return true;
    } catch (error) {
        toast(`No se pudo actualizar el estado: ${error.message}`, 'error');
        return false;
    }
}

// Modal de un turno desde el calendario: mismo detalle que la fila expandida,
// con cambio de estado y borrado inline.
function abrirDetalleTurno(t) {
    const cliente = clienteDe(t);
    abrirModal(`
        <h2>Turno ${esc(t.numero || '')}</h2>
        <p class="modal-sub">Recibida ${esc(formatearFechaHora(t.created_at))}</p>
        <div class="pedido-detalle-grid">
            <div>
                <h4 style="margin:0 0 0.7rem; font-size:0.9rem;">Solicitud</h4>
                <div style="display:flex; flex-direction:column; gap:0.3rem; font-size:0.85rem;">
                    <span>📅 Fecha preferida: <strong>${esc(t.fecha || '—')}</strong></span>
                    ${t.hora ? `<span>🕐 Hora preferida: <strong>${esc(t.hora)}</strong></span>` : ''}
                    ${servicioDe(t) && !itemsDe(t).length ? `<span>💼 Servicio: <strong>${esc(servicioDe(t).nombre || '')}</strong></span>` : ''}
                    ${itemsDe(t).length ? `
                    <div style="margin-top:0.5rem;">
                        <strong style="font-size:0.8rem;">Servicios solicitados (${itemsDe(t).length}):</strong>
                        <ul style="margin:0.3rem 0 0 1rem; padding:0; list-style:disc;">
                            ${itemsDe(t).map((i) => {
                                const nombre = esc(String(i.nombre || '').trim());
                                const variante = i.variante_texto ? ` [${esc(String(i.variante_texto).trim())}]` : '';
                                const cantidad = Number(i.cantidad) > 1 ? ` × ${Number(i.cantidad)}` : '';
                                const precio = Number(i.precio_unitario) > 0 ? ` — $${formatearPrecio(Number(i.precio_unitario) * (Number(i.cantidad) || 1))}` : '';
                                return `<li style="font-size:0.85rem;">${nombre}${variante}${cantidad}${precio}</li>`;
                            }).join('')}
                        </ul>
                        ${totalItems(t) > 0 ? `<span style="font-size:0.85rem; margin-top:0.2rem; display:inline-block;">💰 Total estimado: <strong>$${formatearPrecio(totalItems(t))}</strong></span>` : ''}
                    </div>` : ''}
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
        <div class="admin-field" style="margin-top:1.1rem;">
            <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.35rem;">Estado del turno</label>
            <select class="admin-estado-select" id="calEstadoTurno" data-anterior="${esc(t.estado)}">
                ${ESTADOS.map((e) => `<option value="${esc(e)}" ${e === t.estado ? 'selected' : ''}>${esc(e)}</option>`).join('')}
            </select>
        </div>
        <div class="admin-modal-acciones">
            <button type="button" class="btn btn-outline" data-cerrar-modal>Cerrar</button>
            <button type="button" class="btn btn-danger" id="calBorrarTurno"><i class="fa-solid fa-trash-can"></i> Eliminar turno</button>
        </div>
    `);

    const sel = $('#calEstadoTurno');
    if (sel) {
        sel.addEventListener('change', async () => {
            const anterior = sel.dataset.anterior;
            const ok = await actualizarEstadoTurno(t.id, sel.value);
            if (!ok) { sel.value = anterior; sel.dataset.anterior = anterior; return; }
            sel.dataset.anterior = sel.value;
            pintar($('#adminView')); // refresca la vista de fondo, el modal sigue abierto
        });
    }

    const btnBorrar = $('#calBorrarTurno');
    if (btnBorrar) {
        btnBorrar.addEventListener('click', async () => {
            const clienteTurno = clienteDe(t);
            const ok = await confirmarBorrado(
                `¿Eliminar la solicitud <strong>${esc(t.numero || '')}</strong> de ${esc(clienteTurno?.nombre || '—')}?`
                + '<br><br>Esta acción no se puede deshacer.',
                { html: true }
            );
            if (!ok) return;
            try {
                const sb = await clienteAdmin();
                const { error } = await sb.rpc('borrar_turnos', { p_ids: [t.id] });
                if (error) throw error;
                todos = todos.filter((x) => x.id !== t.id);
                seleccionados.delete(t.id);
                if (expandidoId === t.id) expandidoId = null;
                cerrarModal();
                toast(`Turno ${esc(t.numero || '')} eliminado`);
                pintar($('#adminView'));
            } catch (error) {
                toast(`No se pudo eliminar la solicitud: ${error.message}`, 'error');
            }
        });
    }
}

// Modal "día completo": todos los turnos de una fecha, ordenados por hora.
function abrirDiaModal(turnos, clave) {
    const ordenados = [...turnos].sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
    abrirModal(`
        <h2>Turnos — ${esc(fechaLegible(clave))}</h2>
        <p class="modal-sub">${ordenados.length} solicitud(es) para este día</p>
        <div class="cal-dia-lista">
            ${ordenados.map((t) => `
                <div class="cal-dia-item">
                    <i class="cal-dot cal-dot--${claseEstado(t.estado)}"></i>
                    <div class="cal-dia-info">
                        <strong>${esc(t.hora || '—')} · ${esc(clienteDe(t)?.nombre || '—')}</strong>
                        <span class="cal-dia-servicio">${esc(resumenServicios(t))}</span>
                    </div>
                    <span class="estado-badge estado-${claseEstado(t.estado)}">${esc(t.estado || '')}</span>
                    <button type="button" class="btn btn-sm btn-outline" data-ver-turno="${esc(t.id)}" aria-label="Ver detalle de ${esc(t.numero || '')}"><i class="fa-solid fa-eye"></i></button>
                </div>`).join('')}
        </div>
        <div class="admin-modal-acciones">
            <button type="button" class="btn btn-outline" data-cerrar-modal>Cerrar</button>
        </div>
    `);

    document.querySelectorAll('#adminModal [data-ver-turno]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const turno = todos.find((x) => x.id === Number(btn.dataset.verTurno));
            if (turno) abrirDetalleTurno(turno);
        });
    });
}

function resumenServicios(t) {
    const items = itemsDe(t);
    if (items.length) return items.map((i) => String(i.nombre || '').trim()).join(', ');
    return servicioDe(t)?.nombre || 'Sin detalle';
}