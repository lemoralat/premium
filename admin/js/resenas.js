// resenas.js — CRUD de testimonios de clientes.

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, placeholderImagen, mostrarPreviewImagen } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

let reseñas = [];

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('reviews').select('*').order('position', { ascending: true });
    if (error) throw error;
    reseñas = data || [];

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Testimonios que se muestran en el inicio</p>
            <button type="button" class="btn btn-primary" id="btnNuevaResena">
                <i class="fa-solid fa-plus"></i> Nueva reseña
            </button>
        </div>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Cliente</th><th>Valoración</th><th>Texto</th><th>Fecha</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    $('#btnNuevaResena').addEventListener('click', () => abrirModalResena(null));
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalResena(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarResena(Number(btn.dataset.borrar), contenedor));
    });
}

function fotoClienteHtml(resena) {
    const imagen = urlPublica(resena.storage_path || resena.external_url || '');
    return imagen
        ? `<img src="${esc(imagen)}" alt="" style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:1px solid var(--border); flex-shrink:0;">`
        : placeholderImagen('admin-image-placeholder--avatar', 'Sin foto');
}

function filas() {
    if (!reseñas.length) {
        return `<tr><td colspan="6"><div class="admin-empty"><p>No hay reseñas.</p></div></td></tr>`;
    }
    return reseñas.map((r) => `
        <tr>
            <td class="td-principal">
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    ${fotoClienteHtml(r)}
                    <strong>${esc(r.nombre)}</strong>
                </div>
            </td>
            <td data-label="Valoración"><span style="color:var(--warning);">${'★'.repeat(r.valoracion)}${'☆'.repeat(5 - r.valoracion)}</span></td>
            <td data-label="Texto">${esc(recCorto(r.resena))}</td>
            <td data-label="Fecha">${esc(String(r.fecha || ''))}</td>
            <td data-label="Estado">${r.activo
                ? '<span class="estado-badge estado-entregado">Activa</span>'
                : '<span class="estado-badge estado-cancelado">Inactiva</span>'}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(r.id)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(r.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function recCorto(texto) {
    return String(texto || '');
}

function abrirModalResena(idExistente) {
    const reseña = idExistente ? reseñas.find((r) => r.id === idExistente) : null;

    abrirModal(`
        <h2>${reseña ? 'Editar reseña' : 'Nueva reseña'}</h2>
        <p class="modal-sub">${reseña ? esc(reseña.nombre) : 'Agregá un testimonio de un cliente'}</p>
        <form class="admin-form" id="resenaForm">
            <input type="hidden" id="rsnId" value="${reseña ? reseña.id : ''}">

            <div class="admin-field full">
                <label>Foto del cliente (opcional)</label>
                <div class="admin-img-upload">
                    <div id="rsnPreview" class="admin-preview admin-preview--avatar">
                        ${reseña?.storage_path || reseña?.external_url
                            ? `<img class="admin-preview-image" src="${esc(urlPublica(reseña.storage_path || reseña.external_url))}" alt="">`
                            : placeholderImagen('', 'Sin foto')}
                    </div>
                    <label class="btn btn-outline admin-file-btn">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Elegir foto
                        <input type="file" id="rsnArchivo" accept="image/jpeg,image/png,image/webp">
                    </label>
                    <input type="url" id="rsnUrl" class="admin-url-input" placeholder="…o pegá una URL de foto"
                           value="${esc(reseña && !reseña.storage_path ? (reseña.external_url || '') : '')}">
                </div>
            </div>

            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="rsnNombre">Nombre del cliente</label>
                    <input type="text" id="rsnNombre" required value="${esc(reseña?.nombre || '')}">
                </div>
                <div class="admin-field">
                    <label for="rsnValoracion">Valoración</label>
                    <select id="rsnValoracion">
                        ${[5, 4, 3, 2, 1].map((v) => `
                            <option value="${v}" ${reseña?.valoracion === v ? 'selected' : ''}>${'★'.repeat(v)}${'☆'.repeat(5 - v)} (${v})</option>
                        `).join('')}
                    </select>
                </div>
                <div class="admin-field full">
                    <label for="rsnTexto">Reseña</label>
                    <textarea id="rsnTexto" required>${esc(reseña?.resena || '')}</textarea>
                </div>
                <div class="admin-field">
                    <label for="rsnFecha">Fecha</label>
                    <input type="date" id="rsnFecha" required value="${esc(reseña ? String(reseña.fecha).slice(0, 10) : '')}">
                </div>
                <div class="admin-field">
                    <label for="rsnPosition">Orden</label>
                    <input type="number" id="rsnPosition" min="0" step="1" value="${esc(reseña?.position ?? (reseñas.length + 1))}">
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="rsnActivo" ${reseña?.activo === false ? '' : 'checked'}>
                        Reseña activa (visible en la tienda)
                    </label>
                </div>
            </div>

            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    $('#rsnArchivo').addEventListener('change', async () => {
        const archivo = $('#rsnArchivo').files[0];
        if (!archivo) return;
        try {
            const lista = await validarYOptimizarImagen(archivo);
            mostrarPreviewImagen($('#rsnPreview'), URL.createObjectURL(lista && lista.size ? lista : archivo), 'Vista previa de la foto');
        } catch (error) { toast(error.message, 'error'); $('#rsnArchivo').value = ''; }
    });

    $('#resenaForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#resenaForm').querySelector('[type="submit"]');

        const idValor = $('#rsnId').value;
        const archivo = $('#rsnArchivo').files[0];
        const urlExterna = $('#rsnUrl').value.trim();
        if (archivo && urlExterna) {
            toast('Elegí una sola fuente de foto: archivo o URL.', 'error');
            return;
        }

        const payload = {
            nombre: $('#rsnNombre').value.trim(),
            valoracion: parseInt($('#rsnValoracion').value),
            resena: $('#rsnTexto').value.trim(),
            fecha: $('#rsnFecha').value,
            position: parseInt($('#rsnPosition').value) || 0,
            activo: $('#rsnActivo').checked
        };
        if (!payload.nombre || !payload.resena || !payload.fecha) {
            toast('Completá nombre, reseña y fecha.', 'error');
            return;
        }

        conCarga(submitBtn, guardarResena(payload, idValor ? Number(idValor) : null, archivo, urlExterna))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarResena(payload, id, archivo, urlExterna) {
    const sb = await clienteAdmin();
    const previo = id ? reseñas.find((r) => r.id === id) : null;

    let registroId = id;
    if (id) {
        const { error } = await sb.from('reviews').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { data, error } = await sb.from('reviews').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        registroId = data?.id;
    }

    if (archivo || urlExterna) {
        const actualizacion = {};
        if (archivo) {
            actualizacion.storage_path = await subirImagenAdmin('reviews', 'avatares', archivo);
            actualizacion.external_url = null;
        } else {
            actualizacion.storage_path = null;
            actualizacion.external_url = urlExterna;
        }
        const { error } = await sb.from('reviews').update(actualizacion).eq('id', registroId);
        if (error) throw new Error(error.message);
        if (archivo && previo?.storage_path) await eliminarImagenAdmin(previo.storage_path);
    }

    toast(id ? 'Reseña actualizada.' : 'Reseña creada.');
}

async function borrarResena(id, contenedor) {
    if (!(await confirmarBorrado('¿Eliminar esta reseña?'))) return;
    const sb = await clienteAdmin();
    const reseña = reseñas.find((r) => r.id === id);
    const { error } = await sb.from('reviews').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    if (reseña?.storage_path) await eliminarImagenAdmin(reseña.storage_path);
    toast('Reseña eliminada.');
    renderizar(contenedor);
}