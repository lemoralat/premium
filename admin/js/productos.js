// productos.js — CRUD completo de productos (variantes, imágenes, stock).

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, formatearPrecio, placeholderImagen, LIMITES_IMAGEN } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

let productos = [];
let categorias = [];
let busqueda = '';
let filtroCategoria = 'todas';
let filtroActivo = 'todos';

// Tipo de web (settings.modo_web, migración 0051): en modo turnos los
// productos se gestionan como servicios (duración estimada + horarios por día
// de la semana, migración 0053). El resto del CRUD es idéntico.
let modoWeb = 'venta';

// Estado del formulario abierto
let variantesModal = [];
let caracteristicasModal = [];
let imagenesModal = [];
let horariosModal = [];

// Límites de cantidad por producto
const MAX_VARIANTES = 4;
const MAX_CARACTERISTICAS = 8;
const MAX_HORARIOS = 21; // 7 días × hasta 3 franjas por día
const DIAS_AGENDA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
let contenedorActual = null;

export async function renderizar(contenedor) {
    contenedorActual = contenedor;
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const [productosR, categoriasR, settingsR] = await Promise.all([
        sb.from('products').select(`
            id, nombre, descripcion, descripcion_detallada, precio, precio_anterior, stock,
            caracteristicas, activo, destacado,
            servicio_duracion_min, servicio_horarios,
            category_id,
            categoria:categories(id, name),
            opciones:product_options(id, opcion, position, valores:product_option_values(id, valor, position)),
            imagenes:product_images(id, storage_path, es_principal, position)
        `).order('id', { ascending: true }),
        sb.from('categories').select('id, name, slug, active').eq('active', true).order('position', { ascending: true }),
        sb.from('settings').select('modo_web').eq('id', 1).single()
    ]);

    if (productosR.error) throw productosR.error;
    if (categoriasR.error) throw categoriasR.error;
    if (settingsR.error) throw settingsR.error;

    productos = productosR.data || [];
    categorias = categoriasR.data || [];
    modoWeb = settingsR.data?.modo_web === 'turnos' ? 'turnos' : 'venta';

    pintar(contenedor);
}

function pintar(contenedor) {
    const enServicios = modoWeb === 'turnos';
    const filtrados = productos.filter((p) => {
        const porCategoria = filtroCategoria === 'todas' || (filtroCategoria === 'sin' && !p.category_id) || String(p.category_id) === String(filtroCategoria);
        const porActivo = filtroActivo === 'todos' || (filtroActivo === 'activos' && p.activo) || (filtroActivo === 'inactivos' && !p.activo);
        const q = busqueda.toLowerCase();
        const porBusqueda = !q || String(p.nombre).toLowerCase().includes(q);
        return porCategoria && porActivo && porBusqueda;
    });

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <button type="button" class="btn btn-primary" id="btnNuevoProducto">
                <i class="fa-solid fa-plus"></i> ${enServicios ? 'Nuevo servicio' : 'Nuevo producto'}
            </button>
        </div>

        <div class="admin-filtros">
            <input type="text" id="prodBuscar" class="admin-busqueda" placeholder="Buscar por nombre…" value="${esc(busqueda)}">
            <select id="prodFiltroCategoria" class="admin-select-filtro" aria-label="Filtrar por categoría">
                <option value="todas">Todas las categorías</option>
                <option value="sin">Sin categoría</option>
                ${categorias.map((c) => `<option value="${esc(c.id)}" ${String(filtroCategoria) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
            <select id="prodFiltroActivo" class="admin-select-filtro" aria-label="Filtrar por estado">
                <option value="todos">Activos e inactivos</option>
                <option value="activos" ${filtroActivo === 'activos' ? 'selected' : ''}>Solo activos</option>
                <option value="inactivos" ${filtroActivo === 'inactivos' ? 'selected' : ''}>Solo inactivos</option>
            </select>
            <span style="color:var(--text-muted); font-size:0.85rem;">${filtrados.length} de ${productos.length}</span>
        </div>

        ${filtrados.length === 0 ? `
        <div class="admin-card">
            <div class="admin-empty"><i class="fa-solid fa-box-open"></i><h3>${enServicios ? 'Sin servicios' : 'Sin productos'}</h3><p>No hay ${enServicios ? 'servicios' : 'productos'} que coincidan con la búsqueda.</p></div>
        </div>` : `
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr>
                        <th>${enServicios ? 'Servicio' : 'Producto'}</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Variantes</th><th>Visible</th><th></th>
                    </tr>
                </thead>
                <tbody>${filtrados.map((p) => filaProducto(p)).join('')}</tbody>
            </table>
        </div>`}
    `;

    $('#btnNuevoProducto').addEventListener('click', () => abrirModalProducto(null));

    const buscar = $('#prodBuscar');
    const inputEv = () => { busqueda = buscar.value.trim(); pintar(contenedor); };
    buscar.addEventListener('input', inputEv);
    buscar.addEventListener('keydown', (e) => { if (e.key === 'Enter') inputEv(); });

    $('#prodFiltroCategoria').addEventListener('change', (e) => {
        filtroCategoria = e.target.value;
        pintar(contenedor);
    });
    $('#prodFiltroActivo').addEventListener('change', (e) => {
        filtroActivo = e.target.value;
        pintar(contenedor);
    });

    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalProducto(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarProducto(Number(btn.dataset.borrar)));
    });
    contenedor.querySelectorAll('[data-toggle-activo]').forEach((chk) => {
        chk.addEventListener('change', () => toggleActivo(Number(chk.dataset.toggleActivo), chk.checked));
    });
}

