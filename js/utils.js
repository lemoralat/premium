// utils.js

// Capa de datos: Supabase como fuente de verdad. Cada cargador de supabase.js
// devuelve { ok, datos }. Con Supabase caído, las secciones quedan vacías,
// ocultas o con su contenido estático por defecto; no hay datos alternativos.
import {
    cargarProductos, cargarCupones, cargarResenas, cargarSlider, cargarBanners, cargarConfiguracion, cargarIconosPie, cargarPreguntasFrecuentes, cargarMarquee, cargarTurnosOcupados, urlImagen
} from './supabase.js';

// Configuración de descuentos (se refresca desde Supabase settings)
export const CONFIG_DESCUENTO = {
    UMBRAL: 100000, // Monto mínimo para aplicar descuento (ej. $100.000)
    PORCENTAJE: 10  // Porcentaje de descuento (ej. 10%)
};

// Compra mínima (menú Descuentos → Compra mínima): regla por cantidad de
// productos y/o por monto, AMBAS acumulables. Cada valor 0 = esa regla queda
// desactivada. Sin la migración 0023 (columnas ausentes) queda todo en 0.
export const CONFIG_COMPRA_MINIMA = {
    cantidad: 0,
    monto: 0
};

// Cupones manuales válidos
export let CONFIG_CUPONES = {};

// Configuración de WhatsApp centralizada.
// Número VACÍO = WhatsApp deshabilitado: la plantilla no trae número de Lemora;
// los botones/enlaces de WhatsApp se ocultan en toda la tienda.
export const WHATSAPP_CONFIG = {
    number: '',
    defaultMessage: 'Hola, quería consultar '
};

// Configuración general de la tienda (branding, contacto, redes, transferencia).
// Se completa con la fila "settings" de Supabase cuando está disponible.
export const CONFIG_APP = {
    siteName: 'Mi Tienda Online',
    // Descripción del negocio (Configuración → Datos generales). El default es
    // el texto genérico que las metas tenían hardcodeado, así que sin la
    // migración 0033 el sitio queda igual. La aplica template.js → aplicarDisenoGlobal().
    siteDescription: 'Tienda online con los mejores productos. Envíos a todo el país.',
    // Tipo de web (Configuración → Tipo de web, migración 0051): 'venta'
    // (tienda con carrito/checkout a través de WhatsApp) o 'turnos' (agenda:
    // la tienda y el carrito funcionan igual, pero el paso final del checkout
    // se reemplaza por el formulario de solicitud de turno, que registra los
    // ítems del carrito en public.turnos). Default 'venta': sin la migración,
    // nada cambia.
    modoWeb: 'venta',
    whatsappNumber: '',
    whatsappMessage: 'Hola, quería consultar ',
    transferAlias: '',
    transferEntity: '',
    transferHolder: '',
    // Cuadro "Próximos Pasos" de gracias.html (Configuración → Datos para la
    // transferencia). Los defaults son el texto que la página mostraba siempre,
    // así que sin la migración 0032 la página queda igual. Vacíos = sin título /
    // cuadro oculto (ver gracias.js).
    graciasTitulo: 'Próximos Pasos',
    graciasTexto: 'Te confirmaremos por WhatsApp cuando recibamos tu transferencia bancaria. Una vez confirmado el pago, procederemos con el envío de tu pedido.',
    emailContact: '',
    address: '',
    socialInstagram: '',
    socialFacebook: '',
    socialTiktok: '',
    socialYoutube: '',
    socialX: '',
    socialPinterest: '',
    socialLinkedin: '',
    socialWhatsapp: '',
    socialOtra: '',
    // Popup de salida (Configuración → Popup de salida). Defaults del contenido
    // que la tienda mostró siempre; el popup arranca DESACTIVADO (0055) y solo
    // se muestra si el dueño lo activa explícitamente en el panel.
    popupTitulo: '¿Te vas tan pronto?',
    popupDescripcion: 'Antes de irte: envíos a todo el país y ofertas en la tienda. ¿Quieres echar un vistazo?',
    popupCta: 'Ver productos',
    popupCtaUrl: '/#tienda',
    popupActivo: false,
    // Marquee promocional (sección "Diseño" del panel). Conservadores: antes de
    // la migración 0017 (columna ausente) la barra queda oculta.
    marqueeActivo: false,
    marqueeColorFondo: '#000000'
};

