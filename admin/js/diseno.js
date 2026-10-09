// ============================================================================
// diseno.js — Sección "Diseño": identidad visual de la tienda.
// Administra sobre la fila única `settings` (id=1):
//   - logotipo      → logo_path      (bucket branding/logo)
//   - tamaño logo   → logo_tamano     (small | medium | large)
//   - favicon       → favicon_path   (bucket branding/favicon)
//   - color         → color_principal (#RRGGBB → --primary-color)
//   - bordes        → estilo_bordes  (redondeado | circular | recto)
//   - OpenGraph     → og_image_path  (bucket branding/og)
// Los recursos se suben a Storage y se guarda el storage_path "<bucket>/<ruta>".
// ============================================================================

import {
    $, esc, toast, confirmarBorrado, conCarga, estadoCargando,
    validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, urlPublica, LIMITES_IMAGEN
} from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { renderizarGestor as renderizarGestorMarquee } from './marquee.js';

const COLOR_DEFECTO = '#000000';
let esTurnos = false; // modo de la tienda: ajusta "productos" → "servicios"

const RECURSOS_IMAGEN = [
    {
        recurso: 'logo', columna: 'logo_path', carpeta: 'logo',
        label: 'Logotipo de la tienda',
        hint: 'Se muestra en el encabezado. Recomendado: PNG/WebP con fondo transparente, hasta ~512×512 px.'
    },
    {
        recurso: 'favicon', columna: 'favicon_path', carpeta: 'favicon',
        label: 'Favicon',
        hint: 'Icono del navegador. Recomendado: PNG cuadrado de 64×64 px o más (el validador no acepta SVG).',
        // Sin favicon cargado se muestra el logo de Lemora como preview (default de la tienda)
        defaultPreview: '../img/lemora.svg'
    },
    {
        recurso: 'og', columna: 'og_image_path', carpeta: 'og',
        label: 'Imagen para OpenGraph',
        hint: 'Imagen que se muestra al compartir el enlace en redes y WhatsApp. Recomendado: 1200×630 px.'
    }
];

const BORDES = [
    { valor: 'redondeado', nombre: 'Ligeramente redondeados', desc: 'Esquinas suaves. Estilo actual.', clase: 'muestra-redondeado' },
    { valor: 'circular', nombre: 'Completamente redondos', desc: 'Botones y controles en píldora; tarjetas con esquinas redondeadas.', clase: 'muestra-circular' },
    { valor: 'recto', nombre: 'Sin bordes', desc: 'Esquinas rectas en toda la tienda.', clase: 'muestra-recto' }
];

// Tamaños del logotipo del encabezado (la tienda aplica height: 40/60/80px)
const LOGO_TAMANOS = [
    { valor: 'small', nombre: 'Small', px: 40 },
    { valor: 'medium', nombre: 'Medium', px: 60 },
    { valor: 'large', nombre: 'Large', px: 80 }
];

const CARD_FORMATS = [
    { valor: '1:1', nombre: 'Cuadrado', desc: '1:1', aspecto: '1 / 1' },
    { valor: '3:2', nombre: 'Horizontal', desc: '3:2', aspecto: '3 / 2' },
    { valor: '4:5', nombre: 'Vertical', desc: '4:5', aspecto: '4 / 5' }
];

