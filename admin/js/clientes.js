// ============================================================================
// clientes.js — Clientes con pedidos confirmados.
//
// La tienda no tiene tabla de clientes: cada pedido guarda un snapshot del
// comprador en orders.cliente (jsonb). Esta sección agrupa esos snapshots para
// mostrar UN cliente por persona y sólo si tiene al menos un pedido confirmado.
//
// Es de sólo lectura (no se edita nada) y "quitar" un cliente NO borra nada:
// sólo guarda su clave en `clientes_ocultos` (0063) para sacarlo de la lista.
// Sus pedidos quedan intactos (los ingresos del dashboard no cambian) y se
// puede restaurar desde la vista «Eliminados».
//
// "Pedido confirmado": la tabla orders no tiene un estado 'Confirmado' (0001:
// Pendiente, Procesando, Enviado, Entregado, Cancelado). Se considera
// confirmado al pedido ya aceptado por el negocio (Procesando, Enviado o
// Entregado), dejando afuera Pendiente (espera confirmación) y Cancelado.
// ============================================================================

import {
    $, esc, toast, estadoCargando, confirmarDialogo,
    formatearPrecio, formatearFecha, abrirModal
} from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

const ESTADOS_CONFIRMADOS = ['Procesando', 'Enviado', 'Entregado'];

let ordenes = [];          // pedidos crudos (id, cliente, total, estado, created_at)
let ocultos = new Map();   // clave -> { nombre, email, telefono } (tabla clientes_ocultos)
let clientes = [];         // filas visibles del modo actual (para la ficha y el borrado)
let modo = 'activos';      // 'activos' | 'eliminados'
let aviso = '';            // error al leer clientes_ocultos (p. ej. 0063 sin aplicar)
let busqueda = '';
let desde = '';
let hasta = '';
const seleccion = new Set(); // claves de clientes seleccionados