export let configuracionCargada = false;

// ¿El sitio está en modo turnos? (Configuración → Tipo de web). La usan las
// páginas del catálogo, el carrito, el formulario y la página de gracias.
export function esModoTurnos() {
    return CONFIG_APP.modoWeb === 'turnos';
}

// Configuración de diseño (sección "Diseño" del panel): branding aplicado en
// template.js al cargar cada página. Si no hay configurado un recurso, la
// tienda sigue usando los recursos disponibles y el color/bordes actuales.
export const CONFIG_DISENO = {
    logoUrl: '',            // URL pública del logotipo (vacío ⇒ logo por defecto)
    logoTamano: 'small',     // small | medium | large → height 40/60/80px en .logo
    faviconUrl: '',         // URL pública del favicon (vacío ⇒ favicon por defecto)
    ogImageUrl: '',         // URL pública de la imagen OpenGraph (vacío ⇒ por defecto)
    cardImageFormat: '1:1', // 1:1 | 3:2 | 4:5 para los cards de catálogo
    colorPrincipal: '#000000',
    estiloBordes: 'redondeado' // redondeado | circular | recto
};

// Un número que venga de la BD vale siempre, incluido el 0. Por eso no se
// puede usar `||` para el default: `Number(0) || 100000` devuelve 100000.
//
// Con los defaults de arriba (umbral 100000, 10%) eso rompía el descuento
// automático en dos direcciones:
//   - El admin ponía 0 para desactivarlo y el `||` lo descartaba: la tienda
//     mostraba 10% en todo pedido ≥ $100.000 y el servidor —que sí respeta el
//     0— cobraba el total completo. Precio mostrado ≠ precio cobrado.
//   - El 0 en la hoja original significaba "sin descuento"; en Postgres es un
//     número, y `||` siguió tratándolo como "no configurado".
//
// Sólo caemos al default cuando la columna no vino (migración no aplicada) o
// cuando el valor no es un número.
function numeroOVacio(valor, porDefecto) {
    if (valor === null || valor === undefined || valor === '') return porDefecto;
    const n = Number(valor);
    return Number.isFinite(n) ? n : porDefecto;
}