// Estado por recurso de imagen: path actual, archivo nuevo pendiente y "quitar".
const estadoImagenes = {};

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('settings').select('*').eq('id', 1).single();
    if (error) throw error;
    const s = data;
    esTurnos = s.modo_web === 'turnos';

    const color = /^#[0-9a-fA-F]{6}$/.test(s.color_principal || '') ? s.color_principal : COLOR_DEFECTO;
    const marqueeColor = /^#[0-9a-fA-F]{6}$/.test(s.marquee_color_fondo || '') ? s.marquee_color_fondo : COLOR_DEFECTO;
    const bordesHTML = BORDES.map((b) => bordeOpcion(b, s.estilo_bordes)).join('');
    // El selector de tamaño va junto a la subida del logo (primer recurso)
    const imagenesHTML = RECURSOS_IMAGEN.map((r, i) =>
        campoImagen(r, s[r.columna]) + (i === 0 ? campoTamanoLogo(s.logo_tamano) : '')
    ).join('');
    const cardFormatHTML = campoFormatoCard(s.card_image_format);

    contenedor.innerHTML = `
        <style>
            .diseno-imagen { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
            .diseno-preview {
                min-width: 150px; min-height: 84px; flex: 0 0 auto;
                display: grid; place-items: center;
                border: 1px dashed var(--border); border-radius: 10px; background: #fafafa;
                padding: 0.5rem;
            }
            .diseno-preview img { max-width: 220px; max-height: 96px; object-fit: contain; }
            .diseno-preview-vacio { color: var(--muted, #64748b); font-size: 0.8rem; text-align: center; padding: 0.5rem; }
            .diseno-preview-acciones { display: flex; gap: 0.5rem; align-items: center; }
            .diseno-color { display: flex; gap: 0.7rem; align-items: center; margin-bottom: 0.3rem; }
            .diseno-color input[type="color"] { width: 46px; height: 40px; padding: 2px; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; }
            .diseno-color input[type="text"] { width: 9ch; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: lowercase; }
            .diseno-bordes { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.8rem; }
            .diseno-borde {
                position: relative; display: flex; flex-direction: column; gap: 0.55rem; align-items: flex-start;
                border: 2px solid var(--border); border-radius: 12px; padding: 0.9rem; cursor: pointer;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .diseno-borde:has(input:checked),
            .diseno-borde.activa { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent); }
            .diseno-borde input { position: absolute; opacity: 0; pointer-events: none; }
            .diseno-borde-nombre { font-size: 0.9rem; font-weight: 600; }
            .diseno-borde-nombre em { display: block; font-style: normal; font-weight: 400; color: var(--muted, #64748b); font-size: 0.78rem; margin-top: 0.2rem; }
            .diseno-borde-muestra { width: 56px; height: 38px; border: 2px solid #94a3b8; background: #e2e8f0; }
            .muestra-redondeado { border-radius: 10px; }
            .muestra-circular { border-radius: 999px; }
            .muestra-recto { border-radius: 0; }
            .diseno-tamano { display: flex; gap: 0.7rem; flex-wrap: wrap; }
            .diseno-tamano-opcion {
                position: relative; display: flex; gap: 0.55rem; align-items: center;
                border: 2px solid var(--border); border-radius: 12px; padding: 0.7rem 0.9rem; cursor: pointer;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .diseno-tamano-opcion:has(input:checked),
            .diseno-tamano-opcion.activa { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent); }
            .diseno-tamano-opcion input { position: absolute; opacity: 0; pointer-events: none; }
            .diseno-tamano-muestra { width: 34px; background: var(--primary); border-radius: 4px; flex: 0 0 auto; }
            .diseno-tamano-muestra.tamano-small { height: 10px; }
            .diseno-tamano-muestra.tamano-medium { height: 15px; }
            .diseno-tamano-muestra.tamano-large { height: 20px; }
            .diseno-tamano-nombre { font-size: 0.9rem; font-weight: 600; }
            .diseno-tamano-nombre em { display: block; font-style: normal; font-weight: 400; color: var(--muted, #64748b); font-size: 0.78rem; margin-top: 0.15rem; }
            .diseno-formatos { display: flex; gap: 0.7rem; flex-wrap: wrap; }
            .diseno-formato-opcion {
                position: relative; display: flex; gap: 0.65rem; align-items: center;
                border: 2px solid var(--border); border-radius: 12px; padding: 0.7rem 0.9rem; cursor: pointer;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .diseno-formato-opcion:has(input:checked),
            .diseno-formato-opcion.activa { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent); }
            .diseno-formato-opcion input { position: absolute; opacity: 0; pointer-events: none; }
            .diseno-formato-muestra { width: 42px; max-height: 58px; background: var(--primary); border-radius: 4px; flex: 0 0 auto; }
            .diseno-formato-nombre { font-size: 0.9rem; font-weight: 600; }
            .diseno-formato-nombre em { display: block; font-style: normal; font-weight: 400; color: var(--muted, #64748b); font-size: 0.78rem; margin-top: 0.15rem; }
        </style>

        <div class="admin-card">
            <h2>Identidad visual</h2>
            <p class="card-sub">Se aplica en toda la tienda al recargar una página.</p>
            <form class="admin-form" id="disenoForm">
                <div class="admin-form-grid">
                    ${imagenesHTML}
                    ${cardFormatHTML}
                    <div class="admin-field full">
                        <label for="dsnColor">Color principal</label>
                        <div class="diseno-color">
                            <input type="color" id="dsnColorPicker" value="${esc(color)}" aria-label="Selector de color principal">
                            <input type="text" id="dsnColor" value="${esc(color)}" maxlength="7" spellcheck="false" aria-label="Color principal en formato hexadecimal">
                            <button type="button" class="btn btn-sm btn-outline" id="dsnColorRestaurar">Restaurar (#000000)</button>
                        </div>
                        <span class="hint">Se aplica a botones, enlaces y acentos de la tienda.</span>
                    </div>
                    <div class="admin-field full">
                        <label for="dsnMarqueeColor">Color de fondo del marquee</label>
                        <div class="diseno-color">
                            <input type="color" id="dsnMarqueeColorPicker" value="${esc(marqueeColor)}" aria-label="Selector de color de fondo del marquee">
                            <input type="text" id="dsnMarqueeColor" value="${esc(marqueeColor)}" maxlength="7" spellcheck="false" aria-label="Color del marquee en hexadecimal">
                            <button type="button" class="btn btn-sm btn-outline" id="dsnMarqueeColorRestaurar">Restaurar (#000000)</button>
                        </div>
                        <span class="hint">Se aplica a la barra marquee superior. El texto se mantiene blanco.</span>
                    </div>
                    <div class="admin-field full">
                        <label class="admin-check">
                            <input type="checkbox" id="dsnMarqueeActivo" ${s.marquee_activo === true ? 'checked' : ''}>
                            Mostrar marquee en la tienda
                        </label>
                    </div>
                    <div class="admin-field full">
                        <label>Estilo de bordes</label>
                        <div class="diseno-bordes">${bordesHTML}</div>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar diseño</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>Marquee promocional</h2>
            <p class="card-sub">Barra animada sobre el encabezado. La activación y el color se guardan con "Guardar diseño".</p>
            <div id="marqueeGestor"></div>
        </div>
    `;

    // --- Color: sincronizar picker ↔ text y restaurar ---
    const picker = $('#dsnColorPicker');
    const texto = $('#dsnColor');
    picker.addEventListener('input', () => { texto.value = picker.value; });
    texto.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(texto.value.trim())) picker.value = texto.value.trim();
    });
    $('#dsnColorRestaurar').addEventListener('click', () => {
        picker.value = COLOR_DEFECTO;
        texto.value = COLOR_DEFECTO;
    });

    // --- Color del marquee: sincronizar picker ↔ text y restaurar ---
    const mqPicker = $('#dsnMarqueeColorPicker');
    const mqTexto = $('#dsnMarqueeColor');
    mqPicker.addEventListener('input', () => { mqTexto.value = mqPicker.value; });
    mqTexto.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(mqTexto.value.trim())) mqPicker.value = mqTexto.value.trim();
    });
    $('#dsnMarqueeColorRestaurar').addEventListener('click', () => {
        mqPicker.value = COLOR_DEFECTO;
        mqTexto.value = COLOR_DEFECTO;
    });

    // --- Bordes: resaltar la opción elegida ---
    document.querySelectorAll('input[name="estiloBordes"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('input[name="estiloBordes"]').forEach((r) => r.closest('.diseno-borde').classList.toggle('activa', r.checked));
        });
    });

    // --- Tamaño de logo: resaltar la opción elegida ---
    document.querySelectorAll('input[name="logoTamano"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('input[name="logoTamano"]').forEach((r) => r.closest('.diseno-tamano-opcion').classList.toggle('activa', r.checked));
        });
    });

    // --- Formato de cards: resaltar la opción elegida ---
    document.querySelectorAll('input[name="cardImageFormat"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('input[name="cardImageFormat"]').forEach((r) => r.closest('.diseno-formato-opcion').classList.toggle('activa', r.checked));
        });
    });

    // --- Imágenes: preparar estado y eventos por recurso ---
    RECURSOS_IMAGEN.forEach((r) => prepararCampoImagen(r, s[r.columna]));

    // --- Marquee: gestor de mensajes (widget propio, re-render local) ---
    renderizarGestorMarquee($('#marqueeGestor')).catch((error) => toast(error.message, 'error'));

    // --- Guardar ---
    $('#disenoForm').addEventListener('submit', (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#disenoForm').querySelector('[type="submit"]');
        conCarga(submitBtn, guardar())
            .then(() => {
                toast('Diseño guardado. Recargá la tienda para ver los cambios.');
                // Refresca los previews con el estado guardado (no debe fallar la
                // navegación si el re-render tiene un error ajeno al guardado).
                return renderizar(contenedor).catch((error) => console.warn('Diseño guardado, pero no se pudo refrescar la vista:', error));
            })
            .catch((error) => toast(error.message, 'error'));
    });
}

