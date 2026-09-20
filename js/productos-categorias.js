// Renderizar productos por categorías en el index
import { obtenerProductos, generarHTMLTarjetaProducto, agregarAlCarritoBase, obtenerBanners, escaparHtml, esBannerSoloImagen, recortarTexto, imagenOptimizada } from './utils.js';

let productos = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Cargar productos usando el sistema centralizado con caché
    productos = await obtenerProductos();

    if (productos.length > 0) {
        // Banners dinámicos desde la hoja "Banners"; sin datos o error => sin banners
        const banners = await obtenerBanners();
        renderizarCategoriasAutomaticas(Array.isArray(banners) ? banners : []);

        // Scroll al hash si se viene desde otra página (ej: index.html#cat-calzado)
        if (window.location.hash) {
            const target = document.querySelector(window.location.hash);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }
});

function renderizarCategoriasAutomaticas(banners) {
    const container = document.getElementById('tienda');
    if (!container) return;

    // Extraer categorías únicas de los productos
    const categorias = [...new Set(productos.map(p => p.categoria))].filter(Boolean);

    // Todos menos el último (tope 4): el último banner de la hoja es el del carrito.
    const bannersIndex = banners.slice(0, Math.min(4, banners.length - 1));

    // Intercalar banners dinámicos entre las categorías (máx 4 en el index; el último banner va al carrito).
    // Todos los banners usan el mismo estilo (banner 1, ancho completo);
    // los "solo imagen" se renderizan a ancho completo con cover.
    const bloques = bannersIndex.map(banner => ({
        tipo: esBannerSoloImagen(banner) ? 'solo' : 'completo',
        banner
    }));

    let bloqueActual = 0;

    const emitirSiguienteBloque = () => {
        if (bloqueActual >= bloques.length) return;
        const bloque = bloques[bloqueActual++];
        htmlFinal += bloque.tipo === 'solo'
            ? generarHTMLBannerSoloImagen(bloque.banner)
            : generarHTMLBannerDinamico(bloque.banner);
    };

    let htmlFinal = '';

    categorias.forEach((categoria, index) => {
        const productosFiltrados = productos.filter(p => p.categoria === categoria);
        if (productosFiltrados.length === 0) return;

        // Agregar la sección de productos de la categoría
        htmlFinal += `
            <section class="category-section" id="cat-${categoria.toLowerCase().replace(/\s+/g, '-')}">
                <div class="products-grid">
                    ${productosFiltrados.map(p => generarHTMLTarjetaProducto(p)).join('')}
                </div>
            </section>
        `;

        // Bloque de banners después de cada categoría mientras haya disponibles
        emitirSiguienteBloque();
    });

    // Banners sobrantes al final (más banners que categorías)
    while (bloqueActual < bloques.length) {
        emitirSiguienteBloque();
    }

    container.innerHTML = htmlFinal;
}

// Banner "solo imagen": imagen a ancho completo como fondo con cover,
// mismo alto de banner (aspect-ratio 3:1). Con link => bloque clicable.
function generarHTMLBannerSoloImagen(banner) {
    const img = escaparHtml(imagenOptimizada(banner.imagen));
    const link = escaparHtml(banner.link || '');
    const etiqueta = banner.link ? `aria-label="${escaparHtml(banner.titulo || 'Banner')}" ` : '';

    return `
        <section class="banner-intercalado">
            <div class="banner-solo-imagen banner-border" style="background-image:url('${img}')">
                ${banner.link ? `<a href="${link}" target="_self" ${etiqueta}></a>` : ''}
            </div>
        </section>
    `;
}

// Misma estructura visual que los banners estáticos de la plantilla.
// Reglas: badge vacío => sin h4 · botón solo con texto Y link · logo vacío => sin bloque de ícono.
function generarHTMLBannerDinamico(banner) {
    const titulo = escaparHtml(banner.titulo);
    const link = escaparHtml(banner.link || '');
    const tieneBoton = Boolean(banner.boton && banner.link);

    return `
        <section class="banner-intercalado">
            <div class="banner banner-border">
                <div class="banner_imagen">
                    ${banner.link ? `<a href="${link}" target="_self">` : ''}
                        <img loading="lazy" src="${escaparHtml(imagenOptimizada(banner.imagen))}" alt="${titulo}" width="1200" height="400">
                    ${banner.link ? '</a>' : ''}
                </div>

                <div class="banner_info">
                    ${banner.logo ? `
                    <div class="banner_info_icono banner-border">
                        <img loading="lazy" src="${escaparHtml(imagenOptimizada(banner.logo))}" alt="" class="block" width="60">
                    </div>
                    ` : ''}

                    <div class="banner_info_copy">
                        ${banner.badge ? `<span>${escaparHtml(recortarTexto(banner.badge, 20))}</span>` : ''}
                        <h2>${escaparHtml(recortarTexto(banner.titulo, 100))}</h2>
                        ${tieneBoton ? `<a href="${link}" target="_self">${escaparHtml(recortarTexto(banner.boton, 15))} <i class="fa-solid fa-chevron-right"></i></a>` : ''}
                    </div>
                </div>
            </div>
        </section>
    `;
}

// Lógica para agregar al carrito desde las tarjetas de esta página
function agregarAlCarrito(id) {
    agregarAlCarritoBase(id, productos);
}

// Exponer a window para que funcione con onclick en módulos
window.agregarAlCarrito = agregarAlCarrito;