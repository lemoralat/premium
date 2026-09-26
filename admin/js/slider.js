// slider.js — CRUD de slides del hero (portada del inicio).

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, LIMITES_IMAGEN } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

let slides = [];

const OPCIONES_MOSTRAR = [
    { valor: 'ambos', nombre: 'Ambos', icono: 'ti ti-device-mobile' },
    { valor: 'mobile', nombre: 'Móvil', icono: 'ti ti-device-mobile' },
    { valor: 'desktop', nombre: 'Escritorio', icono: 'ti ti-device-desktop' }
];

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('sliders').select('*').order('position', { ascending: true });
    if (error) throw error;
    slides = data || [];

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Portada del inicio. Sin slides activos, la sección desaparece de la tienda.</p>
            <button type="button" class="btn btn-primary" id="btnNuevoSlide">
                <i class="ti ti-plus"></i> Nuevo slide
            </button>
        </div>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Imagen</th><th>Título</th><th>Orden</th><th>Visible en</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    $('#btnNuevoSlide').addEventListener('click', () => abrirModalSlide(null));
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalSlide(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-duplicar]').forEach((btn) => {
        btn.addEventListener('click', () => duplicarSlide(Number(btn.dataset.duplicar), contenedor, btn));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarSlide(Number(btn.dataset.borrar), contenedor));
    });
}