// Aplicar la configuración remota (settings) sobre CONFIG_APP / WHATSAPP_CONFIG / CONFIG_DESCUENTO.
// Llamar una vez al inicio (template.js) y antes de calcular totales (formulario).
export async function cargarConfiguracionGlobal() {
    try {
        const r = await cargarConfiguracion();
        if (r.ok && r.datos) {
            const c = r.datos;
            CONFIG_APP.siteName = c.site_name ?? CONFIG_APP.siteName;
            CONFIG_APP.siteDescription = c.site_description ?? CONFIG_APP.siteDescription;
            CONFIG_APP.modoWeb = c.modo_web === 'turnos' ? 'turnos' : 'venta';
            // El número de WhatsApp es SOLO dígitos: se sanitiza al cargar para
            // que ningún valor guardado con caracteres raros (comillas, <, &) pueda
            // romper el markup donde se interpola (template.js) ni la URL de wa.me.
            // La escritura en `settings` ya es admin-only; esto es defensa en
            // profundidad y neutraliza también valores ya contaminados en la base.
            WHATSAPP_CONFIG.number = String(c.whatsapp_number ?? WHATSAPP_CONFIG.number).replace(/\D/g, '');
            WHATSAPP_CONFIG.defaultMessage = c.whatsapp_default_message ?? WHATSAPP_CONFIG.defaultMessage;
            CONFIG_APP.whatsappNumber = WHATSAPP_CONFIG.number;
            CONFIG_APP.whatsappMessage = WHATSAPP_CONFIG.defaultMessage;
            CONFIG_DESCUENTO.UMBRAL = numeroOVacio(c.discount_threshold, CONFIG_DESCUENTO.UMBRAL);
            CONFIG_DESCUENTO.PORCENTAJE = numeroOVacio(c.discount_percent, CONFIG_DESCUENTO.PORCENTAJE);
            // Compra mínima (menú Descuentos → Compra mínima): cantidad de
            // productos y monto, ambas reglas acumulables. 0 = regla inactiva.
            CONFIG_COMPRA_MINIMA.cantidad = Math.max(0, Math.floor(Number(c.compra_minima_cantidad) || 0));
            CONFIG_COMPRA_MINIMA.monto = Math.max(0, Number(c.compra_minima_monto) || 0);
            CONFIG_APP.transferAlias = c.transfer_alias ?? CONFIG_APP.transferAlias;
            CONFIG_APP.transferEntity = c.transfer_entity ?? CONFIG_APP.transferEntity;
            CONFIG_APP.transferHolder = c.transfer_holder ?? CONFIG_APP.transferHolder;
            // Cuadro de próximos pasos de gracias.html. Sin la migración 0032 la
            // columna no viene y `??` deja los defaults de arriba.
            CONFIG_APP.graciasTitulo = c.gracias_titulo ?? CONFIG_APP.graciasTitulo;
            CONFIG_APP.graciasTexto = c.gracias_texto ?? CONFIG_APP.graciasTexto;
            CONFIG_APP.emailContact = c.email_contact || '';
            CONFIG_APP.address = c.address || '';
            CONFIG_APP.socialInstagram = c.social_instagram || '';
            CONFIG_APP.socialFacebook = c.social_facebook || '';
            CONFIG_APP.socialTiktok = c.social_tiktok || '';
            CONFIG_APP.socialYoutube = c.social_youtube || '';
            CONFIG_APP.socialX = c.social_x || '';
            CONFIG_APP.socialPinterest = c.social_pinterest || '';
            CONFIG_APP.socialLinkedin = c.social_linkedin || '';
            CONFIG_APP.socialWhatsapp = c.social_whatsapp || '';
            CONFIG_APP.socialOtra = c.social_otra || '';

            // Popup de salida (Configuración → Popup de salida). `=== true`:
            // default apagado (0055), solo un valor explícito enciende el
            // popup — mismo criterio conservador que marqueeActivo.
            CONFIG_APP.popupTitulo = c.popup_titulo || CONFIG_APP.popupTitulo;
            CONFIG_APP.popupDescripcion = c.popup_descripcion || CONFIG_APP.popupDescripcion;
            CONFIG_APP.popupCta = c.popup_cta || CONFIG_APP.popupCta;
            CONFIG_APP.popupCtaUrl = c.popup_cta_url || CONFIG_APP.popupCtaUrl;
            CONFIG_APP.popupActivo = c.popup_activo === true;

            // Marquee (sección "Diseño" del panel). `=== true`: sin la
            // migración 0017 la columna no existe → barra oculta.
            CONFIG_APP.marqueeActivo = c.marquee_activo === true;
            if (/^#[0-9a-fA-F]{6}$/.test(c.marquee_color_fondo || '')) {
                CONFIG_APP.marqueeColorFondo = c.marquee_color_fondo.toLowerCase();
            }

            // Diseño (sección "Diseño" del panel)
            CONFIG_DISENO.logoUrl = c.logo_path ? urlImagen({ storage_path: c.logo_path }) : '';
            // Tamaño del logotipo (sección Diseño). `includes`: sin la
            // migración 0018 la columna no existe → queda 'small'.
            if (['small', 'medium', 'large'].includes(c.logo_tamano)) {
                CONFIG_DISENO.logoTamano = c.logo_tamano;
            }
            CONFIG_DISENO.faviconUrl = c.favicon_path ? urlImagen({ storage_path: c.favicon_path }) : '';
            CONFIG_DISENO.ogImageUrl = c.og_image_path ? urlImagen({ storage_path: c.og_image_path }) : '';
            // 0057 agrega 'sin_imagenes' (cards sin foto, sin galería y sin
            // subida en el formulario del panel).
            if (['1:1', '3:2', '4:5', 'sin_imagenes'].includes(c.card_image_format)) {
                CONFIG_DISENO.cardImageFormat = c.card_image_format;
            }
            if (/^#[0-9a-fA-F]{6}$/.test(c.color_principal || '')) {
                CONFIG_DISENO.colorPrincipal = c.color_principal.toLowerCase();
            }
            if (['redondeado', 'circular', 'recto'].includes(c.estilo_bordes)) {
                CONFIG_DISENO.estiloBordes = c.estilo_bordes;
            }

            configuracionCargada = true;
        }
    } catch (error) {
        console.warn('No se pudo aplicar la configuración remota:', error);
    }
}

