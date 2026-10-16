// categoria.js — Página individual de una categoría (categoria.html?slug=…).
//
// Plantilla compartida: la misma página sirve para cualquier categoría. Lee el
// slug de la URL, resuelve la categoría y renderiza su banner, la barra de
// ordenamiento y el listado de productos reutilizando las tarjetas y la
// cuadrícula que ya usa la tienda (generarHTMLTarjetaProducto / .products-grid).

import {
    obtenerProductos, obtenerCategorias, generarHTMLTarjetaProducto,
    urlSegura, cargarConfiguracionGlobal, esModoTurnos, obtenerNombreSitio
} from './utils.js';

const ORDEN_POR_DEFECTO = 'recientes';

let categoria = null;      // categoría activa de la URL
let productos = [];        // productos (ya filtrados y ordenados) de la categoría
let orden = ORDEN_POR_DEFECTO;

document.addEventListener('DOMContentLoaded', async () => {
    // El modo (venta / turnos) decide los textos: esperamos la configuración
    // remota antes de pintar, como el resto de las vistas de la tienda.
    await cargarConfiguracionGlobal();

    const slug = new URLSearchParams(window.location.search).get('slug') || '';
    const [categorias, todos] = await Promise.all([obtenerCategorias(), obtenerProductos()]);

    categoria = categorias.find((c) => c.slug === slug) || null;
    if (!categoria) {
        mostrarNoEncontrada();
        return;
    }

    // Título de la pestaña y breadcrumb.
    document.title = `${categoria.name} - ${obtenerNombreSitio()}`;
    const breadcrumbCategoria = document.getElementById('breadcrumbCategoria');
    if (breadcrumbCategoria) breadcrumbCategoria.textContent = categoria.name;
    const breadcrumbCatalogo = document.getElementById('breadcrumbCatalogo');
    if (breadcrumbCatalogo) breadcrumbCatalogo.textContent = esModoTurnos() ? 'Servicios' : 'Productos';

    renderizarBanner();

    // Los productos se agrupan por nombre de categoría (único en la base), igual
    // que en el inicio: la página comparte el mismo criterio, sin consultas extra.
    productos = todos.filter((p) => p.categoria === categoria.name);

    const grid = document.getElementById('categoryProducts');
    const vacio = document.getElementById('categoryEmpty');
    const toolbar = document.getElementById('categoryToolbar');

    if (productos.length === 0) {
        if (grid) grid.hidden = true;
        if (vacio) {
            vacio.hidden = false;
            vacio.textContent = esModoTurnos()
                ? 'Todavía no hay servicios en esta categoría.'
                : 'Todavía no hay productos en esta categoría.';
        }
        return;
    }

    if (toolbar) toolbar.hidden = false;
    const select = document.getElementById('categorySort');
    orden = select?.value || ORDEN_POR_DEFECTO;
    pintar();

    select?.addEventListener('change', () => {
        orden = select.value;
        pintar();
    });
});

// Banner: nombre centrado sobre la imagen de fondo configurable. Sin imagen, el
// fondo queda a cargo del CSS (color de marca) y no se aplica superposición.
function renderizarBanner() {
    const banner = document.getElementById('categoryBanner');
    const titulo = document.getElementById('categoryBannerTitle');
    if (titulo) titulo.textContent = categoria.name;

    const imagen = urlSegura(categoria.imagen);
    if (banner && imagen) {
        banner.style.backgroundImage = `url("${imagen}")`;
        banner.classList.add('category-banner--con-imagen');
    }
}

// Ordena una copia de la lista según el criterio del selector. "Más recientes"
// usa created_at (con el id como desempate estable) y el resto por precio/nombre.
function ordenar(lista, criterio) {
    const copia = [...lista];
    switch (criterio) {
        case 'precio-asc':
            return copia.sort((a, b) => a.precio - b.precio);
        case 'precio-desc':
            return copia.sort((a, b) => b.precio - a.precio);
        case 'nombre-az':
            return copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        case 'nombre-za':
            return copia.sort((a, b) => b.nombre.localeCompare(a.nombre, 'es', { sensitivity: 'base' }));
        case ORDEN_POR_DEFECTO:
        default:
            return copia.sort((a, b) => {
                const fa = a.createdAt ? Date.parse(a.createdAt) : 0;
                const fb = b.createdAt ? Date.parse(b.createdAt) : 0;
                return (fb - fa) || (b.id - a.id);
            });
    }
}

function pintar() {
    const grid = document.getElementById('categoryProducts');
    if (!grid) return;
    grid.innerHTML = ordenar(productos, orden).map((p) => generarHTMLTarjetaProducto(p)).join('');
}

// Slug inexistente o categoría desactivada: estado vacío con vuelta al catálogo.
function mostrarNoEncontrada() {
    const titulo = document.getElementById('categoryBannerTitle');
    if (titulo) titulo.textContent = 'Categoría';
    document.title = `Categoría - ${obtenerNombreSitio()}`;

    const toolbar = document.getElementById('categoryToolbar');
    if (toolbar) toolbar.hidden = true;
    const grid = document.getElementById('categoryProducts');
    if (grid) grid.hidden = true;

    const vacio = document.getElementById('categoryEmpty');
    if (vacio) {
        vacio.hidden = false;
        vacio.innerHTML = 'No encontramos esta categoría. <a href="/#tienda">Ver todo el catálogo</a>.';
    }
}
