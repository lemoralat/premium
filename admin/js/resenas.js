// resenas.js — CRUD de testimonios de clientes.

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, placeholderImagen, mostrarPreviewImagen, LIMITES_IMAGEN } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

// Opciones del selector de red. Debe coincidir con el CHECK de la columna
// reviews.red (migración 0029) y con el mapa REDES de js/testimonios.js.
// El ícono de cada opción se pinta con Font Awesome Brands, igual que en la
// tienda, así el admin ve exactamente lo que va a ver el cliente.
const REDES = [
    { valor: 'fa-google',    etiqueta: 'Google' },
    { valor: 'fa-facebook',  etiqueta: 'Facebook' },
    { valor: 'fa-instagram', etiqueta: 'Instagram' },
    { valor: 'fa-x-twitter', etiqueta: 'X' },
    { valor: 'fa-tiktok',    etiqueta: 'TikTok' },
    { valor: 'fa-youtube',   etiqueta: 'YouTube' },
    { valor: 'fa-linkedin',  etiqueta: 'LinkedIn' },
    { valor: 'fa-whatsapp',  etiqueta: 'WhatsApp' }
];
const RED_POR_DEFECTO = 'fa-google';

let reseñas = [];

// Tope de testimonios. La garantía real está en la BD (trigger
// trg_resenas_max, migración 0039): esto es la parte amable, que evita que el
// admin llegue al error. El trigger cuenta TODAS las filas, y acá también: un
// testimonio oculto sigue ocupando un lugar en la tabla.
const MAX_RESENAS = 10;

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('reviews').select('*').order('position', { ascending: true });
    if (error) throw error;
    reseñas = data || [];

    // El botón se apaga al llegar al tope. `reseñas` se relee en cada
    // renderizado, así que el estado nunca queda desfasado tras un borrado.
    const alTope = reseñas.length >= MAX_RESENAS;
    const quedan = MAX_RESENAS - reseñas.length;

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Testimonios que se muestran en el inicio</p>
            <button type="button" class="btn btn-primary" id="btnNuevaResena" ${alTope ? 'disabled title="Límite alcanzado"' : ''}>
                <i class="fa-solid fa-plus"></i> Nueva reseña
            </button>
        </div>
        <p class="hint">Máximo ${MAX_RESENAS} testimonios. ${alTope
            ? 'Límite alcanzado: borrá alguno para crear otro (desactivar no libera lugar).'
            : `Te quedan ${quedan}.`}</p>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Cliente</th><th>Red</th><th>Valoración</th><th>Texto</th><th>Fecha</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    if (!alTope) {
        $('#btnNuevaResena').addEventListener('click', () => abrirModalResena(null));
    }
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalResena(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarResena(Number(btn.dataset.borrar), contenedor));
    });
}

function fotoClienteHtml(resena) {
    const imagen = urlPublica(resena.storage_path || '');
    return imagen
        ? `<img src="${esc(imagen)}" alt="" style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:1px solid var(--border); flex-shrink:0;">`
        : placeholderImagen('admin-image-placeholder--avatar', 'Sin foto');
}

function redHtml(red) {
    // Misma lista que el selector. Una fila con un valor fuera de la lista (por
    // ejemplo si se agrandó la migración y el panel quedó atrás) cae en Google
    // en vez de renderizar una clase suelta.
    const opcion = REDES.find((r) => r.valor === red) || REDES[0];
    return `<span class="admin-red-badge"><i class="fa-brands ${esc(opcion.valor)}" aria-hidden="true"></i><span>${esc(opcion.etiqueta)}</span></span>`;
}