// Nombre del sitio (configurable desde supabase settings)
export function obtenerNombreSitio() {
    return CONFIG_APP.siteName;
}

// Construir URL de WhatsApp con el número centralizado.
// Sin número configurado devuelve '' para que el llamador decida (ocultar/abortar).
export function obtenerUrlWhatsApp(mensaje = '') {
    if (!WHATSAPP_CONFIG.number) return '';
    return `https://wa.me/${WHATSAPP_CONFIG.number}?text=${encodeURIComponent(mensaje)}`;
}

// Calcular subtotales, descuentos y totales
export function calcularTotales(cart, codigoCupon = null) {
    const subtotal = cart.reduce((sum, item) => sum + (item.precio * item.quantity), 0);
    let descuentoAuto = 0;

    if (subtotal >= CONFIG_DESCUENTO.UMBRAL) {
        descuentoAuto = subtotal * (CONFIG_DESCUENTO.PORCENTAJE / 100);
    }

    let descuentoCupon = 0;
    let porcentajeAplicado = CONFIG_DESCUENTO.PORCENTAJE;

    const cuponData = codigoCupon ? CONFIG_CUPONES[codigoCupon.toUpperCase()] : null;

    if (cuponData) {
        const hoy = new Date();
        const fechaExp = new Date(cuponData.expira);

        // Solo aplicar si no ha expirado (comparando solo fechas a medianoche local)
        if (hoy.setHours(0, 0, 0, 0) <= fechaExp.setHours(0, 0, 0, 0)) {
            const porcentajeCupon = cuponData.porcentaje;
            descuentoCupon = subtotal * (porcentajeCupon / 100);
            porcentajeAplicado = porcentajeCupon;
        }
    }

    // Aplicamos el mayor de los dos descuentos (no acumulables)
    const descuentoFinal = Math.max(descuentoAuto, descuentoCupon);
    const total = subtotal - descuentoFinal;

    return {
        subtotal,
        descuento: descuentoFinal,
        total,
        esCupon: descuentoCupon > descuentoAuto,
        porcentaje: descuentoFinal > 0 ? (descuentoCupon > descuentoAuto ? porcentajeAplicado : CONFIG_DESCUENTO.PORCENTAJE) : 0
    };
}

// Estado de la compra mínima configurada en el panel (Descuentos → Compra
// mínima). Devuelve { cumple, mensaje }. Con modo 'off' o sin valor siempre
// cumple; si no, compara unidades totales del carrito (cantidad) o el subtotal
// (monto) contra el valor configurado.
export function estadoCompraMinima(cart) {
    const { cantidad, monto } = CONFIG_COMPRA_MINIMA;
    const lista = Array.isArray(cart) ? cart : [];

    const unidades = lista.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const subtotal = lista.reduce((sum, i) => sum + (Number(i.precio) * (Number(i.quantity) || 0)), 0);

    // Ambas reglas se evalúan (acumulables); 0 = regla inactiva.
    const faltaCantidad = cantidad > 0 && unidades < cantidad ? cantidad - unidades : 0;
    const faltaMonto = monto > 0 && subtotal < monto ? monto - subtotal : 0;

    if (!faltaCantidad && !faltaMonto) {
        return { cumple: true, mensaje: '' };
    }

    const exige = [];
    const faltan = [];
    if (faltaCantidad) {
        exige.push(`${formatearPrecio(cantidad)} ${cantidad === 1 ? 'producto' : 'productos'}`);
        faltan.push(`${faltaCantidad} ${faltaCantidad === 1 ? 'producto' : 'productos'}`);
    }
    if (faltaMonto) {
        exige.push(`$${formatearPrecio(monto)}`);
        faltan.push(`$${formatearPrecio(faltaMonto)}`);
    }
    return {
        cumple: false,
        mensaje: `La compra mínima es de ${exige.join(' y ')}. Te faltan ${faltan.join(' y ')} para completarla.`
    };
}