// ---------- Sección ----------
export async function renderizar(contenedor) {
    estadoCargando(contenedor, 'Cargando clientes…');
    const [ords, ocs] = await Promise.all([traerOrdenes(), traerOcultos()]);

    ordenes = ords;
    ocultos = ocs;
    modo = 'activos';
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

async function traerOcultos() {
    const sb = await clienteAdmin();
    const { data, error } = await sb
        .from('clientes_ocultos')
        .select('clave, nombre, email, telefono');

    // Si la migración 0063 todavía no está aplicada, la sección sigue andando
    // (sin clientes quitados) y avisa en pantalla en vez de romperse entera.
    if (error) {
        aviso = error.message;
        return new Map();
    }
    aviso = '';

    const mapa = new Map();
    (Array.isArray(data) ? data : []).forEach((r) => {
        mapa.set(r.clave, { nombre: r.nombre || '', email: r.email || '', telefono: r.telefono || '' });
    });
    return mapa;
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
// Los pedidos vienen del más reciente al más viejo, así que el primer snapshot
// de cada cliente es el más actualizado.
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

// Un registro por cliente con al menos un pedido confirmado.
function construirClientes() {
    const mapa = new Map();

    for (const o of ordenes) {
        if (!ESTADOS_CONFIRMADOS.includes(o.estado)) continue;
        if (!dentroDelRango(o.created_at)) continue;
        const datos = clienteDe(o);
        if (!datos) continue;
        const clave = claveDe(datos);
        if (!clave) continue;

        let reg = mapa.get(clave);
        if (!reg) {
            reg = { clave, datos, pedidos: 0, total: 0, primera: '', ultima: '' };
            mapa.set(clave, reg);
        }
        reg.pedidos += 1;
        reg.total += Number(o.total || 0);
        const t = new Date(o.created_at).getTime();
        if (!Number.isNaN(t)) {
            if (!reg.primera || t < new Date(reg.primera).getTime()) reg.primera = o.created_at;
            if (!reg.ultima || t > new Date(reg.ultima).getTime()) reg.ultima = o.created_at;
        }
    }

    return [...mapa.values()].sort((a, b) => new Date(b.ultima || 0) - new Date(a.ultima || 0));
}

// ---------- Render ----------
function pintar(contenedor) {
    const base = modo === 'eliminados'
        ? [...ocultos.entries()]
            .map(([clave, datos]) => ({ clave, datos }))
            .sort((a, b) => String(a.datos.nombre || '').localeCompare(String(b.datos.nombre || ''), 'es'))
        : construirClientes().filter((r) => !ocultos.has(r.clave));

    // Descarta selecciones que ya no pertenecen al modo visible.
    const vivas = new Set(base.map((r) => r.clave));
    [...seleccion].forEach((k) => { if (!vivas.has(k)) seleccion.delete(k); });

    const texto = busqueda.trim().toLowerCase();
    const visibles = texto
        ? base.filter((r) => {
            const d = r.datos || {};
            return [d.nombre, d.email, d.telefono]
                .some((v) => String(v || '').toLowerCase().includes(texto));
        })
        : base;
    clientes = visibles;

    const conSeleccion = seleccion.size > 0;
    const todosVisibles = visibles.length > 0 && visibles.every((r) => seleccion.has(r.clave));
    const algunosVisibles = !todosVisibles && visibles.some((r) => seleccion.has(r.clave));
    const hayFecha = Boolean(desde || hasta);
    const esEliminados = modo === 'eliminados';

    contenedor.innerHTML = `
        <div class="admin-filtros admin-filtros-chips">
            <button type="button" class="admin-chip ${esEliminados ? '' : 'active'}" data-modo="activos">Clientes</button>
            <button type="button" class="admin-chip ${esEliminados ? 'active' : ''}" data-modo="eliminados">Eliminados (${ocultos.size})</button>
        </div>

        <div class="admin-filtros">
            ${esEliminados ? '' : `
            <div class="cli-filtro-fechas">
                <label>Desde <input type="date" id="cliDesde" value="${esc(desde)}"></label>
                <label>Hasta <input type="date" id="cliHasta" value="${esc(hasta)}"></label>
                ${hayFecha ? '<button type="button" class="btn btn-sm btn-outline" id="cliLimpiarFechas"><i class="fa-solid fa-xmark"></i> Limpiar</button>' : ''}
            </div>`}
            <input type="text" id="cliBuscar" class="admin-busqueda" placeholder="Buscar por nombre, email o teléfono…" value="${esc(busqueda)}">
            <p class="cli-contador">${visibles.length} ${esEliminados ? 'eliminado(s)' : 'cliente(s)'}</p>
        </div>

        <p class="cli-nota">
            <i class="fa-solid fa-circle-info"></i>
            ${esEliminados
                ? 'Estos clientes los sacaste de la lista. Sus pedidos siguen intactos; podés restaurarlos cuando quieras.'
                : `Se listan los clientes con al menos un pedido confirmado${hayFecha ? ' dentro del rango de fechas elegido' : ''}.
                   Quitar un cliente sólo lo saca de esta lista: <strong>sus pedidos no se borran</strong>.`}
        </p>

        ${aviso ? `
        <p class="cli-nota cli-nota--aviso">
            <i class="fa-solid fa-triangle-exclamation"></i>
            No se pudo leer la lista de clientes quitados (¿falta aplicar la migración 0063?). Hasta resolverlo, quitar y restaurar van a fallar.
        </p>` : ''}

        ${conSeleccion ? `
        <div class="admin-bulkbar" role="status">
            <span class="admin-bulkbar-info"><i class="fa-solid fa-square-check"></i> <strong>${seleccion.size}</strong> ${esEliminados ? 'eliminado(s)' : 'cliente(s)'} seleccionado(s)</span>
            <div class="admin-bulkbar-acciones">
                <button type="button" class="btn btn-sm btn-outline" id="btnLimpiarSeleccion">Quitar selección</button>
                ${esEliminados
                    ? '<button type="button" class="btn btn-sm btn-primary" id="btnRestaurarSeleccion"><i class="fa-solid fa-rotate-left"></i> Restaurar seleccionados</button>'
                    : '<button type="button" class="btn btn-sm btn-primary" id="btnQuitarSeleccion"><i class="fa-solid fa-eye-slash"></i> Quitar de la lista</button>'}
            </div>
        </div>` : ''}

        ${visibles.length === 0 ? `
        <div class="admin-card">
            <div class="admin-empty">
                <i class="fa-solid fa-users"></i>
                <h3>${esEliminados
                    ? 'No hay clientes eliminados'
                    : (base.length === 0 ? 'Todavía no hay clientes' : 'Sin resultados')}</h3>
                <p>${esEliminados
                    ? 'Cuando quites un cliente de la lista, va a aparecer acá para poder restaurarlo.'
                    : (base.length === 0
                        ? 'Cuando confirmes pedidos, acá vas a ver a tus clientes.'
                        : 'No se encontraron clientes con estos filtros.')}</p>
            </div>
        </div>` : `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr>
                        <th class="th-check"><label class="admin-check" title="Seleccionar todos los visibles"><input type="checkbox" id="selTodos" aria-label="Seleccionar todos los visibles" ${todosVisibles ? 'checked' : ''}></label></th>
                        ${esEliminados
                            ? '<th>Cliente</th><th>Teléfono</th><th></th>'
                            : '<th>Cliente</th><th>Teléfono</th><th>Pedidos</th><th>Total</th><th>Última compra</th><th></th>'}
                    </tr>
                </thead>
                <tbody>
                    ${visibles.map((r) => filaCliente(r, esEliminados)).join('')}
                </tbody>
            </table>
        </div>`}
    `;

    // Cambio de modo (Clientes / Eliminados)
    contenedor.querySelectorAll('[data-modo]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.modo === modo) return;
            modo = btn.dataset.modo;
            seleccion.clear();
            pintar(contenedor);
        });
    });

    // Filtro por fecha
    const iDesde = $('#cliDesde');
    if (iDesde) iDesde.addEventListener('change', () => { desde = iDesde.value; pintar(contenedor); });
    const iHasta = $('#cliHasta');
    if (iHasta) iHasta.addEventListener('change', () => { hasta = iHasta.value; pintar(contenedor); });
    const btnLimpiarFechas = $('#cliLimpiarFechas');
    if (btnLimpiarFechas) btnLimpiarFechas.addEventListener('click', () => { desde = ''; hasta = ''; pintar(contenedor); });

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

    // Ficha del cliente
    contenedor.querySelectorAll('[data-ver-cliente]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalCliente(btn.dataset.verCliente));
    });

    // Acciones individuales según el modo
    contenedor.querySelectorAll('[data-quitar-cliente]').forEach((btn) => {
        btn.addEventListener('click', () => quitarDeLista([btn.dataset.quitarCliente], contenedor));
    });
    contenedor.querySelectorAll('[data-restaurar-cliente]').forEach((btn) => {
        btn.addEventListener('click', () => restaurarClientes([btn.dataset.restaurarCliente], contenedor));
    });

    const btnLimpiarSeleccion = $('#btnLimpiarSeleccion');
    if (btnLimpiarSeleccion) btnLimpiarSeleccion.addEventListener('click', () => { seleccion.clear(); pintar(contenedor); });
    const btnQuitarSeleccion = $('#btnQuitarSeleccion');
    if (btnQuitarSeleccion) btnQuitarSeleccion.addEventListener('click', () => quitarDeLista([...seleccion], contenedor));
    const btnRestaurarSeleccion = $('#btnRestaurarSeleccion');
    if (btnRestaurarSeleccion) btnRestaurarSeleccion.addEventListener('click', () => restaurarClientes([...seleccion], contenedor));
}

