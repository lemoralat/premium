// Renderizar productos por categorías en el index
import { obtenerProductos, generarHTMLTarjetaProducto, agregarAlCarritoBase, obtenerBanners, escaparHtml, urlSegura, esBannerSoloImagen, recortarTexto, imagenOptimizada, atributosEnlace, slugificar, placeholderImagenPublica } from './utils.js';
import { suscribirRefrescoCatalogo } from './supabase.js';

let productos = [];
let banners = []; // dinámicos (hoja "Banners"); se refrescan junto con los productos

document.addEventListener('DOMContentLoaded', async () => {
    // Cargar productos usando el sistema centralizado con caché
    productos = await obtenerProductos();

    if (productos.length > 0) {
        // Banners dinámicos desde la hoja "Banners"; sin datos o error => sin banners
        const bs = await obtenerBanners();
        banners = Array.isArray(bs) ? bs : [];
        renderizarCategoriasAutomaticas(banners);

        // Scroll al hash si se viene desde otra página (ej: index.html#cat-calzado)
        if (window.location.hash) {
            const target = document.querySelector(window.location.hash);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }

        // Refresco automático (opción A): stock/precio/imágenes al día sin recargar.
        suscribirRefrescoCatalogo(actualizarCatalogo);
    }
});

// Re-renderiza la tienda con datos frescos (solo llega acá si cambió algo visible).
async function actualizarCatalogo(nuevosProductos) {
    productos = nuevosProductos;
    const bs = await obtenerBanners();
    banners = Array.isArray(bs) ? bs : banners;
    renderizarCategoriasAutomaticas(banners);
}

function renderizarCategoriasAutomaticas(banners) {
    const container = document.getElementById('tienda');
    if (!container) return;

    // Productos destacados: van primero en el home, mezclando categorías.
    const destacados = productos.filter(p => p.destacado === true);

    // El resto se agrupa por categoría (los destacados no se repiten en su categoría).
    const restantes = destacados.length > 0
        ? productos.filter(p => p.destacado !== true)
        : productos;

    // Extraer categorías únicas de los productos no destacados
    const categorias = [...new Set(restantes.map(p => p.categoria))].filter(Boolean);

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

    // Si hay destacados: grilla al inicio (sin título) y el banner 1 justo después.
    if (destacados.length > 0) {
        htmlFinal += `
            <section class="category-section">
                <div class="products-grid">
                    ${destacados.map(p => generarHTMLTarjetaProducto(p)).join('')}
                </div>
            </section>
        `;
        emitirSiguienteBloque();
    }

    categorias.forEach((categoria, index) => {
        const productosFiltrados = restantes.filter(p => p.categoria === categoria);
        if (productosFiltrados.length === 0) return;

        // Agregar la sección de productos de la categoría
        // (id slugificado: coincide con los links del submenú del header)
        htmlFinal += `
            <section class="category-section" id="cat-${slugificar(categoria)}">
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
    // V-3: urlSegura bloquea esquemas peligrosos (javascript:, data:, vbscript:…)
    // en el href administrado; si no es navegable, no se renderiza el enlace.
    const link = banner.link ? escaparHtml(urlSegura(banner.link)) : '';
    const etiqueta = link ? `aria-label="${escaparHtml(banner.titulo || 'Banner')}" ` : '';
    const visual = img
        ? `<div class="banner-solo-imagen banner-border" style="background-image:url('${img}')">${link ? `<a href="${link}" ${atributosEnlace(banner)} ${etiqueta}></a>` : ''}</div>`
        : `<div class="banner-solo-imagen banner-border sin-imagen">${link ? `<a href="${link}" ${atributosEnlace(banner)} ${etiqueta}></a>` : ''}</div>`;

    return `
        <section class="banner-intercalado">
            ${visual}
        </section>
    `;
}

// Misma estructura visual que los banners estáticos de la plantilla.
// Reglas: badge vacío => sin h4 · botón solo con texto Y link · logo vacío => sin bloque de ícono.
function generarHTMLBannerDinamico(banner) {
    const titulo = escaparHtml(banner.titulo);
    // V-3: urlSegura bloquea esquemas peligrosos en el href administrado.
    const link = banner.link ? escaparHtml(urlSegura(banner.link)) : '';
    const tieneBoton = Boolean(banner.boton && link);
    const imagenVisual = banner.imagen
        ? `<img loading="lazy" src="${escaparHtml(imagenOptimizada(banner.imagen))}" alt="${titulo}" width="1200" height="400">`
        : placeholderImagenPublica('banner-image-placeholder');

    return `
        <section class="banner-intercalado">
            <div class="banner banner-border">
                <div class="banner_imagen">
                    ${link ? `<a href="${link}" ${atributosEnlace(banner)}>` : ''}
                        ${imagenVisual}
                    ${link ? '</a>' : ''}
                </div>

                <div class="banner_info">
                    ${banner.logo ? `
                    <div class="banner_info_icono banner-border">
                        <img loading="lazy" src="${escaparHtml(imagenOptimizada(banner.logo))}" alt="" class="block" width="60">
                    </div>
                    ` : ''}

                    <div class="banner_info_copy">
                        ${banner.badge ? `<span>${escaparHtml(recortarTexto(banner.badge))}</span>` : ''}
                        <h2>${escaparHtml(recortarTexto(banner.titulo))}</h2>
                        ${tieneBoton ? `<a href="${link}" ${atributosEnlace(banner)}>${escaparHtml(recortarTexto(banner.boton))} <i class="fa-solid fa-chevron-right"></i></a>` : ''}
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