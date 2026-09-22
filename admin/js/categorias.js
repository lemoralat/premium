// categorias.js — CRUD de categorías.

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, estadoVacio } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

let categorias = [];

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('categories').select('*').order('position', { ascending: true });
    if (error) throw error;
    categorias = data || [];

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Organizá el catálogo por categorías</p>
            <button type="button" class="btn btn-primary" id="btnNuevaCategoria">
                <i class="fa-solid fa-plus"></i> Nueva categoría
            </button>
        </div>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Nombre</th><th>Slug</th><th>Orden</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody id="categoriasTbody">${filas()}</tbody>
            </table>
        </div>
    `;

    $('#btnNuevaCategoria').addEventListener('click', () => abrirModalCategoria(null));
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalCategoria(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarCategoria(Number(btn.dataset.borrar), contenedor));
    });
}

function filas() {
    if (!categorias.length) {
        return `<tr><td colspan="5"><div class="admin-empty"><p>No hay categorías todavía.</p></div></td></tr>`;
    }
    return categorias.map((c) => `
        <tr>
            <td data-label="Nombre"><strong>${esc(c.name)}</strong></td>
            <td data-label="Slug"><code>${esc(c.slug)}</code></td>
            <td data-label="Orden">${esc(c.position)}</td>
            <td data-label="Estado">${c.active
                ? '<span class="estado-badge estado-entregado">Activa</span>'
                : '<span class="estado-badge estado-cancelado">Inactiva</span>'}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(c.id)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(c.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function abrirModalCategoria(idExistente) {
    const categoria = idExistente ? categorias.find((c) => c.id === idExistente) : null;

    abrirModal(`
        <h2>${categoria ? 'Editar categoría' : 'Nueva categoría'}</h2>
        <p class="modal-sub">${categoria ? esc(categoria.name) : 'Creá una categoría para agrupar productos'}</p>
        <form class="admin-form" id="categoriaForm">
            <input type="hidden" id="catId" value="${categoria ? categoria.id : ''}">
            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="catName">Nombre</label>
                    <input type="text" id="catName" required value="${esc(categoria?.name || '')}"
                           placeholder="Ej: Calzado, Abrigos…">
                </div>
                <div class="admin-field">
                    <label for="catSlug">Slug (identificador)</label>
                    <input type="text" id="catSlug" required value="${esc(categoria?.slug || '')}"
                           placeholder="ej: calzado">
                    <span class="hint">Se usa en los enlaces de la tienda (índice#cat-calzado).</span>
                </div>
                <div class="admin-field">
                    <label for="catPosition">Posición (orden)</label>
                    <input type="number" id="catPosition" min="0" step="1" value="${esc(categoria?.position ?? (categorias.length + 1))}">
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="catActivo" ${categoria?.active === false ? '' : 'checked'}>
                        Categoría activa (visible en la tienda)
                    </label>
                </div>
            </div>
            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    $('#catSlug').addEventListener('input', (e) => {
        e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    });

    $('#categoriaForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter;
        const payload = {
            name: $('#catName').value.trim(),
            slug: $('#catSlug').value.trim().toLowerCase(),
            position: parseInt($('#catPosition').value) || 0,
            active: $('#catActivo').checked
        };
        if (!payload.name || !payload.slug) {
            toast('Completá nombre y slug.', 'error');
            return;
        }
        const id = $('#catId').value;
        conCarga(submitBtn, guardarCategoria(payload, id ? Number(id) : null))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarCategoria(payload, id) {
    const sb = await clienteAdmin();
    const { error } = id
        ? await sb.from('categories').update(payload).eq('id', id)
        : await sb.from('categories').insert(payload);
    if (error) throw new Error(error.message);
    toast(id ? 'Categoría actualizada.' : 'Categoría creada.');
}

async function borrarCategoria(id, contenedor) {
    if (!(await confirmarBorrado('¿Eliminar esta categoría? Los productos quedan sin categoría, no se borran.'))) return;

    const sb = await clienteAdmin();
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    toast('Categoría eliminada.');
    renderizar(contenedor);
}