function imagenPrincipalDe(p) {
    const imgs = Array.isArray(p.imagenes) ? p.imagenes : [];
    const principal = imgs.find((i) => i.es_principal) || imgs[0] || null;
    const imagen = principal ? urlPublica(principal.storage_path) : '';
    return imagen
        ? `<img src="${esc(imagen)}" alt="" loading="lazy" style="width:46px; height:46px; border-radius:8px; object-fit:cover; border:1px solid var(--border);">`
        : placeholderImagen('admin-image-placeholder--thumb', 'Sin imagen');
}

function filaProducto(p) {
    const enServicios = modoWeb === 'turnos';
    const nroVariantes = Array.isArray(p.opciones) ? p.opciones.length : 0;
    const stockClase = p.stock === 0 ? 'admin-stock-bajo' : p.stock < 5 ? 'admin-stock-medio' : 'admin-stock-ok';
    const tieneDuracion = enServicios && Number(p.servicio_duracion_min) > 0;
    return `
        <tr>
            <td class="td-principal">
                <div style="display:flex; align-items:center; gap:0.7rem;">
                    ${imagenPrincipalDe(p)}
                    <div>
                        <strong>${esc(p.nombre)}</strong>
                        ${p.destacado ? ' <span class="estado-badge estado-procesando" style="margin-left:0.3rem;">⭐ Destacado</span>' : ''}
                        ${tieneDuracion ? `<span class="estado-badge estado-entregado" style="margin-left:0.3rem;">⏱ ${Number(p.servicio_duracion_min)} min</span>` : ''}
                        ${p.precio_anterior != null && Number(p.precio_anterior) > Number(p.precio)
                            ? `<span style="color:var(--text-muted); font-size:0.75rem;"> antes $${formatearPrecio(p.precio_anterior)}</span>`
                            : ''}
                        <br><span style="color:var(--text-muted); font-size:0.78rem;">#${esc(p.id)}</span>
                    </div>
                </div>
            </td>
            <td data-label="Categoría">${esc(p.categoria?.name || '—')}</td>
            <td data-label="Precio"><strong>$${formatearPrecio(p.precio)}</strong></td>
            <td data-label="Stock">${enServicios
                ? '<span style="color:var(--text-muted);">—</span>'
                : `<span class="${stockClase}">${esc(p.stock)}</span>`}</td>
            <td data-label="Variantes">${enServicios
                ? '<span style="color:var(--text-muted);">—</span>'
                : (nroVariantes > 0 ? esc(nroVariantes) : '<span style="color:var(--text-muted);">—</span>')}</td>
            <td data-label="Visible">
                <label class="admin-check">
                    <input type="checkbox" data-toggle-activo="${esc(p.id)}" ${p.activo ? 'checked' : ''} aria-label="Activar/desactivar ${esc(p.nombre)}">
                </label>
            </td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(p.id)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(p.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
}

async function toggleActivo(id, activo) {
    try {
        const sb = await clienteAdmin();
        const { error } = await sb.from('products').update({ activo }).eq('id', id);
        if (error) throw error;
        const p = productos.find((x) => x.id === id);
        if (p) p.activo = activo;
        const esServicio = modoWeb === 'turnos';
        toast(activo ? `${esServicio ? 'Servicio' : 'Producto'} publicado en la tienda.` : `${esServicio ? 'Servicio' : 'Producto'} oculto de la tienda.`);
    } catch (error) {
        toast(`No se pudo cambiar el estado: ${error.message}`, 'error');
    }
}

// ============================================================================
// Formulario de producto
// ============================================================================

function abrirModalProducto(idExistente) {
    const producto = idExistente ? productos.find((p) => p.id === idExistente) : null;

    // Estado inicial de variantes
    variantesModal = (producto?.opciones || []).map((o) => ({
        opcion: o.opcion,
        valores: (Array.isArray(o.valores) ? o.valores : []).map((v) => v.valor).join(', ')
    }));
    if (variantesModal.length === 0) variantesModal = [{ opcion: '', valores: '' }];

    // Estado inicial de imágenes
    imagenesModal = [...(producto?.imagenes || [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((i) => ({
        dbId: i.id,
        storage_path: i.storage_path,
        esPrincipal: Boolean(i.es_principal),
        file: null,
        paraBorrar: false,
        nuevoId: null
    }));
    if (imagenesModal.length === 0) imagenesModal = [{ dbId: null, storage_path: null, esPrincipal: true, file: null, paraBorrar: false, nuevoId: null }];

    // Estado inicial de características (repeater): cada fila es una string.
    // Se filtra vacío por si algún producto histórico trae huecos.
    caracteristicasModal = Array.isArray(producto?.caracteristicas)
        ? producto.caracteristicas.map((c) => String(c || '').trim()).filter(Boolean)
        : [];
    if (caracteristicasModal.length === 0) caracteristicasModal = [''];

    // Estado inicial de horarios (solo en modo turnos, 0053): cada fila es
    // { dia, desde, hasta }. Las filas sin día se descartan.
    horariosModal = Array.isArray(producto?.servicio_horarios)
        ? producto.servicio_horarios
            .map((h) => ({
                dia: String(h?.dia || '').trim(),
                desde: String(h?.desde || '').trim(),
                hasta: String(h?.hasta || '').trim()
            }))
            .filter((h) => h.dia)
        : [];

    const enServicios = modoWeb === 'turnos';

    abrirModal(`
        <h2>${producto ? (enServicios ? 'Editar servicio' : 'Editar producto') : (enServicios ? 'Nuevo servicio' : 'Nuevo producto')}</h2>
        <p class="modal-sub">${producto ? esc(producto.nombre) : (enServicios ? 'Cargá un servicio nuevo en la agenda' : 'Cargá un producto nuevo en el catálogo')}</p>
        <form class="admin-form" id="productoForm">
            <input type="hidden" id="prdId" value="${producto ? producto.id : ''}">

            <div class="admin-field full">
                <label for="prdNombre">Nombre *</label>
                <input type="text" id="prdNombre" required value="${esc(producto?.nombre || '')}" placeholder="${enServicios ? 'ej: Corte de pelo y barba' : 'ej: Buzo canguro liso hombre'}">
            </div>
            <div class="admin-field full">
                <label for="prdDescripcion">Descripción corta</label>
                <input type="text" id="prdDescripcion" value="${esc(producto?.descripcion || '')}" placeholder="La que se ve en las tarjetas del catálogo">
            </div>
            <div class="admin-field full">
                <label for="prdDetallada">Descripción detallada</label>
                <textarea id="prdDetallada">${esc(producto?.descripcion_detallada || '')}</textarea>
            </div>

            <div class="admin-form-grid">
                <div class="admin-field full">
                    <label for="prdCategoria">Categoría</label>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <select id="prdCategoria" style="flex:1;">
                            <option value="">Sin categoría</option>
                            ${categorias.map((c) => `
                                <option value="${esc(c.id)}" ${String(producto?.category_id ?? '') === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>
                            `).join('')}
                        </select>
                        <button type="button" class="btn btn-sm btn-outline" id="btnCrearCategoria" title="Crear categoría nueva">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div id="nuevaCategoriaBox" hidden style="margin-top:0.6rem; gap:0.5rem; align-items:center;">
                        <input type="text" id="nuevaCatNombre" maxlength="60" placeholder="Nombre de la categoría… (el enlace se genera solo)" style="flex:1; padding:0.5rem 0.7rem; border:1px solid var(--border); border-radius:8px;">
                        <button type="button" class="btn btn-sm btn-primary" id="btnGuardarNuevaCat">Crear</button>
                        <button type="button" class="btn btn-sm" id="btnCancelarNuevaCat">Cancelar</button>
                    </div>
                    <span class="hint">Si la categoría ya existe, quedará seleccionada sin duplicarla.</span>
                </div>
                ${enServicios ? '' : `
                <div class="admin-field">
                    <label for="prdStock">Stock (unidades) *</label>
                    <input type="number" id="prdStock" required min="0" step="1" value="${esc(producto?.stock ?? 0)}">
                </div>`}
                <div class="admin-field">
                    <label for="prdPrecio">Precio ($) *</label>
                    <input type="number" id="prdPrecio" required min="0" step="1" value="${esc(producto?.precio ?? '')}" placeholder="ej: 54000">
                </div>
                <div class="admin-field">
                    <label for="prdPrecioAnterior">Precio anterior ($) <span class="hint">(para tachar)</span></label>
                    <input type="number" id="prdPrecioAnterior" min="0" step="1" value="${esc(producto?.precio_anterior ?? '')}" placeholder="Vacío = sin oferta">
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="prdActivo" ${producto?.activo === false ? '' : 'checked'}>
                        ${enServicios ? 'Servicio' : 'Producto'} activo (visible en la tienda)
                    </label>
                </div>
                <div class="admin-field full" style="margin-top:-0.75rem;">
                    <label class="admin-check">
                        <input type="checkbox" id="prdDestacado" ${producto?.destacado ? 'checked' : ''}>
                        ${enServicios ? 'Servicio' : 'Producto'} destacado <span class="hint">(se muestra primero en el home, mezclando categorías)</span>
                    </label>
                </div>
            </div>

            ${enServicios ? `
            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="prdDuracion">Duración estimada (min) <span class="hint">(se muestra en la ficha del servicio)</span></label>
                    <input type="number" id="prdDuracion" min="0" step="5" value="${esc(producto?.servicio_duracion_min ?? 0)}">
                </div>
                <div class="admin-field full">
                    <label>Horarios disponibles por día <span class="hint">(se muestran en la ficha del servicio y limitan la fecha y hora de la solicitud de turno · máx. ${MAX_HORARIOS})</span></label>
                    <div class="admin-repeater" id="horariosRepeater"></div>
                    <button type="button" class="btn btn-sm btn-outline" id="btnAgregarHorario" style="align-self:flex-start; margin-top:0.5rem;">
                        <i class="fa-solid fa-plus"></i> Agregar horario
                    </button>
                </div>
            </div>` : ''}

            <div class="admin-field full">
                <label>Características <span class="hint">(cada fila se muestra como un ítem, ej: Material: algodón · máx. ${MAX_CARACTERISTICAS})</span></label>
                <div class="admin-repeater" id="caracteristicasRepeater"></div>
                <button type="button" class="btn btn-sm btn-outline" id="btnAgregarCaracteristica" style="align-self:flex-start; margin-top:0.5rem;">
                    <i class="fa-solid fa-plus"></i> Agregar característica
                </button>
            </div>

            ${enServicios ? '' : `
            <div class="admin-field full">
                <label>Variantes <span class="hint">(opción + valores separados por coma; ej: Talles → 40, 41, 42, 43, 44 · máx. ${MAX_VARIANTES})</span></label>
                <div class="admin-repeater" id="variantesRepeater"></div>
                <button type="button" class="btn btn-sm btn-outline" id="btnAgregarVariante" style="align-self:flex-start; margin-top:0.5rem;">
                    <i class="fa-solid fa-plus"></i> Agregar variante
                </button>
            </div>`}

            <div class="admin-field full">
                <label>Imágenes <span class="hint">(una principal + galería; JPG, PNG o WebP hasta 8 MB, se optimizan solas)</span></label>
                <div class="admin-imagenes" id="imagenesEditor"></div>
                <div class="admin-img-upload" style="margin-top:0.8rem;">
                    <label class="btn btn-outline admin-file-btn">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Subir imagen
                        <input type="file" id="prdImagenArchivo" accept="image/jpeg,image/png,image/webp" multiple>
                    </label>
                </div>
            </div>

            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar ${enServicios ? 'servicio' : 'producto'}</button>
            </div>
        </form>
    `);

    renderVariantes();
    renderCaracteristicas();
    renderImagenes();
    if (enServicios) renderHorarios();

    // Crear categoría inline (sin anidar modales: el producto ya está en el
    // modal; un segundo modal lo reemplazaría y perdería los cambios).
    const catBox = $('#nuevaCategoriaBox');
    const catInput = $('#nuevaCatNombre');
    $('#btnCrearCategoria').addEventListener('click', () => {
        catBox.hidden = false;
        catBox.style.display = 'flex';
        catInput.focus();
    });
    $('#btnCancelarNuevaCat').addEventListener('click', () => ocultarCajaNuevaCategoria());
    catInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // no debe enviar el formulario del producto
            crearCategoriaInline($('#prdCategoria'));
        }
    });
    $('#btnGuardarNuevaCat').addEventListener('click', () => crearCategoriaInline($('#prdCategoria')));

    const btnAgregarVariante = $('#btnAgregarVariante');
    if (btnAgregarVariante) {
        btnAgregarVariante.addEventListener('click', () => {
            capturarVariantes();
            if (variantesModal.length >= MAX_VARIANTES) {
                toast(`Máximo ${MAX_VARIANTES} variantes por ${enServicios ? 'servicio' : 'producto'}.`, 'error');
                return;
            }
            variantesModal.push({ opcion: '', valores: '' });
            renderVariantes();
        });
    }

    $('#btnAgregarCaracteristica').addEventListener('click', () => {
        capturarCaracteristicas();
        if (caracteristicasModal.length >= MAX_CARACTERISTICAS) {
            toast(`Máximo ${MAX_CARACTERISTICAS} características por ${enServicios ? 'servicio' : 'producto'}.`, 'error');
            return;
        }
        caracteristicasModal.push('');
        renderCaracteristicas();
    });

    const btnAgregarHorario = $('#btnAgregarHorario');
    if (btnAgregarHorario) {
        btnAgregarHorario.addEventListener('click', () => {
            capturarHorarios();
            if (horariosModal.length >= MAX_HORARIOS) {
                toast(`Máximo ${MAX_HORARIOS} franjas por servicio.`, 'error');
                return;
            }
            horariosModal.push({ dia: '', desde: '', hasta: '' });
            renderHorarios();
        });
    }

    $('#prdImagenArchivo').addEventListener('change', async () => {
        const archivos = [...$('#prdImagenArchivo').files];
        if (!archivos.length) return;
        try {
            const lista = [];
            for (const a of archivos) {
                const optimizada = await validarYOptimizarImagen(a, { maxLado: LIMITES_IMAGEN.producto });
                lista.push(optimizada && optimizada.size ? optimizada : a);
            }
            capturarImagenes();
            const slotsVacios = imagenesModal.filter((entrada) => !entrada.dbId && !tieneFuenteImagen(entrada) && !entrada.paraBorrar);
            lista.forEach((archivo, indice) => {
                const slot = slotsVacios[indice];
                if (slot) {
                    slot.file = archivo;
                    return;
                }
                imagenesModal.push({
                    dbId: null, storage_path: null,
                    esPrincipal: false, file: archivo, paraBorrar: false, nuevoId: null
                });
            });
            $('#prdImagenArchivo').value = '';
            renderImagenes();
        } catch (error) {
            toast(error.message, 'error');
            $('#prdImagenArchivo').value = '';
        }
    });

    $('#productoForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#productoForm').querySelector('[type="submit"]');

        capturarVariantes();
        capturarCaracteristicas();
        capturarImagenes();
        if (enServicios) capturarHorarios();

        const idValor = $('#prdId').value;
        const precio = Number($('#prdPrecio').value);
        const precioAnteriorValor = $('#prdPrecioAnterior').value;
        // En modo turnos los servicios no manejan stock (0053+): el campo no se
        // muestra y siempre se guarda 0.
        const stock = enServicios ? 0 : Number($('#prdStock').value);

        if (!Number.isFinite(precio) || precio < 0) {
            toast('Ingresá un precio válido.', 'error');
            return;
        }
        if (!Number.isInteger(stock) || stock < 0) {
            toast('Ingresá un stock válido.', 'error');
            return;
        }

        // Eliminar variantes vacías. En modo turnos los servicios no tienen variantes:
        // se guarda sin opciones (al actualizar se borran las históricas que
        // hubiera traído del modo venta).
        const variantes = enServicios
            ? []
            : variantesModal
                .map((v) => ({
                    opcion: (v.opcion || '').trim(),
                    valores: (v.valores || '').split(',').map((x) => x.trim()).filter(Boolean)
                }))
                .filter((v) => v.opcion && v.valores.length > 0);

        const categoriaValue = $('#prdCategoria').value;

        const payload = {
            nombre: $('#prdNombre').value.trim(),
            descripcion: $('#prdDescripcion').value.trim(),
            descripcion_detallada: $('#prdDetallada').value.trim(),
            precio,
            precio_anterior: precioAnteriorValor !== '' ? Number(precioAnteriorValor) : null,
            stock,
            caracteristicas: caracteristicasModal
                .map((c) => String(c || '').trim())
                .filter(Boolean),
            activo: $('#prdActivo').checked,
            destacado: $('#prdDestacado').checked,
            category_id: categoriaValue ? Number(categoriaValue) : null
        };

        // Campos de servicio (modo turnos, 0053): se guardan en la misma fila de
        // products. En modo venta el formulario no los muestra y no se tocan.
        if (enServicios) {
            const duracion = Number($('#prdDuracion').value);
            if (!Number.isInteger(duracion) || duracion < 0) {
                toast('Ingresá una duración válida (en minutos).', 'error');
                return;
            }
            const horarios = horariosModal
                .map((h) => ({
                    dia: (h.dia || '').trim(),
                    desde: (h.desde || '').trim(),
                    hasta: (h.hasta || '').trim()
                }))
                .filter((h) => h.dia);
            const franjaInvalida = horarios.find((h) => h.desde && h.hasta && h.hasta <= h.desde);
            if (franjaInvalida) {
                toast(`El horario del ${franjaInvalida.dia} es inválido: el "hasta" debe ser posterior al "desde".`, 'error');
                return;
            }
            payload.servicio_duracion_min = duracion;
            payload.servicio_horarios = horarios;
        }

        if (!payload.nombre) {
            toast(`${enServicios ? 'El nombre del servicio' : 'El nombre del producto'} es obligatorio.`, 'error');
            return;
        }

        conCarga(submitBtn, guardarProducto(payload, idValor ? Number(idValor) : null, variantes))
            .then(() => { cerrarModal(); renderizar(contenedorActual || $('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

// ============================================================================
// Crear categoría desde el formulario de producto (inline, sin anidar modales)
// ============================================================================

// Mismo algoritmo que slugificar() de la tienda (js/utils.js): el slug generado
// acá coincide con los enlaces que arma el menú de la tienda (index#cat-slug).
function slugCategoria(texto) {
    return String(texto ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'seccion';
}

function ocultarCajaNuevaCategoria() {
    const box = $('#nuevaCategoriaBox');
    if (!box) return;
    box.hidden = true;
    box.style.display = '';
    const input = $('#nuevaCatNombre');
    if (input) input.value = '';
}

async function crearCategoriaInline(selectEl) {
    const nombre = $('#nuevaCatNombre').value.trim();
    if (!nombre) {
        toast('El nombre es obligatorio.', 'error');
        return;
    }

    const slug = slugCategoria(nombre);

    // Si ya existe una categoría activa con ese nombre/slug, no se duplica:
    // solo se deja seleccionada en el formulario.
    const nombreLower = nombre.toLowerCase();
    const existente = categorias.find((c) => c.name.toLowerCase() === nombreLower || c.slug === slug);
    if (existente) {
        selectEl.value = String(existente.id);
        ocultarCajaNuevaCategoria();
        toast(`Ya existía "${existente.name}"; quedó seleccionada.`);
        return;
    }

    const btn = $('#btnGuardarNuevaCat');
    conCarga(btn, crearCategoria({ name: nombre, slug, position: categorias.length + 1, active: true }))
        .then((nueva) => {
            selectEl.innerHTML = `<option value="">Sin categoría</option>` + categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
            selectEl.value = String(nueva.id);
            ocultarCajaNuevaCategoria();
            toast('Categoría creada y seleccionada.');
        })
        .catch((error) => toast(error.message, 'error'));
}

async function crearCategoria(payload) {
    const sb = await clienteAdmin();
    const { data, error } = await sb.from('categories').insert(payload).select('id').single();
    if (error) {
        // 23505 = unique (name/slug). Puede existir una categoría inactiva con
        // el mismo slug, que no aparece en la lista local (solo se cargan activas).
        if (error.code === '23505') {
            throw new Error('Ya existe una categoría con ese nombre (puede estar inactiva). Creala o editá en la sección Categorías.');
        }
        throw new Error(error.message);
    }

    // Refresca las categorías activas (mismo query de renderizar) para que el
    // formulario y los filtros usen la lista actualizada.
    const { data: lista, error: errorLista } = await sb.from('categories')
        .select('id, name, slug, active').eq('active', true).order('position', { ascending: true });
    if (errorLista) throw new Error(errorLista.message);
    categorias = lista || [];
    return data;
}

function capturarVariantes() {
    document.querySelectorAll('[data-variante-row]').forEach((fila) => {
        const idx = Number(fila.dataset.varianteRow);
        const opcion = fila.querySelector('[data-campo="opcion"]').value;
        const valores = fila.querySelector('[data-campo="valores"]').value;
        variantesModal[idx] = { opcion, valores };
    });
}

// ---------- Características (repeater, espejo de las variantes) ----------

function capturarCaracteristicas() {
    document.querySelectorAll('[data-caracteristica-row]').forEach((fila) => {
        const idx = Number(fila.dataset.caracteristicaRow);
        caracteristicasModal[idx] = fila.querySelector('[data-campo="texto"]').value;
    });
}

function renderCaracteristicas() {
    const repeater = $('#caracteristicasRepeater');
    if (!repeater) return;
    repeater.innerHTML = caracteristicasModal.map((c, idx) => `
        <div class="admin-repeater-row repeater-caracteristica-row" data-caracteristica-row="${idx}">
            <input type="text" data-campo="texto" placeholder="ej: Material: algodón 100%" value="${esc(c)}"
                   style="padding:0.5rem 0.7rem; border:1px solid var(--border); border-radius:8px;">
            <button type="button" class="btn btn-sm btn-danger" data-quitar-caracteristica="${idx}" aria-label="Quitar característica">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `).join('');

    repeater.querySelectorAll('[data-quitar-caracteristica]').forEach((btn) => {
        btn.addEventListener('click', () => {
            capturarCaracteristicas();
            caracteristicasModal.splice(Number(btn.dataset.quitarCaracteristica), 1);
            if (caracteristicasModal.length === 0) caracteristicasModal = [''];
            renderCaracteristicas();
        });
    });

    // Sincronizar el estado a medida que se edita (para el submit)
    repeater.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', () => capturarCaracteristicas());
    });

    // Deshabilitar "Agregar" al llegar al máximo
    const btnAgregarCaract = $('#btnAgregarCaracteristica');
    if (btnAgregarCaract) btnAgregarCaract.disabled = caracteristicasModal.length >= MAX_CARACTERISTICAS;
}

function renderVariantes() {
    const repeater = $('#variantesRepeater');
    if (!repeater) return;
    repeater.innerHTML = variantesModal.map((v, idx) => `
        <div class="admin-repeater-row" data-variante-row="${idx}">
            <input type="text" data-campo="opcion" placeholder="Opción (ej: Talles)" value="${esc(v.opcion)}"
                   style="padding:0.5rem 0.7rem; border:1px solid var(--border); border-radius:8px;">
            <input type="text" data-campo="valores" placeholder="Valores separados por coma (ej: 40, 41, 42)" value="${esc(v.valores)}"
                   style="padding:0.5rem 0.7rem; border:1px solid var(--border); border-radius:8px;">
            <button type="button" class="btn btn-sm btn-danger" data-quitar-variante="${idx}" aria-label="Quitar variante">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `).join('');

    repeater.querySelectorAll('[data-quitar-variante]').forEach((btn) => {
        btn.addEventListener('click', () => {
            capturarVariantes();
            variantesModal.splice(Number(btn.dataset.quitarVariante), 1);
            if (variantesModal.length === 0) variantesModal = [{ opcion: '', valores: '' }];
            renderVariantes();
        });
    });

    // Sincronizar el estado a medida que se edita (guardando en variables para el submit)
    repeater.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', () => capturarVariantes());
    });

    // Deshabilitar "Agregar" al llegar al máximo
    const btnAgregarVar = $('#btnAgregarVariante');
    if (btnAgregarVar) btnAgregarVar.disabled = variantesModal.length >= MAX_VARIANTES;
}

// ---------- Horarios (solo en modo turnos, 0053) ----------

function capturarHorarios() {
    document.querySelectorAll('[data-horario-row]').forEach((fila) => {
        const idx = Number(fila.dataset.horarioRow);
        horariosModal[idx] = {
            dia: fila.querySelector('[data-campo="dia"]').value,
            desde: fila.querySelector('[data-campo="desde"]').value,
            hasta: fila.querySelector('[data-campo="hasta"]').value
        };
    });
}

function renderHorarios() {
    const repeater = $('#horariosRepeater');
    if (!repeater) return;
    repeater.innerHTML = horariosModal.map((h, idx) => `
        <div class="admin-repeater-row repeater-horario-row" data-horario-row="${idx}">
            <select data-campo="dia" aria-label="Día">
                <option value="">Día…</option>
                ${DIAS_AGENDA.map((d) => `<option value="${d}" ${h.dia === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
            <input type="time" data-campo="desde" aria-label="Desde" value="${esc(h.desde)}">
            <input type="time" data-campo="hasta" aria-label="Hasta" value="${esc(h.hasta)}">
            <button type="button" class="btn btn-sm btn-danger" data-quitar-horario="${idx}" aria-label="Quitar horario">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `).join('');

    repeater.querySelectorAll('[data-quitar-horario]').forEach((btn) => {
        btn.addEventListener('click', () => {
            capturarHorarios();
            horariosModal.splice(Number(btn.dataset.quitarHorario), 1);
            renderHorarios();
        });
    });

    // Sincronizar el estado a medida que se edita (para el submit).
    repeater.querySelectorAll('select, input').forEach((campo) => {
        campo.addEventListener('input', () => capturarHorarios());
        campo.addEventListener('change', () => capturarHorarios());
    });

    // Deshabilitar "Agregar" al llegar al máximo.
    const btnAgregar = $('#btnAgregarHorario');
    if (btnAgregar) btnAgregar.disabled = horariosModal.length >= MAX_HORARIOS;
}

function capturarImagenes() {
    document.querySelectorAll('[data-imagen-idx]').forEach((card) => {
        const idx = Number(card.dataset.imagenIdx);
        const entrada = imagenesModal[idx];
        if (!entrada) return;
        entrada.esPrincipal = card.querySelector('[data-campo="principal"]')?.checked ?? entrada.esPrincipal;
    });
}

function tieneFuenteImagen(entrada) {
    return Boolean(entrada && (entrada.file || entrada.storage_path));
}

function renderImagenes() {
    const editor = $('#imagenesEditor');
    if (!editor) return;
    const visibles = imagenesModal.map((i, idx) => ({ ...i, idx })).filter((i) => !i.paraBorrar);
    const hayPrincipal = visibles.some((i) => i.esPrincipal && tieneFuenteImagen(i));
    if (!hayPrincipal) {
        const primerConFuente = visibles.find((i) => tieneFuenteImagen(i));
        if (primerConFuente) {
            imagenesModal[primerConFuente.idx].esPrincipal = true;
            primerConFuente.esPrincipal = true;
        }
    }

    editor.innerHTML = `
        <div class="admin-imagenes-grid">
            ${visibles.map((i) => `
                <div class="admin-img-card ${i.esPrincipal ? 'principal' : ''}" data-imagen-idx="${esc(i.idx)}">
                    ${i.file
                        ? `<img src="${esc(URL.createObjectURL(i.file))}" alt="">`
                        : i.storage_path
                            ? `<img src="${esc(urlPublica(i.storage_path))}" alt="">`
                            : placeholderImagen('admin-image-placeholder--card', 'Sin imagen')}
                    <div class="admin-img-acciones">
                        <label style="display:flex; align-items:center; gap:0.3rem; color:#fff; font-size:0.68rem;">
                            <input type="radio" name="imagenPrincipal" data-campo="principal" ${i.esPrincipal ? 'checked' : ''}>
                            Principal
                        </label>
                        <button type="button" class="borrar" data-quitar-imagen="${esc(i.idx)}" aria-label="Quitar imagen">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    editor.querySelectorAll('[data-campo="principal"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            const idx = Number(radio.closest('[data-imagen-idx]').dataset.imagenIdx);
            imagenesModal.forEach((i) => { i.esPrincipal = false; });
            imagenesModal[idx].esPrincipal = true;
            renderImagenes();
        });
    });

    editor.querySelectorAll('[data-quitar-imagen]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.quitarImagen);
            const entrada = imagenesModal[idx];
            if (!entrada) return;
            if (entrada.dbId) {
                entrada.paraBorrar = true;
            } else {
                imagenesModal.splice(idx, 1);
            }
            renderImagenes();
        });
    });
}