function filaCliente(r, esEliminados) {
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
            ${esEliminados ? '' : `
            <td data-label="Pedidos"><span class="estado-badge estado-confirmado">${esc(r.pedidos)}</span></td>
            <td data-label="Total"><strong>$${formatearPrecio(r.total)}</strong></td>
            <td data-label="Última compra">${r.ultima ? esc(formatearFecha(r.ultima)) : '<span style="color:var(--text-muted);">—</span>'}</td>`}
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-ver-cliente="${esc(r.clave)}" title="Ver datos" aria-label="Ver datos de ${esc(nombre)}"><i class="fa-solid fa-eye"></i></button>
                ${esEliminados
                    ? `<button type="button" class="btn btn-sm btn-primary" data-restaurar-cliente="${esc(r.clave)}" title="Restaurar" aria-label="Restaurar a ${esc(nombre)}"><i class="fa-solid fa-rotate-left"></i></button>`
                    : `<button type="button" class="btn btn-sm" data-quitar-cliente="${esc(r.clave)}" title="Quitar de la lista" aria-label="Quitar de la lista a ${esc(nombre)}"><i class="fa-solid fa-eye-slash"></i></button>`}
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
    const oculto = ocultos.has(r.clave);

    abrirModal(`
        <h2>${esc(nombre)}</h2>
        <p class="modal-sub">Datos de contacto del cliente${oculto ? ' · quitado de la lista' : ''}</p>

        <div class="cli-detalle">
            ${d.email ? `<div class="cli-detalle-item"><i class="fa-solid fa-envelope"></i><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></div>` : ''}
            ${d.telefono ? `<div class="cli-detalle-item"><i class="fa-solid fa-phone"></i><a href="tel:${esc(telDigitos)}">${esc(d.telefono)}</a></div>` : ''}
            ${ubicacion ? `<div class="cli-detalle-item"><i class="fa-solid fa-location-dot"></i><span>${esc(ubicacion)}</span></div>` : ''}
            ${d.codigoPostal ? `<div class="cli-detalle-item"><i class="fa-solid fa-map-pin"></i><span>CP ${esc(d.codigoPostal)}</span></div>` : ''}
            ${d.notas ? `<div class="cli-detalle-item"><i class="fa-solid fa-pen-to-square"></i><span>${esc(d.notas)}</span></div>` : ''}
            ${sinDatos ? '<p class="cli-sin-datos">Este cliente no cargó datos de contacto.</p>' : ''}
        </div>

        ${r.pedidos === undefined ? '' : `
        <h3 class="cli-resumen-titulo">Resumen de compras</h3>
        <div class="cli-resumen">
            <div><span>Pedidos confirmados</span><strong>${esc(r.pedidos)}</strong></div>
            <div><span>Total</span><strong>$${formatearPrecio(r.total)}</strong></div>
            <div><span>Primera compra</span><strong>${r.primera ? esc(formatearFecha(r.primera)) : '—'}</strong></div>
            <div><span>Última compra</span><strong>${r.ultima ? esc(formatearFecha(r.ultima)) : '—'}</strong></div>
        </div>`}

        <div class="admin-modal-acciones">
            <button type="button" class="btn btn-primary" data-cerrar-modal>Cerrar</button>
        </div>
    `);
}