function filas() {
    if (!reseñas.length) {
        return `<tr><td colspan="7"><div class="admin-empty"><p>No hay reseñas.</p></div></td></tr>`;
    }
    return reseñas.map((r) => `
        <tr>
            <td class="td-principal">
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    ${fotoClienteHtml(r)}
                    <strong>${esc(r.nombre)}</strong>
                </div>
            </td>
            <td data-label="Red">${redHtml(r.red)}</td>
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
    let fotoOptimizada = null;

    abrirModal(`
        <h2>${reseña ? 'Editar reseña' : 'Nueva reseña'}</h2>
        <p class="modal-sub">${reseña ? esc(reseña.nombre) : 'Agregá un testimonio de un cliente'}</p>
        <form class="admin-form" id="resenaForm">
            <input type="hidden" id="rsnId" value="${reseña ? reseña.id : ''}">

            <div class="admin-field full">
                <label>Red de origen</label>
                <div class="admin-icon-picker" role="radiogroup" aria-label="Red de origen de la reseña">
                    ${REDES.map((red) => `
                        <label class="admin-icon-opcion">
                            <input type="radio" name="rsnRed" value="${esc(red.valor)}"
                                   ${(reseña?.red || RED_POR_DEFECTO) === red.valor ? 'checked' : ''}>
                            <i class="fa-brands ${esc(red.valor)}" aria-hidden="true"></i>
                            <span>${esc(red.etiqueta)}</span>
                        </label>
                    `).join('')}
                </div>
                <p class="hint">Se muestra el ícono de esa red en la card del testimonio.</p>
            </div>

            <div class="admin-field full">
                <label>Foto del cliente (opcional)</label>
                <div class="admin-img-upload">
                    <div id="rsnPreview" class="admin-preview admin-preview--avatar">
                        ${reseña?.storage_path
                            ? `<img class="admin-preview-image" src="${esc(urlPublica(reseña.storage_path))}" alt="">`
                            : placeholderImagen('', 'Sin foto')}
                    </div>
                    <label class="btn btn-outline admin-file-btn">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Elegir foto
                        <input type="file" id="rsnArchivo" accept="image/jpeg,image/png,image/webp">
                    </label>
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
            const lista = await validarYOptimizarImagen(archivo, { maxLado: LIMITES_IMAGEN.avatar });
            fotoOptimizada = lista;
            mostrarPreviewImagen($('#rsnPreview'), URL.createObjectURL(lista), 'Vista previa de la foto');
        } catch (error) { toast(error.message, 'error'); $('#rsnArchivo').value = ''; }
    });

    $('#resenaForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#resenaForm').querySelector('[type="submit"]');

        const idValor = $('#rsnId').value;
        const archivo = fotoOptimizada;

        // `idValor` vacío = reseña nueva. El botón ya viene deshabilitado en el
        // tope, pero si el panel está abierto en dos pestañas el `reseñas` de
        // esta quedó viejo: el trigger de 0039 lo rechaza igual, esto sólo
        // evita que el error llegue como toast de servidor.
        if (!idValor && reseñas.length >= MAX_RESENAS) {
            toast(`La lista admite máximo ${MAX_RESENAS} testimonios.`, 'error');
            return;
        }

        const redElegida = document.querySelector('input[name="rsnRed"]:checked');
        const payload = {
            nombre: $('#rsnNombre').value.trim(),
            valoracion: parseInt($('#rsnValoracion').value),
            resena: $('#rsnTexto').value.trim(),
            fecha: $('#rsnFecha').value,
            position: parseInt($('#rsnPosition').value) || 0,
            activo: $('#rsnActivo').checked,
            red: redElegida ? redElegida.value : RED_POR_DEFECTO
        };
        if (!payload.nombre || !payload.resena || !payload.fecha) {
            toast('Completá nombre, reseña y fecha.', 'error');
            return;
        }

        conCarga(submitBtn, guardarResena(payload, idValor ? Number(idValor) : null, archivo))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarResena(payload, id, archivo) {
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

    if (archivo) {
        const { error } = await sb.from('reviews')
            .update({ storage_path: await subirImagenAdmin('reviews', 'avatares', archivo) })
            .eq('id', registroId);
        if (error) throw new Error(error.message);
        if (previo?.storage_path) await eliminarImagenAdmin(previo.storage_path);
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