// ---------- Helpers ----------

function campoImagen(r, pathActual) {
    const url = urlPublica(pathActual || '');
    return `
        <div class="admin-field full">
            <label>${esc(r.label)}</label>
            <div class="diseno-imagen" data-recurso="${esc(r.recurso)}">
                <div class="diseno-preview" data-preview>
                    ${url ? `<img src="${esc(url)}" alt="">` : campoVacioHTML(r)}
                </div>
                <div class="diseno-preview-acciones">
                    <label class="btn btn-sm btn-outline admin-file-btn">
                        <i class="fa-solid fa-cloud-arrow-up"></i> ${url ? 'Reemplazar' : 'Subir'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" data-archivo>
                    </label>
                    ${url ? '<button type="button" class="btn btn-sm btn-danger" data-quitar><i class="fa-solid fa-trash-can"></i> Quitar</button>' : ''}
                </div>
                <span class="hint">${esc(r.hint)}</span>
            </div>
        </div>`;
}

// HTML del estado vacío del preview. Para recursos con defaultPreview (el
// favicon) se muestra la imagen de respaldo de Lemora; el resto mantiene el
// placeholder textual.
function campoVacioHTML(r, caption) {
    const texto = caption || (r.defaultPreview
        ? 'Por defecto se usa el logo de Lemora'
        : 'Sin archivo<br><small>Se usará el actual por defecto</small>');
    return r.defaultPreview
        ? `<span class="diseno-preview-vacio"><img src="${esc(r.defaultPreview)}" alt="" class="diseno-preview-defecto"><small>${esc(texto)}</small></span>`
        : `<span class="diseno-preview-vacio">${texto}</span>`;
}