// ---------- Quitar / restaurar (no borra pedidos) ----------
async function quitarDeLista(claves, contenedor) {
    const registros = construirClientes().filter((r) => claves.includes(r.clave) && !ocultos.has(r.clave));
    if (registros.length === 0) return;

    const unCliente = registros.length === 1;
    const nombre = String(registros[0]?.datos?.nombre || '').trim() || 'Sin nombre';

    const ok = await confirmarDialogo({
        titulo: 'Quitar de la lista',
        mensaje: (unCliente
            ? `¿Quitar a <strong>${esc(nombre)}</strong> de la lista de clientes?`
            : `¿Quitar <strong>${registros.length}</strong> clientes de la lista?`)
            + '<br><br>El cliente dejará de aparecer en esta sección. <strong>Sus pedidos no se borran</strong>: podés restaurarlo desde «Eliminados».',
        textoConfirmar: 'Quitar',
        peligro: false,
        mensajeHtml: true
    });
    if (!ok) return;

    const filas = registros.map((r) => {
        const d = r.datos || {};
        return {
            clave: r.clave,
            nombre: String(d.nombre || '').trim(),
            email: String(d.email || '').trim(),
            telefono: String(d.telefono || '').trim()
        };
    });

    try {
        const sb = await clienteAdmin();
        const { error } = await sb.from('clientes_ocultos').upsert(filas, { onConflict: 'clave' });
        if (error) throw new Error(error.message);

        filas.forEach((f) => ocultos.set(f.clave, { nombre: f.nombre, email: f.email, telefono: f.telefono }));
        seleccion.clear();
        toast(unCliente
            ? 'Cliente quitado de la lista (sus pedidos siguen intactos).'
            : `${registros.length} clientes quitados de la lista.`);
        pintar(contenedor);
    } catch (error) {
        toast(`No se pudo quitar: ${error.message}`, 'error');
    }
}

async function restaurarClientes(claves, contenedor) {
    const aRestaurar = claves.filter((k) => ocultos.has(k));
    if (aRestaurar.length === 0) return;

    try {
        const sb = await clienteAdmin();
        const { error } = await sb.from('clientes_ocultos').delete().in('clave', aRestaurar);
        if (error) throw new Error(error.message);

        aRestaurar.forEach((k) => ocultos.delete(k));
        seleccion.clear();
        toast(aRestaurar.length === 1
            ? 'Cliente restaurado.'
            : `${aRestaurar.length} clientes restaurados.`);
        pintar(contenedor);
    } catch (error) {
        toast(`No se pudo restaurar: ${error.message}`, 'error');
    }
}
