// utils.js

// Capa de datos: Supabase como fuente de verdad, con fallback a los JSON locales
// (modo dual controlado) para que la tienda siga funcionando si Supabase no
// está configurado o hay un corte de red.
import {
    cargarProductos, cargarCupones, cargarResenas, cargarSlider, cargarBanners, cargarConfiguracion
} from './supabase.js';

// Configuración de descuentos (se refresca desde Supabase settings)
export const CONFIG_DESCUENTO = {
    UMBRAL: 100000, // Monto mínimo para aplicar descuento (ej. $100.000)
    PORCENTAJE: 10  // Porcentaje de descuento (ej. 10%)
};

// Cupones manuales válidos
export let CONFIG_CUPONES = {};

// Configuración de WhatsApp centralizada
export const WHATSAPP_CONFIG = {
    number: '543515957014',
    defaultMessage: 'Hola, quería consultar '
};

// Configuración general de la tienda (branding, contacto, redes, transferencia).
// Se completa con la fila "settings" de Supabase cuando está disponible.
export const CONFIG_APP = {
    siteName: 'Mi Tienda Online',
    whatsappNumber: '543515957014',
    whatsappMessage: 'Hola, quería consultar ',
    transferAlias: 'hola.mundo.2023',
    transferEntity: 'Mercado Pago',
    transferHolder: 'Nombre completo',
    emailContact: '',
    address: '',
    socialFacebook: 'https://www.facebook.com/p/',
    socialInstagram: 'https://www.instagram.com/',
    socialTiktok: 'https://www.tiktok.com/@'
};

export let configuracionCargada = false;

