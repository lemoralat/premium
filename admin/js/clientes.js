// ============================================================================
// clientes.js — Clientes con pedidos confirmados.
//
// La tienda no tiene tabla de clientes: cada pedido guarda un snapshot del
// comprador en orders.cliente (jsonb). Esta sección agrupa esos snapshots para
// mostrar UN cliente por persona y sólo si tiene al menos un pedido confirmado.
//
// Es de sólo lectura (no se edita nada): permite ver los datos de contacto del
// cliente, buscar, filtrar por fecha de sus pedidos y eliminarlo (individual o
// en lote). Como el cliente no existe fuera de sus pedidos, eliminarlo borra
// sus pedidos a través de la RPC borrar_pedidos (0025), que respeta la RLS.
//
// "Pedido confirmado": la tabla orders no tiene un estado 'Confirmado' (0001:
// Pendiente, Procesando, Enviado, Entregado, Cancelado). Se considera
// confirmado al pedido ya aceptado por el negocio (Procesando, Enviado o
// Entregado), dejando afuera Pendiente (espera confirmación) y Cancelado.
// ============================================================================

import {
    $, esc, toast, estadoCargando, confirmarBorrado,
    formatearPrecio, formatearFecha, abrirModal
} from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

const ESTADOS_CONFIRMADOS = ['Procesando', 'Enviado', 'Entregado'];

let ordenes = [];           // pedidos crudos (id, cliente, total, estado, created_at)
let clientes = [];          // clientes agregados (sólo con pedidos confirmados)
let busqueda = '';
let desde = '';
let hasta = '';
const seleccion = new Set(); // claves de clientes seleccionados

// ---------- Sección ----------
export async function renderizar(contenedor) {
    estadoCargando(contenedor, 'Cargando clientes…');
    ordenes = await traerOrdenes();
    busqueda = '';
    desde = '';
    hasta = '';
    seleccion.clear();
    pintar(contenedor);
}

async function traerOrdenes() {
    const sb = await clienteAdmin();
    const { data, error } = await sb
        .from('orders')
        .select('id, cliente, total, estado, created_at')
        .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : [];
}

// ---------- Datos ----------
function clienteDe(o) {
    if (!o || !o.cliente) return null;
    if (typeof o.cliente === 'string') {
        try { return JSON.parse(o.cliente); } catch { return null; }
    }
    return o.cliente;
}

// Identidad del cliente: email → teléfono → nombre (lo primero disponible).
// Los pedidos vienen ordenados del más reciente al más viejo, así que el
// primer snapshot de cada cliente es el más actualizado.
function claveDe(c) {
    const email = String(c.email || '').trim().toLowerCase();
    if (email) return `email:${email}`;
    const tel = String(c.telefono || '').replace(/\D+/g, '');
    if (tel) return `tel:${tel}`;
    const nombre = String(c.nombre || '').trim().toLowerCase();
    if (nombre) return `nombre:${nombre}`;
    return null;
}

function dentroDelRango(iso) {
    if (!desde && !hasta) return true;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return false;
    if (desde) {
        const d = new Date(`${desde}T00:00:00`).getTime();
        if (!Number.isNaN(d) && t < d) return false;
    }
    if (hasta) {
        const h = new Date(`${hasta}T23:59:59.999`).getTime();
        if (!Number.isNaN(h) && t > h) return false;
    }
    return true;
}