// Transformar lista [{codigo, porcentaje, expira}] → objeto por código (MAYÚSCULAS)
function transformarCupones(cuponesArray) {
    const transformado = {};
    cuponesArray.forEach(c => {
        if (c.codigo && c.porcentaje != null) {
            transformado[c.codigo.toUpperCase().trim()] = {
                porcentaje: parseInt(c.porcentaje),
                expira: c.expira // Formato YYYY-MM-DD
            };
        }
    });
    return transformado;
}

// ================= PRODUCTOS =================
export async function obtenerProductos() {
    const remoto = await cargarProductos();
    if (remoto.ok) return remoto.datos;
    // Sin Supabase: catálogo vacío (el resto de la web sigue funcionando).
    mostrarNotificacion('No pudimos cargar el catálogo. Por favor, recarga la página.', 'error');
    return [];
}

// ================= CUPONES =================
export async function obtenerCupones() {
    // Los cupones y la configuración de descuentos deben estar sincronizados
    await cargarConfiguracionGlobal();

    const remoto = await cargarCupones();
    if (remoto.ok) {
        CONFIG_CUPONES = transformarCupones(remoto.datos);
    }
    return CONFIG_CUPONES; // Sin Supabase: sin cupones (default {})
}

// ================= RESEÑAS =================
export async function obtenerResenas() {
    const remoto = await cargarResenas();
    if (remoto.ok) return remoto.datos;
    return null; // Sin Supabase: el carrusel usa las reseñas estáticas
}

// ================= SLIDER =================
export async function obtenerSlider() {
    const remoto = await cargarSlider();
    if (remoto.ok) return remoto.datos;
    return null; // Sin Supabase: el hero usa su fallback estático
}