function filas() {
    if (!slides.length) {
        return `<tr><td colspan="6"><div class="admin-empty"><p>No hay slides. Agregá el primero.</p></div></td></tr>`;
    }
    return slides.map((s) => `
        <tr>
            <td class="td-principal">
                <img src="${esc(urlPublica(s.storage_path || s.external_url))}" alt=""
                     style="width:100px; height:56px; object-fit:cover; border-radius:8px; border:1px solid var(--border); flex-shrink:0;">
            </td>
            <td data-label="Título">
                <strong>${esc(s.titulo)}</strong>
                ${s.texto_soporte ? `<br><span style="color:var(--text-muted); font-size:0.8rem;">${esc(recCorto(s.texto_soporte))}</span>` : ''}
                ${s.link ? `<br><span style="color:var(--text-muted); font-size:0.8rem;">${esc(s.link)}</span> ${s.target === 'externo' ? '<span class="estado-badge estado-procesando">Externo</span>' : ''}` : ''}
            </td>
            <td data-label="Orden">${esc(s.position)}</td>
            <td data-label="Visible en">${etiquetaMostrarEn(s.mostrar_en)}</td>
            <td data-label="Estado">${s.activo
                ? '<span class="estado-badge estado-entregado">Activo</span>'
                : '<span class="estado-badge estado-cancelado">Inactivo</span>'}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(s.id)}" title="Editar"><i class="ti ti-edit"></i></button>
                <button type="button" class="btn btn-sm" data-duplicar="${esc(s.id)}" title="Duplicar" aria-label="Duplicar slide"><i class="ti ti-copy"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(s.id)}" title="Eliminar"><i class="ti ti-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function recCorto(texto) {
    return String(texto || '');
}

function etiquetaMostrarEn(valor) {
    const v = (valor || '').toLowerCase();
    if (v === 'mobile') return 'Solo móvil';
    if (v === 'desktop') return 'Solo escritorio';
    return 'Ambos';
}

function abrirModalSlide(idExistente) {
    const slide = idExistente ? slides.find((s) => s.id === idExistente) : null;
    const mostrarEnActual = ['ambos', 'mobile', 'desktop'].includes(slide?.mostrar_en) ? slide.mostrar_en : 'ambos';

    abrirModal(`
        <h2>${slide ? 'Editar slide' : 'Nuevo slide'}</h2>
        <p class="modal-sub">${slide ? esc(slide.titulo) : 'Agregá una imagen de portada con su texto'}</p>
        <form class="admin-form" id="slideForm">
            <input type="hidden" id="sldId" value="${slide ? slide.id : ''}">
            <input type="hidden" id="sldStorageAnterior" value="${esc(slide?.storage_path || '')}">

            <div class="admin-field full">
                <label>Imagen de fondo (recomendado 1920×800)</label>
                <div class="admin-imagenes">
                    <img src="${esc(urlPublica(slide?.storage_path || slide?.external_url || ''))}"
                         alt="" id="sldPreview"
                         style="max-width:100%; height:140px; object-fit:cover; border-radius:10px; border:1px solid var(--border);">
                    <div class="admin-img-upload">
                        <label class="btn btn-outline admin-file-btn">
                            <i class="ti ti-cloud-upload"></i> Elegir imagen
                            <input type="file" id="sldArchivo" accept="image/jpeg,image/png,image/webp">
                        </label>
                        <div class="admin-field admin-url-field">
                            <input type="url" id="sldUrlExterna" class="admin-url-input" placeholder="…o pegá una URL de imagen externa"
                                   value="${esc(slide && !slide.storage_path ? (slide.external_url || '') : '')}">
                            <span class="hint">Si elegís archivo, este campo se ignora.</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="admin-field full">
                <label for="sldTitulo">Título</label>
                <input type="text" id="sldTitulo" value="${esc(slide?.titulo || '')}" placeholder="ej: Envíos a todo el país">
            </div>
            <div class="admin-field full">
                <label for="sldTextoSoporte">Texto de apoyo</label>
                <textarea id="sldTextoSoporte" placeholder="Texto breve que acompaña al título">${esc(slide?.texto_soporte || '')}</textarea>
            </div>
            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="sldLink">Enlace (opcional)</label>
                    <input type="url" id="sldLink" value="${esc(slide?.link || '')}" placeholder="https://…">
                </div>
                <div class="admin-field">
                    <label for="sldTarget">Comportamiento del enlace</label>
                    <select id="sldTarget">
                        <option value="interno" ${slide?.target === 'externo' ? '' : 'selected'}>Interno (misma pestaña)</option>
                        <option value="externo" ${slide?.target === 'externo' ? 'selected' : ''}>Externo (nueva pestaña)</option>
                    </select>
                </div>
                <div class="admin-field">
                    <label for="sldPosition">Orden</label>
                    <input type="number" id="sldPosition" min="0" step="1" value="${esc(slide?.position ?? (slides.length + 1))}">
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="sldActivo" ${slide?.activo === false ? '' : 'checked'}>
                        Slide activo
                    </label>
                </div>
                <div class="admin-field full">
                    <label>Mostrar en</label>
                    <div class="slider-dispositivos" id="sldDispositivos">
                        ${OPCIONES_MOSTRAR.map((o) => {
                            const activo = o.valor === mostrarEnActual;
                            return `
                            <label class="sld-dispositivo ${activo ? 'activa' : ''}">
                                <input type="radio" name="sldMostrarEn" value="${o.valor}" ${activo ? 'checked' : ''}>
                                <i class="${o.icono}"></i>
                                <span>${o.nombre}</span>
                            </label>`;
                        }).join('')}
                    </div>
                    <span class="hint">Móvil = hasta 768px de ancho de pantalla; escritorio = más de 768px.</span>
                </div>
            </div>
            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    const archivoInput = $('#sldArchivo');
    let archivoOptimizado = null;
    archivoInput.addEventListener('change', async () => {
        const archivo = archivoInput.files[0];
        if (!archivo) return;
        try {
            const lista = await validarYOptimizarImagen(archivo, { maxLado: LIMITES_IMAGEN.slider });
            archivoOptimizado = lista;
            $('#sldPreview').src = URL.createObjectURL(lista);
            $('#sldPreview').dataset.nombre = archivo.name;
        } catch (error) {
            toast(error.message, 'error');
            archivoInput.value = '';
        }
    });

    // Resaltar la opción elegida de "Mostrar en"
    document.querySelectorAll('input[name="sldMostrarEn"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('input[name="sldMostrarEn"]').forEach((r) => r.closest('.sld-dispositivo').classList.toggle('activa', r.checked));
        });
    });

    $('#slideForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#slideForm').querySelector('[type="submit"]');

        const idValor = $('#sldId').value;
        const archivo = archivoOptimizado;
        const urlExterna = $('#sldUrlExterna').value.trim();

        if (archivo && urlExterna) {
            toast('Elegí una sola fuente de imagen: archivo o URL externa.', 'error');
            return;
        }

        const payload = {
            titulo: $('#sldTitulo').value.trim(),
            texto_soporte: $('#sldTextoSoporte').value.trim(),
            link: $('#sldLink').value.trim(),
            target: $('#sldTarget').value,
            position: parseInt($('#sldPosition').value) || 0,
            activo: $('#sldActivo').checked,
            mostrar_en: document.querySelector('input[name="sldMostrarEn"]:checked')?.value || 'ambos'
        };

        conCarga(submitBtn, guardarSlide(payload, idValor ? Number(idValor) : null, archivo, urlExterna))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarSlide(payload, id, archivo, urlExterna) {
    const sb = await clienteAdmin();
    let storagePathAnterior = id ? slides.find((s) => s.id === id)?.storage_path || '' : '';

    // 1) Crear o actualizar el registro (sin cambios de imagen todavía)
    let registroId = id;
    if (id) {
        const { error } = await sb.from('sliders').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { data, error } = await sb.from('sliders').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        registroId = data?.id;
    }

    // 2) Imagen: archivo nuevo, URL externa o sin cambios
    let imagenPayload = null;
    if (archivo) {
        const storagePath = await subirImagenAdmin('slider', 'slides', archivo);
        imagenPayload = { storage_path: storagePath, external_url: null };
    } else if (urlExterna) {
        imagenPayload = { storage_path: null, external_url: urlExterna };
    }

    if (imagenPayload) {
        const { error } = await sb.from('sliders').update(imagenPayload).eq('id', registroId);
        if (error) throw new Error(error.message);

        // Liberar el archivo del Storage anterior (si lo había). El chequeo de
        // referencias va adentro de liberarImagenSiSobra: la copia de un slide
        // duplicado comparte el archivo con el original, así que borrarlo sin
        // comprobarlo le dejaría la imagen rota.
        if (archivo) {
            await liberarImagenSiSobra(storagePathAnterior);
        }
    }

    toast(id ? 'Slide actualizado.' : 'Slide creado.');
}