function construirClientes() {
    const mapa = new Map();

    // 1) Clientes con al menos un pedido confirmado (sin filtrar por fecha: la
    //    ficha y las métricas se completan después con el rango elegido).
    for (const o of ordenes) {
        if (!ESTADOS_CONFIRMADOS.includes(o.estado)) continue;
        const datos = clienteDe(o);
        if (!datos) continue;
        const clave = claveDe(datos);
        if (!clave) continue;
        if (!mapa.has(clave)) {
            mapa.set(clave, {
                clave, datos,
                idsTodos: [], pedidos: 0, total: 0,
                primera: '', ultima: ''
            });
        }
    }

    // 2) Ids de TODOS los pedidos de cada cliente (cualquier estado): se usan
    //    para eliminarlo por completo (incluye pendientes/cancelados).
    for (const o of ordenes) {
        const datos = clienteDe(o);
        if (!datos) continue;
        const reg = mapa.get(claveDe(datos));
        if (reg) reg.idsTodos.push(o.id);
    }

    // 3) Métricas de compra: sólo los pedidos confirmados dentro del rango.
    for (const o of ordenes) {
        if (!ESTADOS_CONFIRMADOS.includes(o.estado)) continue;
        if (!dentroDelRango(o.created_at)) continue;
        const datos = clienteDe(o);
        if (!datos) continue;
        const reg = mapa.get(claveDe(datos));
        if (!reg) continue;

        reg.pedidos += 1;
        reg.total += Number(o.total || 0);
        const t = new Date(o.created_at).getTime();
        if (!Number.isNaN(t)) {
            if (!reg.primera || t < new Date(reg.primera).getTime()) reg.primera = o.created_at;
            if (!reg.ultima || t > new Date(reg.ultima).getTime()) reg.ultima = o.created_at;
        }
    }

    return [...mapa.values()]
        .filter((r) => r.pedidos > 0)
        .sort((a, b) => new Date(b.ultima || 0) - new Date(a.ultima || 0));
}

// ---------- Render ----------
function pintar(contenedor) {
    clientes = construirClientes();

    // Descarta selecciones de clientes que ya no existen (p. ej. se borraron
    // desde otra pestaña), para no mostrar un conteo fantasma.
    const clavesVivas = new Set(clientes.map((r) => r.clave));
    [...seleccion].forEach((k) => { if (!clavesVivas.has(k)) seleccion.delete(k); });

    const texto = busqueda.trim().toLowerCase();
    const visibles = texto
        ? clientes.filter((r) => {
            const d = r.datos || {};
            return [d.nombre, d.email, d.telefono]
                .some((v) => String(v || '').toLowerCase().includes(texto));
        })
        : clientes;

    const conSeleccion = seleccion.size > 0;
    const todosVisibles = visibles.length > 0 && visibles.every((r) => seleccion.has(r.clave));
    const algunosVisibles = !todosVisibles && visibles.some((r) => seleccion.has(r.clave));
    const hayFecha = Boolean(desde || hasta);

    contenedor.innerHTML = `
        <div class="admin-filtros">
            <div class="cli-filtro-fechas">
                <label>Desde <input type="date" id="cliDesde" value="${esc(desde)}"></label>
                <label>Hasta <input type="date" id="cliHasta" value="${esc(hasta)}"></label>
                ${hayFecha ? '<button type="button" class="btn btn-sm btn-outline" id="cliLimpiarFechas"><i class="fa-solid fa-xmark"></i> Limpiar</button>' : ''}
            </div>
            <input type="text" id="cliBuscar" class="admin-busqueda" placeholder="Buscar por nombre, email o teléfono…" value="${esc(busqueda)}">
            <p class="cli-contador">${visibles.length} cliente(s)</p>
        </div>

        <p class="cli-nota">
            <i class="fa-solid fa-circle-info"></i>
            Se listan los clientes con al menos un pedido confirmado (Procesando, Enviado o Entregado)${hayFecha ? ' dentro del rango de fechas elegido' : ''}.
            Al eliminar un cliente se borran también sus pedidos.
        </p>

        ${conSeleccion ? `
        <div class="admin-bulkbar" role="status">
            <span class="admin-bulkbar-info"><i class="fa-solid fa-square-check"></i> <strong>${seleccion.size}</strong> cliente(s) seleccionado(s)</span>
            <div class="admin-bulkbar-acciones">
                <button type="button" class="btn btn-sm btn-outline" id="btnLimpiarSeleccion">Quitar selección</button>
                <button type="button" class="btn btn-sm btn-danger" id="btnBorrarSeleccion"><i class="fa-solid fa-trash-can"></i> Eliminar seleccionados</button>
            </div>
        </div>` : ''}

        ${visibles.length === 0 ? `
        <div class="admin-card">
            <div class="admin-empty">
                <i class="fa-solid fa-users"></i>
                <h3>${clientes.length === 0 ? 'Todavía no hay clientes' : 'Sin resultados'}</h3>
                <p>${clientes.length === 0
                    ? 'Cuando confirmes pedidos, acá vas a ver a tus clientes.'
                    : 'No se encontraron clientes con estos filtros.'}</p>
            </div>
        </div>` : `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr>
                        <th class="th-check"><label class="admin-check" title="Seleccionar todos los visibles"><input type="checkbox" id="selTodos" aria-label="Seleccionar todos los visibles" ${todosVisibles ? 'checked' : ''}></label></th>
                        <th>Cliente</th><th>Teléfono</th><th>Pedidos</th><th>Total</th><th>Última compra</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    ${visibles.map((r) => filaCliente(r)).join('')}
                </tbody>
            </table>
        </div>`}
    `;

    // Filtro por fecha
    const iDesde = $('#cliDesde');
    if (iDesde) iDesde.addEventListener('change', () => { desde = iDesde.value; pintar(contenedor); });
    const iHasta = $('#cliHasta');
    if (iHasta) iHasta.addEventListener('change', () => { hasta = iHasta.value; pintar(contenedor); });
    const btnLimpiarFechas = $('#cliLimpiarFechas');
    if (btnLimpiarFechas) {
        btnLimpiarFechas.addEventListener('click', () => { desde = ''; hasta = ''; pintar(contenedor); });
    }

    // Buscador (repinta la sección, así que se restauran foco y caret)
    const buscarInput = $('#cliBuscar');
    if (buscarInput) {
        const refrescar = () => {
            busqueda = buscarInput.value.trim();
            const caret = buscarInput.selectionStart ?? buscarInput.value.length;
            pintar(contenedor);
            const nuevo = $('#cliBuscar');
            if (nuevo) {
                nuevo.focus();
                const pos = Math.min(caret, nuevo.value.length);
                nuevo.setSelectionRange(pos, pos);
            }
        };
        buscarInput.addEventListener('input', refrescar);
        buscarInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') refrescar(); });
    }

    // Selección individual / todos los visibles
    contenedor.querySelectorAll('[data-seleccion-cliente]').forEach((cb) => {
        cb.addEventListener('change', () => {
            if (cb.checked) seleccion.add(cb.dataset.seleccionCliente);
            else seleccion.delete(cb.dataset.seleccionCliente);
            pintar(contenedor);
        });
    });

    const selTodos = $('#selTodos');
    if (selTodos) {
        selTodos.indeterminate = algunosVisibles;
        selTodos.addEventListener('change', () => {
            const claves = visibles.map((r) => r.clave);
            if (selTodos.checked) claves.forEach((k) => seleccion.add(k));
            else claves.forEach((k) => seleccion.delete(k));
            pintar(contenedor);
        });
    }

    // Ver ficha / eliminar individual
    contenedor.querySelectorAll('[data-ver-cliente]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalCliente(btn.dataset.verCliente));
    });
    contenedor.querySelectorAll('[data-borrar-cliente]').forEach((btn) => {
        btn.addEventListener('click', () => borrarClientes([btn.dataset.borrarCliente], contenedor));
    });

    const btnLimpiarSeleccion = $('#btnLimpiarSeleccion');
    if (btnLimpiarSeleccion) {
        btnLimpiarSeleccion.addEventListener('click', () => { seleccion.clear(); pintar(contenedor); });
    }
    const btnBorrarSeleccion = $('#btnBorrarSeleccion');
    if (btnBorrarSeleccion) {
        btnBorrarSeleccion.addEventListener('click', () => borrarClientes([...seleccion], contenedor));
    }
}

