// categorias.js — CRUD de categorías.
//
// Cada categoría puede tener una imagen de fondo (categories.imagen_path, 0062)
// que la tienda usa como banner en su página individual
// (categoria.html?slug=…). Es opcional: sin imagen, el banner usa el color de
// marca. El archivo vive en el bucket "branding" (carpeta "categorias").

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, estadoVacio, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, placeholderImagen, mostrarPreviewImagen, LIMITES_IMAGEN } from './admin-ui.js';
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
    contenedor.querySelectorAll('[data-inventario]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalInventario(Number(btn.dataset.inventario)));
    });
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
                <button type="button" class="btn btn-sm" data-editar="${esc(c.id)}" title="Editar" aria-label="Editar ${esc(c.name)}"><i class="fa-solid fa-pen"></i></button>
                ${esTurnos ? '' : `<button type="button" class="btn btn-sm" data-inventario="${esc(c.id)}" title="Gestionar inventario" aria-label="Gestionar inventario de ${esc(c.name)}"><i class="fa-solid fa-boxes-stacked"></i></button>`}
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(c.id)}" title="Eliminar" aria-label="Eliminar ${esc(c.name)}"><i class="fa-solid fa-trash"></i></button>
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

// ============================================================================
// Inventario por categoría
//
// Alcance: solo productos. El botón no se muestra en modo turnos (ahí todo el
// catálogo son servicios) y, en modo venta, cada ítem del catálogo es un
// producto. El stock de un producto simple vive en `products.stock`; el de un
// producto variable es la suma de sus variaciones (`product_variants.stock`),
// que la base recalcula sola con el trigger de la 0059 al guardar la variante.
// ============================================================================

function claseStock(n) {
    const v = Number(n) || 0;
    return v === 0 ? 'admin-stock-bajo' : v < 5 ? 'admin-stock-medio' : 'admin-stock-ok';
}

function abrirModalInventario(idCategoria) {
    const categoria = categorias.find((c) => c.id === idCategoria);
    if (!categoria) return;

    const overlay = abrirModal(`
        <h2>Inventario</h2>
        <p class="modal-sub">Stock de los productos de «${esc(categoria.name)}»</p>
        <div id="invContenido"></div>
    `, { clasePanel: 'admin-modal-panel--ancho' });

    const cont = $('#invContenido', overlay);
    estadoCargando(cont, 'Cargando inventario…');
    cargarInventario(overlay, categoria, cont);
}

async function cargarInventario(overlay, categoria, cont) {
    let items = [];
    try {
        const sb = await clienteAdmin();
        const { data, error } = await sb.from('products')
            .select(`
                id, nombre, tipo, stock, activo,
                variantes:product_variants(id, stock, activo, combinacion, position)
            `)
            .eq('category_id', categoria.id)
            .order('nombre', { ascending: true });
        if (error) throw new Error(error.message);
        items = data || [];
    } catch (error) {
        if (cont.isConnected) estadoVacio(cont, 'No se pudo cargar el inventario', error.message);
        return;
    }

    // El modal pudo cerrarse mientras cargaba.
    if (!cont.isConnected) return;

    if (!items.length) {
        cont.innerHTML = `
            <div class="admin-empty">
                <i class="fa-solid fa-boxes-stacked"></i>
                <h3>Sin productos en esta categoría</h3>
                <p>Todavía no hay productos asignados a «${esc(categoria.name)}». Asignalos desde la sección Productos para gestionar su inventario.</p>
            </div>
        `;
        return;
    }

    cont.innerHTML = `
        <form class="admin-form" id="invForm" novalidate>
            <div class="inv-lista">
                ${items.map((p) => (p.tipo === 'variable' ? filaInventarioVariable(p) : filaInventarioSimple(p))).join('')}
            </div>
            <div class="admin-modal-acciones">
                <button type="button" class="btn" data-cerrar-modal>Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar inventario</button>
            </div>
        </form>
    `;

    const form = $('#invForm', overlay);

    form.querySelectorAll('input[data-stock]').forEach((input) => {
        input.addEventListener('input', () => refrescarCampoInventario(input));
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const boton = form.querySelector('button[type="submit"]');
        conCarga(boton, guardarInventario(form))
            .then((guardados) => {
                if (!guardados) { toast('No había cambios para guardar.'); return; }
                cerrarModal();
                toast(guardados === 1 ? 'Inventario actualizado.' : `Inventario actualizado (${guardados} cambios).`);
            })
            .catch((error) => toast(error.message, 'error'));
    });
}

// Etiquetas de contexto de un producto (id, tipo y visibilidad).
function metadatosProducto(p) {
    return `
        <span class="inv-tag">#${esc(p.id)}</span>
        <span class="inv-tag">${p.tipo === 'variable' ? 'Producto variable' : 'Producto simple'}</span>
        ${p.activo ? '' : '<span class="inv-tag inv-tag--oculto"><i class="fa-solid fa-eye-slash"></i> No visible</span>'}
    `;
}

