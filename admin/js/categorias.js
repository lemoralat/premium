// categorias.js — CRUD de categorías.
//
// Cada categoría puede tener una imagen de fondo (categories.imagen_path, 0062)
// que la tienda usa como banner en su página individual
// (categoria.html?slug=…). Es opcional: sin imagen, el banner usa el color de
// marca. El archivo vive en el bucket "branding" (carpeta "categorias").

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, placeholderImagen, mostrarPreviewImagen, LIMITES_IMAGEN } from './admin-ui.js';
import { clienteAdmin, leerModoWeb } from './admin-supabase.js';

let categorias = [];
let esTurnos = false; // modo de la tienda: ajusta "productos" → "servicios"

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();
    esTurnos = (await leerModoWeb()) === 'turnos';

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

// Preview del banner: imagen actual (si hay) o el placeholder del panel.
function previewBannerHTML(imagenPath) {
    return imagenPath
        ? `<img class="admin-preview-image" src="${esc(urlPublica(imagenPath))}" alt="">`
        : placeholderImagen('', 'Sin imagen');
}

function abrirModalCategoria(idExistente) {
    const categoria = idExistente ? categorias.find((c) => c.id === idExistente) : null;

    // Imagen elegida en esta edición (aún no subida) y flag de "quitar la
    // actual". El archivo se sube recién al guardar, para no dejar huérfanos si
    // el admin cancela el modal.
    let imagenOptimizada = null;
    let quitarImagen = false;

    abrirModal(`
        <h2>${categoria ? 'Editar categoría' : 'Nueva categoría'}</h2>
        <p class="modal-sub">${categoria ? esc(categoria.name) : `Creá una categoría para agrupar ${esTurnos ? 'servicios' : 'productos'}`}</p>
        <form class="admin-form" id="categoriaForm">
            <input type="hidden" id="catId" value="${categoria ? categoria.id : ''}">

            <div class="admin-field full">
                <label>Imagen del banner (opcional)</label>
                <p class="hint">Se muestra como fondo del banner en la página de la categoría. Si no cargás ninguna, el banner usa el color de la tienda.</p>
                <div class="admin-imagenes">
                    <div class="admin-preview admin-preview--banner" id="catImagenPreview">
                        ${previewBannerHTML(categoria?.imagen_path)}
                    </div>
                    <div class="admin-img-upload">
                        <label class="btn btn-sm btn-outline admin-file-btn">
                            <i class="fa-solid fa-cloud-arrow-up"></i> Elegir imagen
                            <input type="file" id="catImagenArchivo" accept="image/jpeg,image/png,image/webp">
                        </label>
                        <button type="button" class="btn btn-sm btn-danger" id="catQuitarImagen" ${categoria?.imagen_path ? '' : 'hidden'}>
                            <i class="fa-solid fa-trash-can"></i> Quitar
                        </button>
                    </div>
                </div>
            </div>

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
                    <span class="hint">Se usa en la página de la categoría (/categoria?slug=calzado).</span>
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

    $('#catImagenArchivo').addEventListener('change', async () => {
        const archivo = $('#catImagenArchivo').files[0];
        if (!archivo) return;
        try {
            imagenOptimizada = await validarYOptimizarImagen(archivo, { maxLado: LIMITES_IMAGEN.categoria });
            quitarImagen = false;
            mostrarPreviewImagen($('#catImagenPreview'), URL.createObjectURL(imagenOptimizada), 'Vista previa del banner');
            $('#catQuitarImagen').hidden = false;
        } catch (error) {
            toast(error.message, 'error');
            $('#catImagenArchivo').value = '';
        }
    });

    $('#catQuitarImagen').addEventListener('click', () => {
        imagenOptimizada = null;
        quitarImagen = true;
        $('#catImagenArchivo').value = '';
        $('#catImagenPreview').innerHTML = placeholderImagen('', 'Sin imagen');
        $('#catQuitarImagen').hidden = true;
    });

    $('#categoriaForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#categoriaForm').querySelector('[type="submit"]');

        const idValor = $('#catId').value;
        const payload = {
            name: $('#catName').value.trim(),
            slug: $('#catSlug').value.trim(),
            position: parseInt($('#catPosition').value) || 0,
            active: $('#catActivo').checked
        };
        if (!payload.name || !payload.slug) {
            toast('Completá nombre y slug.', 'error');
            return;
        }
        conCarga(submitBtn, guardarCategoria(payload, idValor ? Number(idValor) : null, { imagenOptimizada, quitarImagen }))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarCategoria(payload, id, { imagenOptimizada = null, quitarImagen = false } = {}) {
    const sb = await clienteAdmin();
    const previo = id ? categorias.find((c) => c.id === id) : null;

    let registroId = id;
    if (id) {
        const { error } = await sb.from('categories').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { data, error } = await sb.from('categories').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        registroId = data?.id;
    }

    // Imagen: solo se toca si el admin eligió una nueva o pidió quitarla. Un
    // reemplazo sube primero y recién después borra el archivo anterior.
    if (imagenOptimizada) {
        const { error: errorImagen } = await sb.from('categories')
            .update({ imagen_path: await subirImagenAdmin('branding', 'categorias', imagenOptimizada) })
            .eq('id', registroId);
        if (errorImagen) throw new Error(errorImagen.message);
        if (previo?.imagen_path) await eliminarImagenAdmin(previo.imagen_path);
    } else if (quitarImagen && previo?.imagen_path) {
        const { error: errorQuitar } = await sb.from('categories')
            .update({ imagen_path: null })
            .eq('id', id);
        if (errorQuitar) throw new Error(errorQuitar.message);
        await eliminarImagenAdmin(previo.imagen_path);
    }

    toast(id ? 'Categoría actualizada.' : 'Categoría creada.');
}

async function borrarCategoria(id, contenedor) {
    if (!(await confirmarBorrado(`¿Eliminar esta categoría? Los ${esTurnos ? 'servicios' : 'productos'} quedan sin categoría, no se borran.`))) return;

    const sb = await clienteAdmin();
    const categoria = categorias.find((c) => c.id === id);
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    // Limpieza del banner en Storage (si tenía).
    if (categoria?.imagen_path) await eliminarImagenAdmin(categoria.imagen_path);
    toast('Categoría eliminada.');
    renderizar(contenedor);
}