// Escapa texto administrado antes de interpolarlo en HTML
export function escaparHtml(texto) {
    return String(texto ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// Solo deja URLs navegables en hrefs administrados: http(s), mailto, tel y
// rutas locales (absolutas, relativas o anclas). Bloquea `javascript:`, `data:`
// y cualquier otro esquema peligroso. Devuelve '' si la URL no es segura.
export function urlSegura(url) {
    const u = String(url ?? '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (u.startsWith('/') || u.startsWith('./') || u.startsWith('../') || u.startsWith('#')) return u;
    return '';
}

// Convierte texto libre (ej. nombre de categoría) en un slug seguro para usar
// como fragmento de URL o id de sección: sin acentos, sin caracteres peligrosos.
export function slugificar(texto) {
    const slug = String(texto ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'seccion';
}

// ================= BANNERS =================
// Cargar banners dinámicos. [] => la web no renderiza secciones de banners.
export async function obtenerBanners() {
    const remoto = await cargarBanners();
    if (remoto.ok) return remoto.datos;
    return null; // Sin Supabase: sin banners
}

// ================= ICONOS DEL PIE =================
export async function obtenerIconosPie() {
    const remoto = await cargarIconosPie();
    if (remoto.ok) return remoto.datos;
    return null; // Sin Supabase: la sección usa los iconos estáticos
}

// ================= PREGUNTAS FRECUENTES =================
// Devuelve { datos, total } cuando hay Supabase, o null si está caído.
//   - datos: preguntas activas (lo que se muestra).
//   - total: filas totales (incluye ocultas) vía RPC. Con total = 0 la tabla
//            está vacía y faq.html muestra un estado vacío neutro.
export async function obtenerPreguntasFrecuentes() {
    const remoto = await cargarPreguntasFrecuentes();
    if (remoto.ok) {
        return {
            datos: remoto.datos,
            total: remoto.total
        };
    }
    // Sin contenido de respaldo en el HTML a propósito: la FAQ es contenido
    // administrado y no debe vivir en el repositorio. Si Supabase está caído,
    // preguntas-frecuentes.js oculta la sección.
    return null;
}

// ================= MARQUEE =================
// Devuelve los textos activos del marquee (repetidos en la barra). Sin ítems o
// con Supabase caído devuelve [] → la barra queda oculta (nada hardcodeado).
export async function obtenerMarquee() {
    const remoto = await cargarMarquee();
    if (remoto.ok) return remoto.datos;
    return [];
}

// Comportamiento de enlace de banners/sliders:
// "interno" (default) → misma pestaña (_self); "externo" → nueva pestaña (_blank).
// Devuelve los atributos listos para interpolar en un <a> (target + rel noopener).
// ================= TURNOS OCUPADOS (modo turnos, 0054) =================
// Horarios ya tomados (turno Confirmado/Realizado) para que la solicitud de
// turno no los ofrezca. Consulta la RPC pública turnos_ocupados; si falla se
// degrada a agenda sin filtro (insertar_turno valida igual en el servidor).
export async function obtenerTurnosOcupados(desde = '', hasta = '') {
    const remoto = await cargarTurnosOcupados(desde, hasta);
    if (remoto.ok) return remoto.datos;
    return [];
}

export function atributosEnlace(entidad) {
    const externo = (entidad && entidad.target === 'externo') ? true : false;
    return externo ? 'target="_blank" rel="noopener"' : 'target="_self"';
}

// Banner "solo imagen": tiene imagen y ningún otro contenido publicado
// (sin logo, badge, título ni botón). Se renderiza a ancho completo con cover.
export function esBannerSoloImagen(banner) {
    return Boolean(
        banner &&
        banner.imagen &&
        !banner.logo &&
        !banner.badge &&
        !banner.titulo &&
        !banner.boton
    );
}

// Precio anterior tachado: solo si es válido y mayor al precio actual
export function renderPrecioAnterior(producto) {
    const pa = producto.precioAnterior;
    return (pa && pa > producto.precio)
        ? `<span class="precio-anterior">$${formatearPrecio(pa)}</span>`
        : '';
}

// ¿El producto tiene variantes seleccionables? (opción + al menos un valor)
// En modo turnos nunca: los productos se gestionan como servicios sin variantes
// (migración 0053+), aunque algún producto histórico conserve opciones en la BD.
export function tieneVariantes(producto) {
    if (esModoTurnos()) return false;
    return Array.isArray(producto.variantes)
        && producto.variantes.some(v => v && v.opcion && Array.isArray(v.valores) && v.valores.length > 0);
}

// Clave única de línea de carrito: mismo producto + misma variante se agrupan;
// mismo producto con variante distinta quedan en líneas separadas.
export function claveItemCarrito(id, varianteTexto = '') {
    return `${id}||${varianteTexto || ''}`;
}

// Bloque neutro para productos sin imagen en la tienda pública.
export function placeholderImagenPublica(clase = 'product-image') {
    return `<div class="${escaparHtml(clase)} public-image-placeholder" role="img" aria-label="Sin imagen"></div>`;
}

// Fila de producto con el diseño de la página de favoritos: miniatura cuadrada a
// la izquierda y, a la derecha, nombre, categoría y precio.
//
// Es la única fuente de ese markup. La usan los dos lugares que comparten el
// diseño y por eso se ven igual por construcción, no por casualidad:
//   - favoritos.js  → { conAcciones: true }  (los botones Ver / Eliminar)
//   - busqueda.js   → { conBadge: true }     (el badge de Sin Stock)
export function generarHTMLFavoritoItem(producto, opciones = {}) {
    const { conAcciones = false, conBadge = false } = opciones;
    // En modo turnos los servicios no manejan stock: nunca muestran "Sin Stock".
    const esAgotado = !esModoTurnos() && producto.stock === 0;
    const nombre = escaparHtml(recortarTexto(producto.nombre));
    const imagen = escaparHtml(producto.imagen);

    return `
        <div class="favorito-item${conBadge && esAgotado ? ' out-of-stock' : ''}">
            <div class="favorito-media">
                ${producto.imagen
                    ? `<img src="${imagen}" alt="${nombre}" class="favorito-imagen" loading="lazy">`
                    : placeholderImagenPublica('favorito-imagen')}
                ${conBadge && esAgotado ? '<span class="out-of-stock-badge">Sin Stock</span>' : ''}
            </div>
            <div class="favorito-info">
                <a href="/producto?id=${producto.id}" class="favorito-nombre">${nombre}</a>
                <p class="favorito-categoria">${escaparHtml(producto.categoria)}</p>
                <p class="favorito-precio">${renderPrecioAnterior(producto)}$${formatearPrecio(producto.precio)}</p>
            </div>
            ${conAcciones ? `
            <div class="favorito-acciones">
                <a href="/producto?id=${producto.id}" class="favorito-ver-btn btn-border">
                    <i class="fa-solid fa-eye"></i> Ver
                </a>
                <button class="favorito-eliminar-btn btn-border" onclick="eliminarDeFavoritos(${producto.id})">
                    <i class="fa-solid fa-trash-can"></i> Eliminar
                </button>
            </div>` : ''}
        </div>
    `;
}

// Generar el HTML de una tarjeta de producto (estándar para el catálogo y los
// relacionados). Toda la tarjeta enlaza al detalle.
//
// En modo turnos (Configuración → Tipo de web) la tarjeta es IGUAL que en
// venta: precio, precio anterior y agregado rápido. El modo no cambia la
// tienda — solo el paso final del carrito (ver carrito.js/formulario.js). Los
// servicios no manejan stock ni variantes: nunca se tacha con "Sin Stock". Si
// el servicio declara horarios (0053), se muestran como guía bajo el precio.
export function generarHTMLTarjetaProducto(producto) {
    const esAgotado = !esModoTurnos() && producto.stock === 0;
    const conHorarios = Array.isArray(producto.servicioHorarios) && producto.servicioHorarios.length > 0;

    // V-2: todo texto/URL administrado se escapa antes de interpolarse en HTML.
    const nombre = escaparHtml(recortarTexto(producto.nombre));
    const descripcion = escaparHtml(recortarTexto(producto.descripcion));
    const imagen = escaparHtml(producto.imagen);

    return `
        <a href="/producto?id=${producto.id}" class="product-card product-link ${esAgotado ? 'out-of-stock' : ''}" aria-label="Ver detalle de ${nombre}">
            ${esAgotado ? '<span class="out-of-stock-badge">Sin Stock</span>' : ''}
            <div class="product-image-wrapper">
                ${producto.imagen
                    ? `<img src="${imagen}" alt="${nombre}" class="product-image" loading="lazy">`
                    : placeholderImagenPublica('product-image')}
                <span class="quick-add-btn" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>
            </div>
            <div class="product-info">
                <h3 class="product-title">${nombre}</h3>
                <p class="product-description">${descripcion}</p>
                <p class="product-price">${renderPrecioAnterior(producto)}$${formatearPrecio(producto.precio)}</p>
                ${conHorarios ? '<p class="product-price product-schedule-hint"><i class="fa-solid fa-calendar-check"></i> Horarios disponibles</p>' : ''}
            </div>
        </a>
    `;
}

// Lógica compartida para agregar productos al carrito
export function agregarAlCarritoBase(id, listaProductos) {
    const producto = listaProductos.find(p => p.id === id);
    if (!producto) return;

    // Productos con variantes se eligen en la página de detalle
    if (tieneVariantes(producto)) {
        window.location.href = `/producto?id=${id}`;
        return;
    }

    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const existingItem = cart.find(item => item.id === id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...producto, quantity: 1 });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    if (window.actualizarContadorCarrito) window.actualizarContadorCarrito();
    mostrarNotificacion('Producto agregado al carrito');
}

// Formatear precio
export function formatearPrecio(precio) {
    return precio.toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

// Muestra el texto completo, sin límite de caracteres (se mantiene la función
// por compatibilidad con todos sus llamadores).
export function recortarTexto(texto) {
    return String(texto ?? '');
}

// ( acá estaba imagenOptimizada(), que añadía el sufijo "-rw" a las URLs de
// lh3.googleusercontent.com para que el CDN de Google Drive entregara WebP.
// Se fue con el resto del andamiaje de Drive: hoy las imágenes salen de
// Supabase Storage y el admin las sube desde el panel, así que no hay URLs
// que reescribir. Los 12 call sites quedaron usando la URL tal cual. )

// Mostrar notificación
export function mostrarNotificacion(mensaje, tipo = 'success') {
    const notif = document.createElement('div');
    notif.textContent = mensaje;
    notif.className = `notificacion-toast ${tipo === 'error' ? 'error' : ''}`;

    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notif.remove(), 300);
    }, 2000);
}

// Normalizar texto (quitar acentos y convertir a minúsculas)
export function normalizarTexto(texto) {
    if (!texto) return '';
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}