function filaCliente(r) {
    const d = r.datos || {};
    const nombre = String(d.nombre || '').trim() || 'Sin nombre';
    const sel = seleccion.has(r.clave);

    return `
        <tr ${sel ? 'class="admin-fila-activa"' : ''}>
            <td class="td-check">
                <label class="admin-check" title="Seleccionar este cliente">
                    <input type="checkbox" data-seleccion-cliente="${esc(r.clave)}" aria-label="Seleccionar cliente ${esc(nombre)}" ${sel ? 'checked' : ''}>
                </label>
            </td>
            <td class="td-principal" data-label="Cliente">
                <div class="cli-cliente">
                    <strong>${esc(nombre)}</strong>
                    ${d.email ? `<span>${esc(d.email)}</span>` : ''}
                </div>
            </td>
            <td data-label="Teléfono">${d.telefono ? esc(d.telefono) : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td data-label="Pedidos"><span class="estado-badge estado-confirmado">${esc(r.pedidos)}</span></td>
            <td data-label="Total"><strong>$${formatearPrecio(r.total)}</strong></td>
            <td data-label="Última compra">${r.ultima ? esc(formatearFecha(r.ultima)) : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-ver-cliente="${esc(r.clave)}" title="Ver datos" aria-label="Ver datos de ${esc(nombre)}"><i class="fa-solid fa-eye"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar-cliente="${esc(r.clave)}" title="Eliminar" aria-label="Eliminar cliente ${esc(nombre)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `;
}

