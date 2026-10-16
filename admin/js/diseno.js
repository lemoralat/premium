// ============================================================================
// diseno.js — Sección "Diseño": identidad visual de la tienda.
// Administra sobre la fila única `settings` (id=1):
//   - logotipo      → logo_path      (bucket branding/logo)
//   - tamaño logo   → logo_tamano     (small | medium | large)
//   - favicon       → favicon_path   (bucket branding/favicon)
//   - color         → color_principal (#RRGGBB → --primary-color)
//   - bordes        → estilo_bordes  (redondeado | circular | recto)
//   - OpenGraph     → og_image_path  (bucket branding/og)
//   - formato cards → card_image_format (1:1 | 3:2 | 4:5 | sin_imagenes)
//   - marquee       → marquee_color_fondo (#RRGGBB)
// Guardado automático: cada control persiste apenas cambia y avisa con un
// toast; la sección no tiene botón de guardado. Los recursos de imagen se
// suben a Storage y se guarda el storage_path "<bucket>/<ruta>".
// ============================================================================

import {
    $, esc, toast, confirmarBorrado, estadoCargando,
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
        hint: 'Se muestra en la parte superior de la tienda.',
        toastOk: 'Logotipo actualizado.',
        toastQuitar: 'Logotipo quitado.',
        confirmarQuitar: '¿Quitar el logotipo? Se usará el archivo por defecto de la tienda.'
    },
    {
        recurso: 'favicon', columna: 'favicon_path', carpeta: 'favicon',
        label: 'Favicon',
        hint: 'Es el pequeño icono que aparece en la pestaña del navegador cuando alguien visita tu tienda.',
        toastOk: 'Favicon actualizado.',
        toastQuitar: 'Favicon quitado.',
        confirmarQuitar: '¿Quitar el favicon? Se usará el logo de Lemora por defecto.',
        // Sin favicon cargado se muestra el logo de Lemora como preview (default de la tienda)
        defaultPreview: '../img/lemora.svg',
        captionVacio: 'Si no lo cambias, se usará el ícono de Lemora.'
    },
    {
        recurso: 'og', columna: 'og_image_path', carpeta: 'og',
        label: 'Imagen para compartir en redes sociales',
        hint: 'Es la imagen que aparece cuando alguien comparte el enlace de tu tienda en redes sociales o WhatsApp.',
        toastOk: 'Imagen para compartir actualizada.',
        toastQuitar: 'Imagen para compartir quitada.',
        confirmarQuitar: '¿Quitar la imagen para compartir? Se usará la imagen por defecto de la tienda.',
        // Sin imagen cargada se muestra la OpenGraph.png de la tienda como preview (default)
        defaultPreview: '../img/OpenGraph.png',
        captionVacio: 'Si no subís una imagen, se usará la de Lemora por defecto.'
    }
];

const BORDES = [
    { valor: 'redondeado', nombre: 'Ligeramente redondeados', desc: 'Esquinas suaves. con un aspecto moderno..', clase: 'muestra-redondeado' },
    { valor: 'circular', nombre: 'Completamente redondos', desc: 'Botones y controles con forma de píldora y tarjetas con esquinas redondeadas.', clase: 'muestra-circular' },
    { valor: 'recto', nombre: 'Sin bordes redondeados', desc: 'Esquinas rectas en toda la tienda.', clase: 'muestra-recto' }
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
    { valor: '4:5', nombre: 'Vertical', desc: '4:5', aspecto: '4 / 5' },
    // 0057: tienda sin fotos — los cards no muestran imagen, no hay galería y
    // el panel no permite subir (aspecto null = preview propio en el selector).
    { valor: 'sin_imagenes', nombre: 'Sin imágenes', desc: 'Los productos/servicios se mostrarán sin fotos.', aspecto: null }
];