function bordeOpcion(b, actual) {
    const activo = b.valor === (actual || 'redondeado');
    return `
        <label class="diseno-borde ${activo ? 'activa' : ''}">
            <input type="radio" name="estiloBordes" value="${esc(b.valor)}" ${activo ? 'checked' : ''}>
            <span class="diseno-borde-muestra ${esc(b.clase)}" aria-hidden="true"></span>
            <span class="diseno-borde-nombre">${esc(b.nombre)}<em>${esc(b.desc)}</em></span>
        </label>`;
}

// Selector de tamaño del logotipo (Small / Medium / Large). Va justo después
// del campo de subida del logo; la tienda lo aplica como height en .logo
// (css/styles.css: .logo--medium / .logo--large).
function campoTamanoLogo(actual) {
    const sel = LOGO_TAMANOS.some((t) => t.valor === actual) ? actual : 'small';
    const opciones = LOGO_TAMANOS.map((t) => {
        const activo = t.valor === sel;
        return `
        <label class="diseno-tamano-opcion ${activo ? 'activa' : ''}">
            <input type="radio" name="logoTamano" value="${t.valor}" ${activo ? 'checked' : ''}>
            <span class="diseno-tamano-muestra tamano-${t.valor}" aria-hidden="true"></span>
            <span class="diseno-tamano-nombre">${t.nombre}<em>${t.px} px</em></span>
        </label>`;
    }).join('');

    return `
        <div class="admin-field full">
            <label>Tamaño del logotipo</label>
            <div class="diseno-tamano">${opciones}</div>
            <span class="hint">Altura del logotipo en el encabezado de la tienda; el ancho se ajusta solo.</span>
        </div>`;
}

