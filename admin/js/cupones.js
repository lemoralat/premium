// cupones.js — CRUD de cupones de descuento.

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, fechaInput } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

let cupones = [];
export let cuponesCargados = false;

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('coupons').select('*').order('id', { ascending: true });
    if (error) throw error;
    cupones = data || [];
    cuponesCargados = true;

    contenedor.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
            <p style="color:var(--text-muted); margin:0;">Códigos de descuento manuales</p>
            <button type="button" class="btn btn-primary" id="btnNuevoCupon">
                <i class="fa-solid fa-plus"></i> Nuevo cupón
            </button>
        </div>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Código</th><th>Descuento</th><th>Vence</th><th>Vigencia</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    $('#btnNuevoCupon').addEventListener('click', () => abrirModalCupon(null));
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalCupon(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarCupon(Number(btn.dataset.borrar), contenedor));
    });
}

function filas() {
    if (!cupones.length) {
        return `<tr><td colspan="5"><div class="admin-empty"><p>No hay cupones todavía.</p></div></td></tr>`;
    }
    const hoy = new Date().toISOString().slice(0, 10);
    return cupones.map((c) => {
        const vencido = c.expira < hoy;
        return `
        <tr>
            <td><strong>${esc(c.codigo)}</strong></td>
            <td>${esc(c.porcentaje)}%</td>
            <td>${esc(fechaInput(c.expira))}</td>
            <td>
                ${!c.activo
                    ? '<span class="estado-badge estado-cancelado">Inactivo</span>'
                    : vencido
                        ? '<span class="estado-badge estado-pendiente">Vencido</span>'
                        : '<span class="estado-badge estado-entregado">Vigente</span>'}
            </td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(c.id)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(c.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function abrirModalCupon(idExistente) {
    const cupon = idExistente ? cupones.find((c) => c.id === idExistente) : null;

    abrirModal(`
        <h2>${cupon ? 'Editar cupón' : 'Nuevo cupón'}</h2>
        <p class="modal-sub">${cupon ? esc(cupon.codigo) : 'Creá un código de descuento para tus clientes'}</p>
        <form class="admin-form" id="cuponForm">
            <input type="hidden" id="cpnId" value="${cupon ? cupon.id : ''}">
            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="cpnCodigo">Código</label>
                    <input type="text" id="cpnCodigo" required value="${esc(cupon?.codigo || '')}"
                           placeholder="ej: VERANO25" style="text-transform:uppercase;">
                </div>
                <div class="admin-field">
                    <label for="cpnPorcentaje">Porcentaje de descuento (%)</label>
                    <input type="number" id="cpnPorcentaje" required min="1" max="100" step="1"
                           value="${esc(cupon?.porcentaje ?? '')}" placeholder="ej: 10">
                </div>
                <div class="admin-field">
                    <label for="cpnExpira">Fecha de vencimiento</label>
                    <input type="date" id="cpnExpira" required value="${esc(cupon ? fechaInput(cupon.expira) : '')}">
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="cpnActivo" ${cupon?.activo === false ? '' : 'checked'}>
                        Cupón activo
                    </label>
                </div>
            </div>
            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    $('#cuponForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter;
        const codigo = $('#cpnCodigo').value.trim().toUpperCase();
        const porcentaje = parseInt($('#cpnPorcentaje').value);
        const expira = $('#cpnExpira').value;

        if (!codigo || !porcentaje || !expira) {
            toast('Completá código, porcentaje y vencimiento.', 'error');
            return;
        }
        if (porcentaje < 1 || porcentaje > 100) {
            toast('El porcentaje debe estar entre 1 y 100.', 'error');
            return;
        }

        const id = $('#cpnId').value;
        conCarga(submitBtn, guardarCupon({ codigo, porcentaje, expira, activo: $('#cpnActivo').checked }, id ? Number(id) : null))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarCupon(payload, id) {
    const sb = await clienteAdmin();
    const { error } = id
        ? await sb.from('coupons').update(payload).eq('id', id)
        : await sb.from('coupons').insert(payload);
    if (error) throw new Error(error.message);
    toast(id ? 'Cupón actualizado.' : 'Cupón creado.');
}

async function borrarCupon(id, contenedor) {
    if (!confirmarBorrado('¿Eliminar este cupón?')) return;
    const sb = await clienteAdmin();
    const { error } = await sb.from('coupons').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    toast('Cupón eliminado.');
    renderizar(contenedor);
}