// Estado por recurso de imagen: storage_path actual, para poder borrar el
// archivo anterior cuando se reemplaza o se quita.
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
            .diseno-preview img { max-width: 160px; max-height: 64px; object-fit: contain; }
            .diseno-preview-vacio { color: var(--muted, #64748b); font-size: var(--fs-sm); text-align: center; padding: 0.5rem; }
            .diseno-preview-acciones { display: flex; gap: 0.5rem; align-items: center; }
            .diseno-color { display: flex; gap: 0.7rem; align-items: center; margin-bottom: 0.3rem; }
            .diseno-color input[type="color"] { width: 46px; height: 40px; padding: 2px; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; }
            .diseno-color input[type="text"] { width: 9ch; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: lowercase; }
            /* Separación entre las opciones de la barra y el gestor de mensajes. */
            .diseno-marquee-config { margin-bottom: 1rem; }
            .diseno-bordes { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.8rem; }
            .diseno-borde {
                position: relative; display: flex; flex-direction: column; gap: 0.55rem; align-items: flex-start;
                border: 2px solid var(--border); border-radius: 12px; padding: 0.9rem; cursor: pointer;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .diseno-borde:has(input:checked),
            .diseno-borde.activa { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent); }
            .diseno-borde input { position: absolute; opacity: 0; pointer-events: none; }
            .diseno-borde-nombre { font-size: var(--fs-lg); font-weight: 600; }
            .diseno-borde-nombre em { display: block; font-style: normal; font-weight: 400; color: var(--muted, #64748b); font-size: var(--fs-sm); margin-top: 0.2rem; }
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
            .diseno-tamano-nombre { font-size: var(--fs-lg); font-weight: 600; }
            .diseno-tamano-nombre em { display: block; font-style: normal; font-weight: 400; color: var(--muted, #64748b); font-size: var(--fs-sm); margin-top: 0.15rem; }
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
            .diseno-formato-muestra--sin-imagen {
                position: relative; display: flex; align-items: center; justify-content: center;
                background: transparent; border: 1.5px dashed var(--muted, #94a3b8);
                width: 42px; height: 42px; color: var(--muted, #94a3b8); font-size: var(--fs-lg);
            }
            .diseno-formato-muestra--sin-imagen .fa-ban {
                position: absolute; top: -7px; right: -7px; font-size: var(--fs-xs); color: var(--danger, #dc2626);
                background: var(--surface, #fff); border-radius: 50%; padding: 1px;
            }
            .diseno-formato-nombre { font-size: var(--fs-lg); font-weight: 600; }
            .diseno-formato-nombre em { display: block; font-style: normal; font-weight: 400; color: var(--muted, #64748b); font-size: var(--fs-sm); margin-top: 0.15rem; }
        </style>

        <div class="admin-card">
            <h2>Identidad visual</h2>
            <p class="card-sub">Los cambios se aplican a toda la tienda cuando se actualiza la página.</p>
            <div class="admin-form-grid">
                ${imagenesHTML}
            </div>
        </div>

        <div class="admin-card">
            <h2>Formatos</h2>
            <div class="admin-form-grid">
                ${cardFormatHTML}
                <div class="admin-field full">
                    <label for="dsnColor">Color principal</label>
                    <span class="card-sub">Se utiliza en los botones, enlaces y otros detalles de la tienda.</span>
                    <div class="diseno-color">
                        <input type="color" id="dsnColorPicker" value="${esc(color)}" aria-label="Selector de color principal">
                        <input type="text" id="dsnColor" value="${esc(color)}" maxlength="7" spellcheck="false" aria-label="Color principal en formato hexadecimal">
                        <button type="button" class="btn btn-sm btn-outline" id="dsnColorRestaurar">Restaurar (#000000)</button>
                    </div>
                </div>
                <div class="admin-field full">
                    <label>Estilo de bordes</label>
                    <div class="diseno-bordes">${bordesHTML}</div>
                </div>
            </div>
        </div>

        <div class="admin-card">
            <h2>Barra promocional</h2>
            <p class="card-sub">Es la barra animada que aparece sobre el encabezado de la tienda. </p>
            <div class="admin-form-grid diseno-marquee-config">
                <div class="admin-field full">
                    <label for="dsnMarqueeColor">Color de fondo de la barra promocional</label>
                    <span class="card-sub">Cambia el color de fondo de la barra animada. La barra se muestra en la tienda solo si hay al menos un mensaje activo.</span>
                    <div class="diseno-color">
                        <input type="color" id="dsnMarqueeColorPicker" value="${esc(marqueeColor)}" aria-label="Selector de color de fondo de la barra promocional">
                        <input type="text" id="dsnMarqueeColor" value="${esc(marqueeColor)}" maxlength="7" spellcheck="false" aria-label="Color del marquee en hexadecimal">
                        <button type="button" class="btn btn-sm btn-outline" id="dsnMarqueeColorRestaurar">Restaurar (#000000)</button>
                    </div>
                </div>
            </div>
            <div id="marqueeGestor"></div>
        </div>
    `;

    // --- Color principal: sincronizar picker ↔ text y guardar al confirmar ---
    const picker = $('#dsnColorPicker');
    const texto = $('#dsnColor');
    picker.addEventListener('input', () => { texto.value = picker.value; });
    picker.addEventListener('change', () => {
        texto.value = picker.value;
        guardarAjuste({ color_principal: picker.value }, 'Color principal actualizado.');
    });
    texto.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(texto.value.trim())) picker.value = texto.value.trim();
    });
    texto.addEventListener('keydown', (event) => { if (event.key === 'Enter') texto.blur(); });
    texto.addEventListener('change', () => {
        const valor = texto.value.trim().toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(valor)) {
            toast('Color inválido. Usá formato #RRGGBB.', 'error');
            texto.value = picker.value;
            return;
        }
        texto.value = valor;
        picker.value = valor;
        guardarAjuste({ color_principal: valor }, 'Color principal actualizado.');
    });
    $('#dsnColorRestaurar').addEventListener('click', () => {
        picker.value = COLOR_DEFECTO;
        texto.value = COLOR_DEFECTO;
        guardarAjuste({ color_principal: COLOR_DEFECTO }, 'Color principal actualizado.');
    });

    // --- Color de la barra promocional: idem ---
    const mqPicker = $('#dsnMarqueeColorPicker');
    const mqTexto = $('#dsnMarqueeColor');
    mqPicker.addEventListener('input', () => { mqTexto.value = mqPicker.value; });
    mqPicker.addEventListener('change', () => {
        mqTexto.value = mqPicker.value;
        guardarAjuste({ marquee_color_fondo: mqPicker.value }, 'Color de la barra promocional actualizado.');
    });
    mqTexto.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(mqTexto.value.trim())) mqPicker.value = mqTexto.value.trim();
    });
    mqTexto.addEventListener('keydown', (event) => { if (event.key === 'Enter') mqTexto.blur(); });
    mqTexto.addEventListener('change', () => {
        const valor = mqTexto.value.trim().toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(valor)) {
            toast('Color inválido. Usá formato #RRGGBB.', 'error');
            mqTexto.value = mqPicker.value;
            return;
        }
        mqTexto.value = valor;
        mqPicker.value = valor;
        guardarAjuste({ marquee_color_fondo: valor }, 'Color de la barra promocional actualizado.');
    });
    $('#dsnMarqueeColorRestaurar').addEventListener('click', () => {
        mqPicker.value = COLOR_DEFECTO;
        mqTexto.value = COLOR_DEFECTO;
        guardarAjuste({ marquee_color_fondo: COLOR_DEFECTO }, 'Color de la barra promocional actualizado.');
    });

    // --- Estilo de bordes: resaltar y guardar al elegir ---
    document.querySelectorAll('input[name="estiloBordes"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('input[name="estiloBordes"]').forEach((r) => r.closest('.diseno-borde').classList.toggle('activa', r.checked));
            guardarAjuste({ estilo_bordes: radio.value }, 'Estilo de bordes actualizado.');
        });
    });

    // --- Tamaño de logo: resaltar y guardar al elegir ---
    document.querySelectorAll('input[name="logoTamano"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('input[name="logoTamano"]').forEach((r) => r.closest('.diseno-tamano-opcion').classList.toggle('activa', r.checked));
            guardarAjuste({ logo_tamano: radio.value }, 'Tamaño del logotipo actualizado.');
        });
    });

    // --- Formato de cards: resaltar, refrescar el texto de ayuda y guardar ---
    const subFormato = $('#dsnFormatoSub');
    document.querySelectorAll('input[name="cardImageFormat"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('input[name="cardImageFormat"]').forEach((r) => r.closest('.diseno-formato-opcion').classList.toggle('activa', r.checked));
            if (subFormato) subFormato.textContent = textoFormatoSub(radio.value);
            guardarAjuste({ card_image_format: radio.value }, 'Formato de las imágenes actualizado.');
        });
    });

    // --- Imágenes: subir/quitar apenas se elige (guardado automático) ---
    RECURSOS_IMAGEN.forEach((r) => prepararCampoImagen(r, s[r.columna], contenedor));

    // --- Marquee: gestor de mensajes (widget propio, re-render local) ---
    renderizarGestorMarquee($('#marqueeGestor')).catch((error) => toast(error.message, 'error'));
}

// ---------- Helpers ----------

function campoImagen(r, pathActual) {
    const url = urlPublica(pathActual || '');
    return `
        <div class="admin-field full">
            <label>${esc(r.label)}</label>
            <span class="card-sub">${esc(r.hint)}</span>
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
            </div>
        </div>`;
}

// HTML del estado vacío del preview. Para recursos con defaultPreview (el
// favicon y la imagen OpenGraph) se muestra la imagen de respaldo de Lemora;
// el resto mantiene el placeholder textual. El texto lo define cada recurso
// (`captionVacio`); si no, cae al texto genérico del favicon/logotipo.
function campoVacioHTML(r, caption) {
    const texto = caption || r.captionVacio || (r.defaultPreview
        ? 'Si no lo cambias, se usará el ícono de Lemora.'
        : 'Sin archivo<br><small>Se seguirá usando el logotipo actual.</small>');
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
            <span class="card-sub">Permite ajustar el tamaño del logotipo que aparece en la parte superior de la tienda. El ancho se ajusta automáticamente.</span>
            <div class="diseno-tamano">${opciones}</div>
        </div>`;
}

function campoFormatoCard(actual) {
    const valor = CARD_FORMATS.some((formato) => formato.valor === actual) ? actual : '1:1';
    const opciones = CARD_FORMATS.map((formato) => {
        const activo = formato.valor === valor;
        // 0057: la opción "Sin imágenes" no tiene relación de aspecto — su
        // preview es un bloque sin foto con el ícono tachado.
        const muestra = formato.aspecto
            ? `<span class="diseno-formato-muestra" style="aspect-ratio:${formato.aspecto};" aria-hidden="true"></span>`
            : `<span class="diseno-formato-muestra diseno-formato-muestra--sin-imagen" aria-hidden="true">
                <i class="fa-solid fa-image"></i>
                <i class="fa-solid fa-ban"></i>
               </span>`;
        return `
        <label class="diseno-formato-opcion ${activo ? 'activa' : ''}">
            <input type="radio" name="cardImageFormat" value="${esc(formato.valor)}" ${activo ? 'checked' : ''}>
            ${muestra}
            <span class="diseno-formato-nombre">${esc(formato.nombre)}<em>${esc(formato.desc)}</em></span>
        </label>`;
    }).join('');

    return `
        <div class="admin-field full">
            <label>Formato de las imágenes de los productos</label>
            <span class="card-sub" id="dsnFormatoSub">${esc(textoFormatoSub(valor))}</span>
            <div class="diseno-formatos">${opciones}</div>
        </div>`;
}

// Texto de ayuda del selector de formato. "Sin imágenes" avisa que las fotos
// quedan guardadas; el resto menciona dónde se aplica (productos o servicios
// según el modo de la tienda).
function textoFormatoSub(valor) {
    return valor === 'sin_imagenes'
        ? 'Si vuelves a activar las imágenes, las fotos anteriores seguirán disponibles.'
        : `Se aplica a los cards del catálogo, búsqueda y ${esTurnos ? 'servicios relacionados' : 'productos relacionados'}.`;
}

// Arma los eventos de subida / quita por recurso. Sin botón de guardado: al
// elegir un archivo se optimiza, se sube y se persiste; al quitar se confirma
// y se borra. Después de cada operación se refresca la sección.
function prepararCampoImagen(r, pathActual, contenedor) {
    estadoImagenes[r.recurso] = { actual: pathActual || '' };

    const bloque = document.querySelector(`[data-recurso="${esc(r.recurso)}"]`);
    if (!bloque) return;
    const preview = bloque.querySelector('[data-preview]');
    const archivoInput = bloque.querySelector('[data-archivo]');
    const quitarBtn = bloque.querySelector('[data-quitar]');

    archivoInput.addEventListener('change', async () => {
        const archivo = archivoInput.files[0];
        if (!archivo) return;
        let objetoUrl = '';
        try {
            const optimizado = await validarYOptimizarImagen(archivo, { maxLado: limiteImagen(r) });
            objetoUrl = URL.createObjectURL(optimizado);
            preview.innerHTML = `<img src="${objetoUrl}" alt="">`; // preview inmediato mientras sube
            await persistirImagen(r, optimizado);
            toast(r.toastOk);
            await refrescarSeccion(contenedor);
        } catch (error) {
            archivoInput.value = '';
            toast(error.message, 'error');
            await refrescarSeccion(contenedor); // vuelve al estado persistido
        } finally {
            if (objetoUrl) URL.revokeObjectURL(objetoUrl);
        }
    });

    if (quitarBtn) {
        quitarBtn.addEventListener('click', async () => {
            if (!(await confirmarBorrado(r.confirmarQuitar))) return;
            try {
                await persistirQuitaImagen(r);
                toast(r.toastQuitar);
                await refrescarSeccion(contenedor);
            } catch (error) {
                toast(error.message, 'error');
            }
        });
    }
}

// Refresca la sección tras un guardado, salvo que el usuario ya haya navegado
// a otra: en ese caso el contenedor tiene otro contenido y no se toca.
function refrescarSeccion(contenedor) {
    if (!contenedor.isConnected || !contenedor.querySelector('#marqueeGestor')) {
        return Promise.resolve();
    }
    return renderizar(contenedor).catch(() => {});
}

// Lado máximo de redimensión según el recurso (favicon y OG son más chicos).
function limiteImagen(r) {
    if (r.recurso === 'favicon') return LIMITES_IMAGEN.favicon;
    if (r.recurso === 'og') return LIMITES_IMAGEN.openGraph;
    return LIMITES_IMAGEN.branding;
}

// ---------- Persistencia ----------

// Guarda uno o más campos de `settings` (fila única id=1). Base del guardado
// automático de la sección.
async function persistirSettings(payload) {
    const sb = await clienteAdmin();
    const { error } = await sb.from('settings').update(payload).eq('id', 1);
    if (error) throw new Error(error.message);
}

// Auto-guardado de un ajuste puntual: persiste y avisa con un toast; si falla,
// muestra el error sin cortar la interacción.
function guardarAjuste(payload, mensaje) {
    return persistirSettings(payload)
        .then(() => { if (mensaje) toast(mensaje); })
        .catch((error) => toast(error.message, 'error'));
}

// Sube una imagen nueva, actualiza la referencia en `settings` y recién ahí
// borra el archivo anterior (así nunca se pierde el actual si algo falla).
async function persistirImagen(r, archivo) {
    const nuevoPath = await subirImagenAdmin('branding', r.carpeta, archivo);
    try {
        await persistirSettings({ [r.columna]: nuevoPath });
    } catch (error) {
        await eliminarImagenAdmin(nuevoPath); // no dejar huérfano en Storage
        throw error;
    }
    const anterior = estadoImagenes[r.recurso]?.actual;
    estadoImagenes[r.recurso] = { actual: nuevoPath };
    if (anterior) await eliminarImagenAdmin(anterior);
}

// Quita la imagen: limpia la referencia en `settings` y borra el archivo.
async function persistirQuitaImagen(r) {
    await persistirSettings({ [r.columna]: null });
    const anterior = estadoImagenes[r.recurso]?.actual;
    estadoImagenes[r.recurso] = { actual: '' };
    if (anterior) await eliminarImagenAdmin(anterior);
}