function campoFormatoCard(actual) {
    const valor = CARD_FORMATS.some((formato) => formato.valor === actual) ? actual : '1:1';
    const opciones = CARD_FORMATS.map((formato) => {
        const activo = formato.valor === valor;
        return `
        <label class="diseno-formato-opcion ${activo ? 'activa' : ''}">
            <input type="radio" name="cardImageFormat" value="${esc(formato.valor)}" ${activo ? 'checked' : ''}>
            <span class="diseno-formato-muestra" style="aspect-ratio:${formato.aspecto};" aria-hidden="true"></span>
            <span class="diseno-formato-nombre">${esc(formato.nombre)}<em>${esc(formato.desc)}</em></span>
        </label>`;
    }).join('');

    return `
        <div class="admin-field full">
            <label>Formato de las imágenes de los cards</label>
            <div class="diseno-formatos">${opciones}</div>
            <span class="hint">Se aplica a los cards del catálogo, búsqueda y ${esTurnos ? 'servicios relacionados' : 'productos relacionados'}.</span>
        </div>`;
}

// Arma el estado y los eventos de subida / reemplazo / quita por recurso.
function prepararCampoImagen(r, pathActual) {
    const urlOriginal = urlPublica(pathActual || '');
    const est = estadoImagenes[r.recurso] = {
        actual: pathActual || '',
        archivo: null,
        quitar: false,
        objetoUrl: ''
    };

    const bloque = document.querySelector(`[data-recurso="${esc(r.recurso)}"]`);
    if (!bloque) return;
    const preview = bloque.querySelector('[data-preview]');
    const archivoInput = bloque.querySelector('[data-archivo]');
    const quitarBtn = bloque.querySelector('[data-quitar]');

    const mostrarVacio = (mensaje) => {
        preview.innerHTML = campoVacioHTML(r, mensaje);
    };

    const renderDesdeEstado = () => {
        if (est.quitar) {
            mostrarVacio('Se quitará al guardar');
        } else if (est.objetoUrl) {
            preview.innerHTML = `<img src="${est.objetoUrl}" alt="">`;
        } else if (urlOriginal) {
            preview.innerHTML = `<img src="${esc(urlOriginal)}" alt="">`;
        } else {
            mostrarVacio();
        }
    };

    const actualizarBotonQuitar = () => {
        if (!quitarBtn) return;
        if (est.quitar) {
            quitarBtn.dataset.pendiente = '1';
            quitarBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Quitar (click para deshacer)';
            quitarBtn.classList.add('btn-outline');
            quitarBtn.classList.remove('btn-danger');
        } else {
            delete quitarBtn.dataset.pendiente;
            quitarBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Quitar';
            quitarBtn.classList.remove('btn-outline');
            quitarBtn.classList.add('btn-danger');
        }
    };

    archivoInput.addEventListener('change', async () => {
        const archivo = archivoInput.files[0];
        if (!archivo) return;
        try {
            const limite = r.recurso === 'favicon'
                ? LIMITES_IMAGEN.favicon
                : r.recurso === 'og'
                    ? LIMITES_IMAGEN.openGraph
                    : LIMITES_IMAGEN.branding;
            const optimizado = await validarYOptimizarImagen(archivo, { maxLado: limite });
            const lista = optimizado && optimizado.size ? optimizado : archivo;
            if (est.objetoUrl) URL.revokeObjectURL(est.objetoUrl);
            est.objetoUrl = URL.createObjectURL(lista);
            est.archivo = lista;
            est.quitar = false;
            renderDesdeEstado();
            actualizarBotonQuitar();
        } catch (error) {
            toast(error.message, 'error');
            archivoInput.value = '';
        }
    });

    if (quitarBtn) {
        quitarBtn.addEventListener('click', async () => {
            if (est.quitar) {
                // Deshacer la quita
                est.quitar = false;
                est.archivo = null;
                archivoInput.value = '';
                renderDesdeEstado();
            } else {
                const confirmarMsg = r.defaultPreview
                    ? `¿Quitar el ${r.label.toLowerCase()}? Se usará el logo de Lemora por defecto.`
                    : `¿Quitar el ${r.label.toLowerCase()}? Se usará el archivo por defecto de la tienda.`;
                if (!(await confirmarBorrado(confirmarMsg))) return;
                est.quitar = true;
                est.archivo = null;
                archivoInput.value = '';
                renderDesdeEstado();
            }
            actualizarBotonQuitar();
        });
    }
}

