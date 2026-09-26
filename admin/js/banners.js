// banners.js — CRUD de banners promocionales (inicio y carrito).

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, placeholderImagen, mostrarPreviewImagen, LIMITES_IMAGEN } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

let banners = [];

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('banners').select('*').order('position', { ascending: true });
    if (error) throw error;
    banners = data || [];

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Marcá un banner como el del carrito. Los demás van al inicio (máximo 4).</p>
            <button type="button" class="btn btn-primary" id="btnNuevoBanner">
                <i class="ti ti-plus"></i> Nuevo banner
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
            <td class="td-principal">
                <img src="${esc(urlPublica(b.imagen_path || b.imagen_url))}" alt=""
                     style="width:120px; height:70px; object-fit:cover; border-radius:8px; border:1px solid var(--border); flex-shrink:0;">
            </td>
            <td data-label="Contenido">
                ${soloImagen
                    ? '<span class="estado-badge estado-procesando" style="margin-bottom:0.3rem;">Solo imagen</span>'
                    : `<strong>${esc(b.titulo)}</strong>${b.badge ? ` · <span class="estado-badge estado-entregado">${esc(b.badge)}</span>` : ''}`}
                ${b.link ? `<br><span style="color:var(--text-muted); font-size:0.8rem;">${esc(b.link)}</span> ${b.target === 'externo' ? '<span class="estado-badge estado-procesando">Externo</span>' : ''}` : ''}
            </td>
            <td data-label="Orden">${esc(b.position)}</td>
            <td data-label="Estado">${b.activo
                ? '<span class="estado-badge estado-entregado">Activo</span>'
                : '<span class="estado-badge estado-cancelado">Inactivo</span>'}
                ${b.en_carrito ? '<br><span class="estado-badge estado-procesando" style="margin-top:0.3rem;">Carrito</span>' : ''}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(b.id)}"><i class="ti ti-edit"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(b.id)}"><i class="ti ti-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function abrirModalBanner(idExistente) {
    const banner = idExistente ? banners.find((b) => b.id === idExistente) : null;
    const logoPreview = banner?.logo_path || banner?.logo_url || '';
    let imagenOptimizada = null;
    let logoOptimizada = null;

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
                            <i class="ti ti-cloud-upload"></i> Elegir imagen
                            <input type="file" id="bnrImagenArchivo" accept="image/jpeg,image/png,image/webp">
                        </label>
                        <input type="url" id="bnrImagenUrl" class="admin-url-input" placeholder="…o pegá una URL externa"
                               value="${esc(banner && !banner.imagen_path ? (banner.imagen_url || '') : '')}">
                    </div>
                </div>
            </div>

            <div class="admin-field full">
                <label>Logo (opcional, recomendado cuadrado 240×240)</label>
                <p class="hint">Si no cargás un logo, se mostrará un ícono de imagen en la vista previa.</p>
                <div class="admin-imagenes">
                    <div style="display:flex; gap:0.9rem; align-items:center;">
                        <div id="bnrLogoPreview" class="admin-preview admin-preview--logo">
                            ${logoPreview
                                ? `<img class="admin-preview-image" src="${esc(urlPublica(logoPreview))}" alt="">`
                                : placeholderImagen('', 'Sin logo')}
                        </div>
                        <div class="admin-img-upload" style="flex:1; flex-direction:column; align-items:flex-start;">
                            <label class="btn btn-sm btn-outline admin-file-btn">
                                <i class="ti ti-cloud-upload"></i> Elegir logo
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
                <div class="admin-field full" style="justify-content:flex-end; gap:1.5rem; display:flex; flex-wrap:wrap;">
                    <label class="admin-check">
                        <input type="checkbox" id="bnrActivo" ${banner?.activo === false ? '' : 'checked'}>
                        Banner activo
                    </label>
                    <label class="admin-check">
                        <input type="checkbox" id="bnrCarrito" ${banner?.en_carrito ? 'checked' : ''}>
                        Banner del carrito
                    </label>
                </div>
            </div>
            <p class="hint" style="margin-top:-0.6rem;">
                Si lo marcás, este banner va en la página de carrito y deja de mostrarse en el
                inicio. Al marcarlo se desmarca el que estuviera antes: sólo puede haber uno.
            </p>

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
            const lista = await validarYOptimizarImagen(archivo, { maxLado: LIMITES_IMAGEN.bannerFondo });
            imagenOptimizada = lista;
            $('#bnrImagenPreview').src = URL.createObjectURL(lista);
        } catch (error) { toast(error.message, 'error'); $('#bnrImagenArchivo').value = ''; }
    });

    $('#bnrLogoArchivo').addEventListener('change', async () => {
        const archivo = $('#bnrLogoArchivo').files[0];
        if (!archivo) return;
        try {
            const lista = await validarYOptimizarImagen(archivo, { maxLado: LIMITES_IMAGEN.bannerLogo });
            logoOptimizada = lista;
            mostrarPreviewImagen($('#bnrLogoPreview'), URL.createObjectURL(lista), 'Vista previa del logo');
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
            activo: $('#bnrActivo').checked,
            en_carrito: $('#bnrCarrito').checked
        };

        const imagenArchivo = imagenOptimizada;
        const imagenUrl = $('#bnrImagenUrl').value.trim();
        const logoArchivo = logoOptimizada;
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

    // La columna tiene un índice único parcial: no puede haber dos banners con
    // en_carrito en true. Por eso se desmarcan los otros ANTES de guardar este,
    // si no el guardado del nuevo choca contra el índice. Si el guardado falla
    // después, el carrito queda sin banner, que es visible y se arregla desde el
    // panel; dejar dos marcados en cambio no se puede ni ver ni corregir.
    if (payload.en_carrito) {
        const { error } = await sb
            .from('banners')
            .update({ en_carrito: false })
            .eq('en_carrito', true)
            .neq('id', id ?? 0);
        if (error) throw new Error(error.message);
    }

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
    if (!(await confirmarBorrado('¿Eliminar este banner?'))) return;
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