async function borrarSlide(id, contenedor) {
    if (!(await confirmarBorrado('¿Eliminar este slide?'))) return;
    const sb = await clienteAdmin();
    const slide = slides.find((s) => s.id === id);
    const { error } = await sb.from('sliders').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    // La fila ya no está, así que el chequeo de referencias sólo ve a las demás.
    if (slide?.storage_path) await liberarImagenSiSobra(slide.storage_path);
    toast('Slide eliminado.');
    renderizar(contenedor);
}

// Copia un slide con todos sus datos, para poder editar la variante sin
// arrancar de cero (por ejemplo, partir el slide de escritorio en dos). La
// copia queda activa y con el mismo comportamiento de enlace que el original.
async function duplicarSlide(id, contenedor, boton) {
    const sb = await clienteAdmin();
    const original = slides.find((s) => s.id === id);
    if (!original) {
        toast('No se encontró el slide a duplicar.', 'error');
        return;
    }

    // Se avisa con el botón en vez de con conCarga(): aquel restaura el
    // contenido con textContent, y en un botón que sólo tiene un <i> eso deja
    // el botón sin icono para siempre. Acá se restaura el innerHTML.
    const htmlOriginal = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i>';

    try {
        // 1) Desplazar los que van después, para que la copia caiga justo
        //    detrás del original sin dejar dos slides con la misma posición: el
        //    front sólo ordena por `position`, así que un empate haría el orden
        //    no determinista. Va antes del insert a propósito: si el insert
        //    falla queda un hueco en las posiciones, que es inofensivo, y nunca
        //    un empate, que sí lo sería.
        for (const s of slides) {
            if (s.position <= original.position) continue;
            const { error } = await sb
                .from('sliders')
                .update({ position: s.position + 1 })
                .eq('id', s.id);
            if (error) throw new Error(error.message);
        }

        // 2) Insertar la copia. Comparte el archivo del original (mismo
        //    storage_path) en vez de copiarlo en el Storage: es el mismo
        //    contenido, y no ocupa el doble. Ver liberarImagenSiSobra() para
        //    por qué eso no rompe al original ni a la copia al editar o borrar
        //    cualquiera de las dos.
        const { error } = await sb.from('sliders').insert({
            titulo: original.titulo,
            texto_soporte: original.texto_soporte,
            storage_path: original.storage_path,
            external_url: original.external_url,
            link: original.link,
            target: original.target,
            mostrar_en: original.mostrar_en,
            activo: original.activo,
            position: original.position + 1
        });
        if (error) throw new Error(error.message);

        toast('Slide duplicado.');
        renderizar(contenedor);
    } catch (error) {
        toast(`No se pudo duplicar: ${error.message}`, 'error');
        boton.disabled = false;
        boton.innerHTML = htmlOriginal;
    }
}

// Borra el archivo del Storage sólo si ningún otro slide lo sigue usando.
//
// Hace falta porque al duplicar las dos filas comparten el mismo storage_path.
// Sin esta comprobación, cambiarle la imagen a la copia borraba el archivo del
// original (que se quedaba sin foto), y borrar el original dejaba a la copia sin
// imagen.
//
// Si la consulta no puede responder no se borra nada: dejar un archivo huérfano
// en el Storage es un menor problema que borrar un archivo que alguien está
// usando, y el huérfano se limpia desde el panel de Storage.
async function liberarImagenSiSobra(storagePath) {
    if (!storagePath) return;
    const sb = await clienteAdmin();
    const { data, error } = await sb
        .from('sliders')
        .select('id')
        .eq('storage_path', storagePath)
        .limit(1);
    if (error) {
        console.warn('No se pudo comprobar si la imagen sigue en uso; se conserva el archivo:', error.message);
        return;
    }
    if (data && data.length > 0) return; // otra fila todavía lo apunta
    await eliminarImagenAdmin(storagePath);
}