// Valida y persiste todo el diseño en la fila settings.
async function guardar() {
    const sb = await clienteAdmin();
    const payload = {};

    // Color principal
    const color = $('#dsnColor').value.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error('Color inválido. Usá formato #RRGGBB.');
    payload.color_principal = color;

    // Estilo de bordes
    const estilo = document.querySelector('input[name="estiloBordes"]:checked');
    if (!estilo) throw new Error('Elegí un estilo de bordes.');
    payload.estilo_bordes = estilo.value;

    // Tamaño del logotipo
    const tamano = document.querySelector('input[name="logoTamano"]:checked');
    if (!tamano) throw new Error('Elegí un tamaño de logotipo.');
    payload.logo_tamano = tamano.value;

    const formatoCard = document.querySelector('input[name="cardImageFormat"]:checked');
    if (!formatoCard || !CARD_FORMATS.some((formato) => formato.valor === formatoCard.value)) {
        throw new Error('Elegí un formato válido para las imágenes de los cards.');
    }
    payload.card_image_format = formatoCard.value;

    // Marquee: color de fondo + mostrar/ocultar
    const marqueeHex = $('#dsnMarqueeColor').value.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(marqueeHex)) throw new Error('Color del marquee inválido. Usá formato #RRGGBB.');
    payload.marquee_color_fondo = marqueeHex;
    payload.marquee_activo = $('#dsnMarqueeActivo').checked;

    // Recursos de imagen: subir/actualizar primero y borrar el anterior
    // solo después de que la base de datos acepte el nuevo estado.
    const imagenesAnteriores = [];
    for (const r of RECURSOS_IMAGEN) {
        const est = estadoImagenes[r.recurso];
        if (!est) continue;
        if (est.quitar) {
            payload[r.columna] = null;
            if (est.actual) imagenesAnteriores.push(est.actual);
        } else if (est.archivo) {
            payload[r.columna] = await subirImagenAdmin('branding', r.carpeta, est.archivo);
            if (est.actual) imagenesAnteriores.push(est.actual);
        }
    }

    const { error } = await sb.from('settings').update(payload).eq('id', 1);
    if (error) throw new Error(error.message);

    for (const storagePath of imagenesAnteriores) {
        await eliminarImagenAdmin(storagePath);
    }
}