// ============================================================================
// Guardado
// ============================================================================

async function guardarProducto(payload, id, variantes) {
    const sb = await clienteAdmin();

    // 1) Producto
    let productoId = id;
    if (id) {
        const { error } = await sb.from('products').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { data, error } = await sb.from('products').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        productoId = data.id;
    }

    // 2) Variantes (reemplazo completo)
    await sb.from('product_options').delete().eq('product_id', productoId);
    let posOpt = 0;
    for (const v of variantes) {
        const { data: optData, error: optError } = await sb.from('product_options')
            .insert({ product_id: productoId, opcion: v.opcion, position: posOpt })
            .select('id').single();
        if (optError) throw new Error(optError.message);
        let posVal = 0;
        for (const valor of v.valores) {
            const { error: valError } = await sb.from('product_option_values')
                .insert({ product_option_id: optData.id, valor, position: posVal });
            if (valError) throw new Error(valError.message);
            posVal++;
        }
        posOpt++;
    }

    // 3) Imágenes
    // 3a) Borrar las marcadas (fila + archivo de Storage)
    for (const img of imagenesModal) {
        if (!img.paraBorrar || !img.dbId) continue;
        await sb.from('product_images').delete().eq('id', img.dbId);
        if (img.storage_path) await eliminarImagenAdmin(img.storage_path);
    }

    // 3b) Limpiar filas históricas que no tienen ninguna fuente y filtrar
    //      placeholders visuales antes de insertar.
    for (const img of imagenesModal) {
        if (img.paraBorrar || !img.dbId || tieneFuenteImagen(img)) continue;
        const { error } = await sb.from('product_images').delete().eq('id', img.dbId);
        if (error) throw new Error(error.message);
    }

    // 3c) Insertar filas nuevas (archivo subido o URL externa)
    const vigentes = imagenesModal.filter((i) => !i.paraBorrar && tieneFuenteImagen(i));
    let posicion = 0;
    for (const img of vigentes) {
        // Filas existentes: solo actualizar posición
        if (img.dbId) {
            await sb.from('product_images').update({ position: posicion }).eq('id', img.dbId);
            posicion++;
            continue;
        }
        const storagePath = img.file
            ? await subirImagenAdmin('products', `products/${productoId}`, img.file)
            : img.storage_path;
        const { data: imgData, error: imgError } = await sb.from('product_images')
            .insert({
                product_id: productoId,
                storage_path: storagePath || null,
                es_principal: false,
                position: posicion
            })
            .select('id').single();
        if (imgError) throw new Error(imgError.message);
        img.nuevoId = imgData.id;
        posicion++;
    }

    // 3d) Fijar la imagen principal (una sola)
    await sb.from('product_images').update({ es_principal: false }).eq('product_id', productoId);
    const principal = vigentes.find((i) => i.esPrincipal && tieneFuenteImagen(i)) || vigentes[0];
    const idPrincipal = principal ? (principal.nuevoId || principal.dbId) : null;
    if (idPrincipal) {
        const { error } = await sb.from('product_images').update({ es_principal: true }).eq('id', idPrincipal);
        if (error) throw new Error(error.message);
    }

    toast(id ? 'Producto actualizado.' : 'Producto creado.');
}

// ============================================================================
// Borrado
// ============================================================================

async function borrarProducto(id) {
    const producto = productos.find((p) => p.id === id);
    if (!producto) return;
    if (!(await confirmarBorrado(`¿Eliminar "${producto.nombre}"? Se borran sus imágenes y variantes. Los pedidos anteriores no se ven afectados.`))) return;

    try {
        const sb = await clienteAdmin();
        const imgs = Array.isArray(producto.imagenes) ? producto.imagenes : [];
        const { error } = await sb.from('products').delete().eq('id', id);
        if (error) throw error;
        for (const img of imgs) {
            if (img.storage_path) await eliminarImagenAdmin(img.storage_path);
        }
        toast('Producto eliminado.');
        renderizar(contenedorActual || $('#adminView'));
    } catch (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
    }
}