// Campo de stock reutilizable por producto simple y por variación.
function campoStock({ valor, etiquetaAria, productoId, varianteId = null }) {
    const stock = Number(valor) || 0;
    return `
        <label class="inv-stock">
            <span>Stock</span>
            <input type="number" min="0" step="1" inputmode="numeric"
                   value="${stock}" data-original="${stock}" data-stock="${esc(varianteId ?? productoId)}"
                   data-producto="${esc(productoId)}"
                   ${varianteId != null ? `data-variante="${esc(varianteId)}"` : ''}
                   class="${claseStock(stock)}"
                   aria-label="Stock de ${esc(etiquetaAria)}">
        </label>`;
}

function filaInventarioSimple(p) {
    return `
        <div class="inv-prod" data-producto="${esc(p.id)}">
            <div class="inv-prod-cab">
                <div class="inv-prod-info">
                    <strong>${esc(p.nombre)}</strong>
                    <span class="inv-prod-meta">${metadatosProducto(p)}</span>
                </div>
                ${campoStock({ valor: p.stock, etiquetaAria: p.nombre, productoId: p.id })}
            </div>
        </div>`;
}

function filaInventarioVariable(p) {
    const variantes = [...(p.variantes || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const total = variantes.filter((v) => v.activo).reduce((n, v) => n + (Number(v.stock) || 0), 0);

    const detalle = variantes.length
        ? variantes.map((v) => {
            const etiqueta = (v.combinacion || []).map(String).join(' · ') || `Variación #${v.id}`;
            return `
                <div class="inv-variacion" data-activo="${v.activo ? '1' : '0'}">
                    <span class="inv-variacion-nom">
                        ${esc(etiqueta)}
                        ${v.activo ? '' : '<span class="inv-tag inv-tag--oculto">Inactiva</span>'}
                    </span>
                    ${campoStock({ valor: v.stock, etiquetaAria: `${p.nombre} ${etiqueta}`, productoId: p.id, varianteId: v.id })}
                </div>`;
        }).join('')
        : '<p class="hint">Este producto variable todavía no tiene variaciones guardadas.</p>';

    return `
        <div class="inv-prod inv-prod--variable" data-producto="${esc(p.id)}">
            <div class="inv-prod-cab">
                <div class="inv-prod-info">
                    <strong>${esc(p.nombre)}</strong>
                    <span class="inv-prod-meta">
                        ${metadatosProducto(p)}
                        <span class="inv-tag"><i class="fa-solid fa-layer-group"></i> <span data-total>${total}</span> en total</span>
                    </span>
                </div>
            </div>
            <div class="inv-variaciones">${detalle}</div>
        </div>`;
}

// Refresca el resaltado del campo, su color por nivel y el total del producto
// variable (solo suma variaciones activas, igual que la base).
function refrescarCampoInventario(input) {
    const original = Number(input.dataset.original);
    const crudo = input.value.trim();
    const valor = crudo === '' ? NaN : Number(crudo);

    input.classList.toggle('inv-cambiado', Number.isFinite(valor) && valor !== original);
    input.classList.remove('admin-stock-bajo', 'admin-stock-medio', 'admin-stock-ok');
    if (Number.isFinite(valor)) input.classList.add(claseStock(valor));

    const producto = input.closest('.inv-prod--variable');
    if (producto) {
        const total = [...producto.querySelectorAll('.inv-variacion[data-activo="1"] input[data-stock]')]
            .reduce((n, i) => n + (Number(i.value) || 0), 0);
        const etiqueta = producto.querySelector('[data-total]');
        if (etiqueta) etiqueta.textContent = total;
    }
}

// Persiste solo los campos que cambiaron. Devuelve cuántos se guardaron.
async function guardarInventario(form) {
    const simples = [];
    const variantes = [];

    for (const input of form.querySelectorAll('input[data-stock]')) {
        const crudo = input.value.trim();
        const valor = Number(crudo);
        if (crudo === '' || !Number.isInteger(valor) || valor < 0) {
            input.focus();
            throw new Error('El stock debe ser un número entero igual o mayor a 0.');
        }
        if (valor === Number(input.dataset.original)) continue;
        if (input.dataset.variante) variantes.push({ id: Number(input.dataset.variante), stock: valor });
        else simples.push({ id: Number(input.dataset.producto), stock: valor });
    }

    if (!simples.length && !variantes.length) return 0;

    const sb = await clienteAdmin();
    for (const c of simples) {
        const { error } = await sb.from('products').update({ stock: c.stock }).eq('id', c.id);
        if (error) throw new Error(error.message);
    }
    for (const c of variantes) {
        // El trigger de la 0059 recalcula products.stock (suma) tras este update.
        const { error } = await sb.from('product_variants').update({ stock: c.stock }).eq('id', c.id);
        if (error) throw new Error(error.message);
    }
    return simples.length + variantes.length;
}