// Aplicar la configuración remota (settings) sobre CONFIG_APP / WHATSAPP_CONFIG / CONFIG_DESCUENTO.
// Llamar una vez al inicio (template.js) y antes de calcular totales (formulario).
export async function cargarConfiguracionGlobal() {
    try {
        const r = await cargarConfiguracion();
        if (r.ok && r.datos) {
            const c = r.datos;
            CONFIG_APP.siteName = c.site_name || CONFIG_APP.siteName;
            WHATSAPP_CONFIG.number = c.whatsapp_number || WHATSAPP_CONFIG.number;
            WHATSAPP_CONFIG.defaultMessage = c.whatsapp_default_message || WHATSAPP_CONFIG.defaultMessage;
            CONFIG_APP.whatsappNumber = WHATSAPP_CONFIG.number;
            CONFIG_APP.whatsappMessage = WHATSAPP_CONFIG.defaultMessage;
            CONFIG_DESCUENTO.UMBRAL = Number(c.discount_threshold) || CONFIG_DESCUENTO.UMBRAL;
            CONFIG_DESCUENTO.PORCENTAJE = Number(c.discount_percent) || CONFIG_DESCUENTO.PORCENTAJE;
            CONFIG_APP.transferAlias = c.transfer_alias || CONFIG_APP.transferAlias;
            CONFIG_APP.transferEntity = c.transfer_entity || CONFIG_APP.transferEntity;
            CONFIG_APP.transferHolder = c.transfer_holder || CONFIG_APP.transferHolder;
            CONFIG_APP.emailContact = c.email_contact || '';
            CONFIG_APP.address = c.address || '';
            CONFIG_APP.socialFacebook = c.social_facebook || '';
            CONFIG_APP.socialInstagram = c.social_instagram || '';
            CONFIG_APP.socialTiktok = c.social_tiktok || '';
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

// Construir URL de WhatsApp con el número centralizado
export function obtenerUrlWhatsApp(mensaje = '') {
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
    if (remoto.ok) {
        return remoto.datos;
    }
    return productosDesdeJSON();
}

// Cargar productos desde JSON (fallback del mecanismo original con caché)
async function productosDesdeJSON() {
    const cachedData = sessionStorage.getItem('cache_productos');
    const cachedVersion = sessionStorage.getItem('cache_version');

    try {
        const headResponse = await fetch('js/productos.json', { method: 'HEAD' });
        const serverVersion = headResponse.headers.get('Last-Modified') || headResponse.headers.get('ETag');

        if (cachedData && cachedVersion === serverVersion) {
            return JSON.parse(cachedData);
        }

        const response = await fetch('js/productos.json');
        if (!response.ok) throw new Error('Error al cargar productos');
        const productos = await response.json();

        sessionStorage.setItem('cache_productos', JSON.stringify(productos));
        if (serverVersion) {
            sessionStorage.setItem('cache_version', serverVersion);
        }

        return productos;
    } catch (error) {
        if (cachedData) return JSON.parse(cachedData);
        mostrarNotificacion('No pudimos cargar el catálogo. Por favor, recarga la página.', 'error');
        return [];
    }
}

// ================= CUPONES =================
export async function obtenerCupones() {
    // Los cupones y la configuración de descuentos deben estar sincronizados
    await cargarConfiguracionGlobal();

    const remoto = await cargarCupones();
    if (remoto.ok) {
        CONFIG_CUPONES = transformarCupones(remoto.datos);
        return CONFIG_CUPONES;
    }
    return cuponesDesdeJSON();
}

// Cargar cupones desde JSON dinámico (fallback)
async function cuponesDesdeJSON() {
    const cachedData = sessionStorage.getItem('cache_cupones');
    const cachedVersion = sessionStorage.getItem('cache_cupones_version');

    try {
        const headResponse = await fetch('js/cupones.json', { method: 'HEAD' });
        const serverVersion = headResponse.headers.get('Last-Modified') || headResponse.headers.get('ETag');

        if (cachedData && cachedVersion === serverVersion) {
            CONFIG_CUPONES = JSON.parse(cachedData);
            return CONFIG_CUPONES;
        }

        const response = await fetch('js/cupones.json');
        if (!response.ok) throw new Error('Error al cargar cupones');
        const cuponesArray = await response.json();

        const transformado = transformarCupones(cuponesArray);
        CONFIG_CUPONES = transformado;
        sessionStorage.setItem('cache_cupones', JSON.stringify(transformado));
        if (serverVersion) sessionStorage.setItem('cache_cupones_version', serverVersion);

        return transformado;
    } catch (error) {
        if (cachedData) CONFIG_CUPONES = JSON.parse(cachedData);
        return CONFIG_CUPONES;
    }
}

// ================= RESEÑAS =================
export async function obtenerResenas() {
    const remoto = await cargarResenas();
    if (remoto.ok) {
        return remoto.datos;
    }
    return resenasDesdeJSON();
}

// Cargar reseñas desde JSON dinámico (fallback)
async function resenasDesdeJSON() {
    const cachedData = sessionStorage.getItem('cache_resenas');
    const cachedVersion = sessionStorage.getItem('cache_resenas_version');

    try {
        const headResponse = await fetch('js/resenas.json', { method: 'HEAD' });
        const serverVersion = headResponse.headers.get('Last-Modified') || headResponse.headers.get('ETag');

        if (cachedData && cachedVersion === serverVersion) {
            return JSON.parse(cachedData);
        }

        const response = await fetch('js/resenas.json');
        if (!response.ok) throw new Error('Error al cargar reseñas');
        const resenas = await response.json();

        sessionStorage.setItem('cache_resenas', JSON.stringify(resenas));
        if (serverVersion) sessionStorage.setItem('cache_resenas_version', serverVersion);

        return resenas;
    } catch (error) {
        if (cachedData) return JSON.parse(cachedData);
        return null; // Sin datos: el carrusel usa el fallback estático
    }
}

// ================= SLIDER =================
export async function obtenerSlider() {
    const remoto = await cargarSlider();
    if (remoto.ok) {
        return remoto.datos;
    }
    return sliderDesdeJSON();
}

// Cargar slides del hero desde JSON dinámico (fallback)
async function sliderDesdeJSON() {
    const cachedData = sessionStorage.getItem('cache_slider');
    const cachedVersion = sessionStorage.getItem('cache_slider_version');

    try {
        const headResponse = await fetch('js/slider.json', { method: 'HEAD' });
        const serverVersion = headResponse.headers.get('Last-Modified') || headResponse.headers.get('ETag');

        if (cachedData && cachedVersion === serverVersion) {
            return JSON.parse(cachedData);
        }

        const response = await fetch('js/slider.json');
        if (!response.ok) throw new Error('Error al cargar slider');
        const slides = await response.json();

        sessionStorage.setItem('cache_slider', JSON.stringify(slides));
        if (serverVersion) sessionStorage.setItem('cache_slider_version', serverVersion);

        return slides;
    } catch (error) {
        if (cachedData) return JSON.parse(cachedData);
        return null; // Sin datos: el slider usa el fallback estático
    }
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

// ================= BANNERS =================
// Cargar banners dinámicos. [] => la web no renderiza secciones de banners.
export async function obtenerBanners() {
    const remoto = await cargarBanners();
    if (remoto.ok) {
        return remoto.datos;
    }
    return bannersDesdeJSON();
}

async function bannersDesdeJSON() {
    const cachedData = sessionStorage.getItem('cache_banners');
    const cachedVersion = sessionStorage.getItem('cache_banners_version');

    try {
        const headResponse = await fetch('js/banners.json', { method: 'HEAD' });
        const serverVersion = headResponse.headers.get('Last-Modified') || headResponse.headers.get('ETag');

        if (cachedData && cachedVersion === serverVersion) {
            return JSON.parse(cachedData);
        }

        const response = await fetch('js/banners.json');
        if (!response.ok) throw new Error('Error al cargar banners');
        const banners = await response.json();

        sessionStorage.setItem('cache_banners', JSON.stringify(banners));
        if (serverVersion) sessionStorage.setItem('cache_banners_version', serverVersion);

        return banners;
    } catch (error) {
        if (cachedData) return JSON.parse(cachedData);
        return null;
    }
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
export function tieneVariantes(producto) {
    return Array.isArray(producto.variantes)
        && producto.variantes.some(v => v && v.opcion && Array.isArray(v.valores) && v.valores.length > 0);
}

// Clave única de línea de carrito: mismo producto + misma variante se agrupan;
// mismo producto con variante distinta quedan en líneas separadas.
export function claveItemCarrito(id, varianteTexto = '') {
    return `${id}||${varianteTexto || ''}`;
}

// Generar el HTML de una tarjeta de producto (estándar para toda la web)
// Toda la tarjeta enlaza al detalle; sin botones internos.
// Con la opción { soloNombrePrecio: true } se omiten la descripción y demás
// texto extra: el resultado es un card completo pero solo con nombre y precio
// (usado en los resultados del buscador).
export function generarHTMLTarjetaProducto(producto, opciones = {}) {
    const esAgotado = producto.stock === 0;
    const { soloNombrePrecio = false } = opciones;

    return `
        <a href="producto.html?id=${producto.id}" class="product-card product-link ${esAgotado ? 'out-of-stock' : ''}" aria-label="Ver detalle de ${producto.nombre}">
            ${esAgotado ? '<span class="out-of-stock-badge">Sin Stock</span>' : ''}
            <div class="product-image-wrapper">
                <img src="${imagenOptimizada(producto.imagen)}" alt="${producto.nombre}" class="product-image" loading="lazy">
                <span class="quick-add-btn" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>
            </div>
            <div class="product-info">
                <h3 class="product-title">${recortarTexto(producto.nombre)}</h3>
                ${soloNombrePrecio ? '' : `<p class="product-description">${recortarTexto(producto.descripcion, 100)}</p>`}
                <p class="product-price">${renderPrecioAnterior(producto)}$${formatearPrecio(producto.precio)}</p>
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
        window.location.href = `producto.html?id=${id}`;
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

// Recortar texto a un máximo de caracteres (con puntos suspensivos sin superar el máximo)
export function recortarTexto(texto, max = 60) {
    const t = String(texto ?? '');
    return t.length > max ? t.slice(0, max - 3).trimEnd() + '...' : t;
}

// Fuerza al CDN de Google a entregar WebP (sufijo "-rw") sin cambiar el tamaño pedido.
// Solo toca URLs de Drive (lh3.googleusercontent.com); deja intactas las rutas locales
// y las de Supabase Storage.
export function imagenOptimizada(url) {
    const u = String(url ?? '');
    if (!u.includes('lh3.googleusercontent.com')) return u;
    if (/-rw/.test(u)) return u;
    return /=[swh]\d+$/.test(u) ? `${u}-rw` : u;
}

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