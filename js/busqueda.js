// Sistema de búsqueda de productos en tiempo real - Compatible con categorías
import { obtenerProductos, generarHTMLTarjetaProducto, normalizarTexto } from './utils.js';

let productos = [];
let debounceTimer;

document.addEventListener('DOMContentLoaded', async function() {
    // Cargar productos usando el sistema centralizado
    productos = await obtenerProductos();

    // Vincular inputs del buscador. El header se inyecta de forma asíncrona en
    // template.js, así que también esperamos el evento 'lemora:header-ready'.
    conectarBuscador();
    document.addEventListener('lemora:header-ready', conectarBuscador, { once: true });
});

// Vincular todos los inputs de búsqueda (idempotente por input).
function conectarBuscador() {
    let hayInputs = false;

    document.querySelectorAll('.search-input').forEach(function(searchInput) {
        if (searchInput.dataset.searchBound === '1') return;
        searchInput.dataset.searchBound = '1';
        hayInputs = true;

        // Mostrar/ocultar botón de limpiar según haya o no texto
        const clearButton = searchInput
            .closest('.search-container')
            ?.querySelector('.clear-search');

        // Búsqueda en tiempo real mientras se escribe
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.trim();

            if (clearButton) {
                if (query.length > 0) {
                    clearButton.classList.add('visible');
                } else {
                    clearButton.classList.remove('visible');
                }
            }

            // Realizar búsqueda con debounce para rendimiento
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => buscarProductos(query), 300);
        });

        // Limpiar al presionar ESC
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                limpiarBusqueda();
            }
        });
    });

    // Botones de limpiar (desktop y móvil)
    document.querySelectorAll('.clear-search').forEach(btn => {
        if (btn.dataset.searchBound === '1') return;
        btn.dataset.searchBound = '1';
        btn.addEventListener('click', limpiarBusqueda);
    });

    return hayInputs;
}

// Función principal de búsqueda
function buscarProductos(query) {
    const grid = document.getElementById('productsGrid');
    const noResults = document.getElementById('noResults');
    const searchResults = document.getElementById('searchResults');
    const movilResultados = document.getElementById('mobileSearchResults');
    const movilCount = document.getElementById('mobileSearchCount');
    const movilVacío = document.getElementById('mobileSearchEmpty');

    // Si no hay búsqueda, volver al estado normal
    if (!query || query.length === 0) {
        if (grid && noResults) {
            document.body.classList.remove('searching');
            noResults.classList.remove('visible');
        }
        if (searchResults) searchResults.textContent = '';
        if (movilCount) movilCount.textContent = '';
        if (movilResultados) movilResultados.innerHTML = '';
        if (movilVacío) movilVacío.classList.remove('visible');
        return;
    }

    // Normalizar query (minúsculas, sin acentos)
    const queryNormalizado = normalizarTexto(query);

    // Filtrar productos
    const productosFiltrados = productos.filter(producto => {
        const nombreNormalizado = normalizarTexto(producto.nombre);
        const descripcionNormalizada = normalizarTexto(producto.descripcion);
        const categoriaNormalizada = normalizarTexto(producto.categoria);

        return nombreNormalizado.includes(queryNormalizado) ||
               descripcionNormalizada.includes(queryNormalizado) ||
               categoriaNormalizada.includes(queryNormalizado);
    });

    // Grid de la página de inicio (desktop / sección tienda)
    if (grid) {
        if (productosFiltrados.length > 0) {
            grid.innerHTML = productosFiltrados.map(p => generarHTMLTarjetaProducto(p)).join('');
            if (noResults) noResults.classList.remove('visible');
            if (searchResults) {
                const plural = productosFiltrados.length === 1 ? 'producto encontrado' : 'productos encontrados';
                searchResults.textContent = `${productosFiltrados.length} ${plural}`;
            }
        } else {
            grid.innerHTML = '';
            if (noResults) noResults.classList.add('visible');
            if (searchResults) searchResults.textContent = 'No se encontraron resultados';
        }
        document.body.classList.add('searching');
    }

    // Panel de búsqueda móvil (funciona en todas las páginas)
    if (movilResultados) {
        if (productosFiltrados.length > 0) {
            movilResultados.innerHTML = productosFiltrados
                .map(p => generarHTMLTarjetaProducto(p, { soloNombrePrecio: true })).join('');
            if (movilCount) {
                const plural = productosFiltrados.length === 1 ? 'producto' : 'productos';
                movilCount.textContent = `${productosFiltrados.length} ${plural} encontrados`;
            }
        } else {
            movilResultados.innerHTML = '';
            if (movilCount) movilCount.textContent = '';
        }
        if (movilVacío) movilVacío.classList.toggle('visible', productosFiltrados.length === 0);
    }
}

// Limpiar búsqueda
function limpiarBusqueda() {
    // Limpiar todos los inputs (desktop y panel móvil)
    document.querySelectorAll('.search-input').forEach(input => {
        input.value = '';
    });
    document.querySelectorAll('.clear-search').forEach(btn => {
        btn.classList.remove('visible');
    });

    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.textContent = '';

    const noResults = document.getElementById('noResults');
    if (noResults) noResults.classList.remove('visible');

    const movilResultados = document.getElementById('mobileSearchResults');
    if (movilResultados) movilResultados.innerHTML = '';

    const movilCount = document.getElementById('mobileSearchCount');
    if (movilCount) movilCount.textContent = '';

    const movilVacío = document.getElementById('mobileSearchEmpty');
    if (movilVacío) movilVacío.classList.remove('visible');

    // Volver a mostrar las secciones de categorías
    document.body.classList.remove('searching');

    // Hacer foco en el primer input visible (desktop; el del panel móvil se enfoca al abrirlo)
    const visibleInput = [...document.querySelectorAll('.search-input')]
        .find(input => input.offsetParent !== null && !input.closest('#mobileSearch'));
    if (visibleInput) visibleInput.focus();
}

// Exponer funciones globalmente
window.limpiarBusqueda = limpiarBusqueda;