// banners.js — CRUD de banners promocionales (inicio y carrito).

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

let banners = [];

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('banners').select('*').order('position', { ascending: true });
    if (error) throw error;
    banners = data || [];

    contenedor.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
            <p style="color:var(--text-muted); margin:0;">El último banner activo es el que va en el carrito.</p>
            <button type="button" class="btn btn-primary" id="btnNuevoBanner">
                <i class="fa-solid fa-plus"></i> Nuevo banner
            </button>
        </div>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Imagen</th><th>Contenido</th><th>Orden</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    $('#btnNuevoBanner').addEventListener('click', () => abrirModalBanner(null));
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalBanner(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarBanner(Number(btn.dataset.borrar), contenedor));
    });
}

function filas() {
    if (!banners.length) {
        return `<tr><td colspan="5"><div class="admin-empty"><p>No hay banners.</p></div></td></tr>`;
    }
    return banners.map((b) => {
        const soloImagen = !b.logo_url && !b.logo_path && !b.badge && !b.titulo && !b.boton;
        return `
        <tr>
            <td style="width:130px;">
                <img src="${esc(urlPublica(b.imagen_path || b.imagen_url))}" alt=""
                     style="width:120px; height:70px; object-fit:cover; border-radius:8px; border:1px solid var(--border);">
            </td>
            <td>
                ${soloImagen
                    ? '<span class="estado-badge estado-procesando" style="margin-bottom:0.3rem;">Solo imagen</span>'
                    : `<strong>${esc(b.titulo)}</strong>${b.badge ? ` · <span class="estado-badge estado-entregado">${esc(b.badge)}</span>` : ''}`}
                ${b.link ? `<br><span style="color:var(--text-muted); font-size:0.8rem;">${esc(b.link)}</span> ${b.target === 'externo' ? '<span class="estado-badge estado-procesando">Externo</span>' : ''}` : ''}
            </td>
            <td>${esc(b.position)}</td>
            <td>${b.activo
                ? '<span class="estado-badge estado-entregado">Activo</span>'
                : '<span class="estado-badge estado-cancelado">Inactivo</span>'}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(b.id)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(b.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function abrirModalBanner(idExistente) {
    const banner = idExistente ? banners.find((b) => b.id === idExistente) : null;

    abrirModal(`
        <h2>${banner ? 'Editar banner' : 'Nuevo banner'}</h2>
        <p class="modal-sub">${banner
            ? `Banner #${banner.position + 1}`
            : 'Banner promocional para el inicio o el carrito'}</p>
        <form class="admin-form" id="bannerForm">
            <input type="hidden" id="bnrId" value="${banner ? banner.id : ''}">

            <div class="admin-field full">
                <label>Imagen de fondo (recomendado 1200×600)</label>
                <div class="admin-imagenes">
                    <img src="${esc(urlPublica(banner?.imagen_path || banner?.imagen_url || ''))}" alt=""
                         id="bnrImagenPreview" style="max-width:100%; height:150px; object-fit:cover; border-radius:10px; border:1px solid var(--border);">
                    <div class="admin-img-upload">
                        <label class="btn btn-outline admin-file-btn">
                            <i class="fa-solid fa-cloud-arrow-up"></i> Elegir imagen
                            <input type="file" id="bnrImagenArchivo" accept="image/jpeg,image/png,image/webp">
                        </label>
                        <input type="url" id="bnrImagenUrl" class="admin-input-inline" placeholder="…o pegá una URL externa"
                               value="${esc(banner && !banner.imagen_path ? (banner.imagen_url || '') : '')}">
                    </div>
                </div>
            </div>

            <div class="admin-field full">
                <label>Logo (opcional, recomendado cuadrado 240×240)</label>
                <div class="admin-imagenes">
                    <div style="display:flex; gap:0.9rem; align-items:center;">
                        <img src="${esc(urlPublica(banner?.logo_path || banner?.logo_url || ''))}" alt=""
                             id="bnrLogoPreview" style="width:72px; height:72px; object-fit:contain; border-radius:8px; border:1px solid var(--border); background:#fafafa;">
                        <div class="admin-img-upload" style="flex:1; flex-direction:column; align-items:flex-start;">
                            <label class="btn btn-sm btn-outline admin-file-btn">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Elegir logo
                                <input type="file" id="bnrLogoArchivo" accept="image/jpeg,image/png,image/webp">
                            </label>
                            <input type="url" id="bnrLogoUrl" placeholder="…o pegá una URL de logo"
                                   value="${esc(banner && !banner.logo_path ? (banner.logo_url || '') : '')}"
                                   style="width:100%; padding:0.5rem 0.7rem; border:1px solid var(--border); border-radius:8px;">
                        </div>
                    </div>
                </div>
            </div>

            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="bnrBadge">Etiqueta (badge)</label>
                    <input type="text" id="bnrBadge" value="${esc(banner?.badge || '')}" placeholder="ej: Promociona">
                </div>
                <div class="admin-field">
                    <label for="bnrTitulo">Título</label>
                    <input type="text" id="bnrTitulo" value="${esc(banner?.titulo || '')}" placeholder="ej: Producto destacado">
                </div>
                <div class="admin-field">
                    <label for="bnrBoton">Texto del botón</label>
                    <input type="text" id="bnrBoton" value="${esc(banner?.boton || '')}" placeholder="ej: Ver producto">
                </div>
                <div class="admin-field">
                    <label for="bnrLink">Enlace del botón</label>
                    <input type="url" id="bnrLink" value="${esc(banner?.link || '')}" placeholder="https://…">
                </div>
                <div class="admin-field">
                    <label for="bnrTarget">Comportamiento del enlace</label>
                    <select id="bnrTarget">
                        <option value="interno" ${banner?.target === 'externo' ? '' : 'selected'}>Interno (misma pestaña)</option>
                        <option value="externo" ${banner?.target === 'externo' ? 'selected' : ''}>Externo (nueva pestaña)</option>
                    </select>
                </div>
                <div class="admin-field">
                    <label for="bnrPosition">Orden</label>
                    <input type="number" id="bnrPosition" min="0" step="1" value="${esc(banner?.position ?? (banners.length + 1))}">
                </div>
                <div class="admin-field full" style="justify-content:flex-end;">
                    <label class="admin-check">
                        <input type="checkbox" id="bnrActivo" ${banner?.activo === false ? '' : 'checked'}>
                        Banner activo
                    </label>
                </div>
            </div>

            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    $('#bnrImagenArchivo').addEventListener('change', async () => {
        const archivo = $('#bnrImagenArchivo').files[0];
        if (!archivo) return;
        try {
            const lista = await validarYOptimizarImagen(archivo);
            $('#bnrImagenPreview').src = URL.createObjectURL(lista && lista.size ? lista : archivo);
        } catch (error) { toast(error.message, 'error'); $('#bnrImagenArchivo').value = ''; }
    });

    $('#bnrLogoArchivo').addEventListener('change', async () => {
        const archivo = $('#bnrLogoArchivo').files[0];
        if (!archivo) return;
        try {
            const lista = await validarYOptimizarImagen(archivo);
            $('#bnrLogoPreview').src = URL.createObjectURL(lista && lista.size ? lista : archivo);
        } catch (error) { toast(error.message, 'error'); $('#bnrLogoArchivo').value = ''; }
    });

    $('#bannerForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#bannerForm').querySelector('[type="submit"]');

        const idValor = $('#bnrId').value;
        const payload = {
            badge: $('#bnrBadge').value.trim(),
            titulo: $('#bnrTitulo').value.trim(),
            boton: $('#bnrBoton').value.trim(),
            link: $('#bnrLink').value.trim(),
            target: $('#bnrTarget').value,
            position: parseInt($('#bnrPosition').value) || 0,
            activo: $('#bnrActivo').checked
        };

        const imagenArchivo = $('#bnrImagenArchivo').files[0];
        const imagenUrl = $('#bnrImagenUrl').value.trim();
        const logoArchivo = $('#bnrLogoArchivo').files[0];
        const logoUrl = $('#bnrLogoUrl').value.trim();

        if ((imagenArchivo && imagenUrl) || (logoArchivo && logoUrl)) {
            toast('Elegí una sola fuente (archivo o URL) para cada imagen.', 'error');
            return;
        }

        conCarga(submitBtn, guardarBanner(payload, idValor ? Number(idValor) : null, {
            imagenArchivo, imagenUrl, logoArchivo, logoUrl
        }))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarBanner(payload, id, { imagenArchivo, imagenUrl, logoArchivo, logoUrl }) {
    const sb = await clienteAdmin();
    const previo = id ? banners.find((b) => b.id === id) : null;

    let registroId = id;
    if (id) {
        const { error } = await sb.from('banners').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { data, error } = await sb.from('banners').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        registroId = data?.id;
    }

    let debeLimpiarImagenVieja = false;
    if (imagenArchivo || imagenUrl) {
        const actualizacion = {};
        if (imagenArchivo) {
            actualizacion.imagen_path = await subirImagenAdmin('banners', 'banners', imagenArchivo);
            actualizacion.imagen_url = null;
            debeLimpiarImagenVieja = Boolean(previo?.imagen_path);
        } else {
            actualizacion.imagen_path = null;
            actualizacion.imagen_url = imagenUrl;
        }
        const { error } = await sb.from('banners').update(actualizacion).eq('id', registroId);
        if (error) throw new Error(error.message);
    }

    let debeLimpiarLogoViejo = false;
    if (logoArchivo || logoUrl) {
        const actualizacion = {};
        if (logoArchivo) {
            actualizacion.logo_path = await subirImagenAdmin('banners', 'logos', logoArchivo);
            actualizacion.logo_url = null;
            debeLimpiarLogoViejo = Boolean(previo?.logo_path);
        } else {
            actualizacion.logo_path = null;
            actualizacion.logo_url = logoUrl;
        }
        const { error } = await sb.from('banners').update(actualizacion).eq('id', registroId);
        if (error) throw new Error(error.message);
    }

    if (debeLimpiarImagenVieja && previo?.imagen_path) await eliminarImagenAdmin(previo.imagen_path);
    if (debeLimpiarLogoViejo && previo?.logo_path) await eliminarImagenAdmin(previo.logo_path);

    toast(id ? 'Banner actualizado.' : 'Banner creado.');
}

async function borrarBanner(id, contenedor) {
    if (!confirmarBorrado('¿Eliminar este banner?')) return;
    const sb = await clienteAdmin();
    const banner = banners.find((b) => b.id === id);
    const { error } = await sb.from('banners').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    if (banner?.imagen_path) await eliminarImagenAdmin(banner.imagen_path);
    if (banner?.logo_path) await eliminarImagenAdmin(banner.logo_path);
    toast('Banner eliminado.');
    renderizar(contenedor);
}