// ---------- Ficha del cliente ----------
function abrirModalCliente(clave) {
    const r = clientes.find((x) => x.clave === clave);
    if (!r) return;

    const d = r.datos || {};
    const nombre = String(d.nombre || '').trim() || 'Sin nombre';
    const ubicacion = [d.direccion, d.ciudad, d.provincia].filter(Boolean).join(', ');
    const telDigitos = String(d.telefono || '').replace(/[^\d+]/g, '');
    const sinDatos = !d.email && !d.telefono && !ubicacion && !d.codigoPostal && !d.notas;

    abrirModal(`
        <h2>${esc(nombre)}</h2>
        <p class="modal-sub">Datos de contacto del cliente</p>

        <div class="cli-detalle">
            ${d.email ? `<div class="cli-detalle-item"><i class="fa-solid fa-envelope"></i><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></div>` : ''}
            ${d.telefono ? `<div class="cli-detalle-item"><i class="fa-solid fa-phone"></i><a href="tel:${esc(telDigitos)}">${esc(d.telefono)}</a></div>` : ''}
            ${ubicacion ? `<div class="cli-detalle-item"><i class="fa-solid fa-location-dot"></i><span>${esc(ubicacion)}</span></div>` : ''}
            ${d.codigoPostal ? `<div class="cli-detalle-item"><i class="fa-solid fa-map-pin"></i><span>CP ${esc(d.codigoPostal)}</span></div>` : ''}
            ${d.notas ? `<div class="cli-detalle-item"><i class="fa-solid fa-pen-to-square"></i><span>${esc(d.notas)}</span></div>` : ''}
            ${sinDatos ? '<p class="cli-sin-datos">Este cliente no cargó datos de contacto.</p>' : ''}
        </div>

        <h3 class="cli-resumen-titulo">Resumen de compras</h3>
        <div class="cli-resumen">
            <div><span>Pedidos confirmados</span><strong>${esc(r.pedidos)}</strong></div>
            <div><span>Total</span><strong>$${formatearPrecio(r.total)}</strong></div>
            <div><span>Primera compra</span><strong>${r.primera ? esc(formatearFecha(r.primera)) : '—'}</strong></div>
            <div><span>Última compra</span><strong>${r.ultima ? esc(formatearFecha(r.ultima)) : '—'}</strong></div>
        </div>

        <div class="admin-modal-acciones">
            <button type="button" class="btn btn-primary" data-cerrar-modal>Cerrar</button>
        </div>
    `);
}

// ---------- Eliminar ----------
async function borrarClientes(claves, contenedor) {
    const registros = clientes.filter((r) => claves.includes(r.clave));
    if (registros.length === 0) return;

    const ids = [...new Set(registros.flatMap((r) => r.idsTodos))];
    if (ids.length === 0) return;

    const unCliente = registros.length === 1;
    const nombre = String(registros[0]?.datos?.nombre || '').trim() || 'Sin nombre';

    const ok = await confirmarBorrado(
        (unCliente
            ? `¿Eliminar al cliente <strong>${esc(nombre)}</strong>?`
            : `¿Eliminar <strong>${registros.length}</strong> clientes?`)
        + `<br><br>Se eliminarán <strong>${ids.length}</strong> pedido(s) en total (incluye pendientes y cancelados). Esta acción no se puede deshacer.`,
        { html: true }
    );
    if (!ok) return;

    try {
        const sb = await clienteAdmin();
        const { data, error } = await sb.rpc('borrar_pedidos', { p_ids: ids });
        if (error) throw new Error(error.message);

        const borrados = Number(data) || ids.length;
        toast(unCliente
            ? `Cliente eliminado (${borrados} pedido(s)).`
            : `${registros.length} cliente(s) eliminado(s) (${borrados} pedido(s)).`);

        // Refresca conservando los filtros activos.
        ordenes = await traerOrdenes();
        seleccion.clear();
        pintar(contenedor);
    } catch (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
    }
}
