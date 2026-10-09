// Búsqueda de productos: una sola implementación para todos los breakpoints.
// El input es el de la barra del header en desktop y el del panel desplegable en
// móvil (donde la barra está oculta); ambos escriben en el mismo panel de
// resultados (#searchPanel), que se abre debajo del navbar.
import { obtenerProductos, generarHTMLFavoritoItem, normalizarTexto, cargarConfiguracionGlobal } from './utils.js';
import { suscribirRefrescoCatalogo } from './supabase.js';

let productos = [];
let debounceTimer;

document.addEventListener('DOMContentLoaded', async function() {
    // Los resultados marcan "Sin Stock" según el modo (venta/turnos): esperar
    // la configuración para que el modo llegue antes de renderizar.
    await cargarConfiguracionGlobal();
    // Cargar productos usando el sistema centralizado
    productos = await obtenerProductos();

    // Vincular inputs del buscador. El header se inyecta de forma asíncrona en
    // template.js, así que también esperamos el evento 'lemora:header-ready'.
    conectarBuscador();
    document.addEventListener('lemora:header-ready', function() {
        conectarBuscador();
    }, { once: true });

    // Clic fuera del panel: lo cierra sin tocar la consulta, para no perder lo
    // que el usuario escribió si vuelve a hacer clic en la barra.
    //
    // Las exclusiones importan: un clic en algo que NO sea el panel ni uno de
    // estos elementos lo cierra. Si faltara el ícono de móvil, el mismo toque
    // que abría el panel lo cerraba — su onclick inline se ejecuta en la fase
    // AT_TARGET, antes de que este listener de document corra en la de burbujeo
    // — y el buscador quedaba inalcanzable. En desktop el panel lo abre el
    // evento 'input' al escribir (no un clic), por eso nunca chocaba.
    document.addEventListener('click', function(e) {
        const panel = document.getElementById('searchPanel');
        if (!panel || !panel.classList.contains('open')) return;
        if (panel.contains(e.target)) return;
        if (e.target.closest('.header-search')) return;
        if (e.target.closest('[data-search-toggle]')) return;
        panel.classList.remove('open');
    });

    // Refresco automático: si hay una búsqueda activa, re-ejecutarla con datos
    // frescos (stock/imagen/precio) sin recargar.
    suscribirRefrescoCatalogo((datos) => {
        productos = datos;
        const activo = [...document.querySelectorAll('.search-input')].find(i => i.value.trim());
        if (activo) buscarProductos(activo.value.trim());
    });
});

// Vincular todos los inputs de búsqueda (idempotente por input).
function conectarBuscador() {
    const panel = document.getElementById('searchPanel');

    document.querySelectorAll('.search-input').forEach(function(searchInput) {
        if (searchInput.dataset.searchBound === '1') return;
        searchInput.dataset.searchBound = '1';

        // Búsqueda en tiempo real mientras se escribe
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.trim();

            // El panel se abre solo mientras haya texto: en desktop lo dispara
            // la barra, en móvil el input del panel (que ya lo abrió el ícono).
            if (panel) panel.classList.toggle('open', query.length > 0);

            // Realizar búsqueda con debounce para rendimiento
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => buscarProductos(query), 300);
        });

        // Limpiar al presionar ESC
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (window.cerrarBusqueda) window.cerrarBusqueda();
            }
        });
    });
}

// Función principal de búsqueda
function buscarProductos(query) {
    const resultados = document.getElementById('searchPanelResults');
    const count = document.getElementById('searchPanelCount');
    const vacio = document.getElementById('searchPanelEmpty');

    // Sin consulta no hay nada que mostrar.
    if (!query) {
        if (resultados) resultados.innerHTML = '';
        if (count) count.textContent = '';
        if (vacio) vacio.classList.remove('visible');
        return;
    }

    // Normalizar query (minúsculas, sin acentos)
    const queryNormalizado = normalizarTexto(query);

    // Filtrar productos por nombre, descripción o categoría
    const productosFiltrados = productos.filter(producto => {
        return normalizarTexto(producto.nombre).includes(queryNormalizado) ||
               normalizarTexto(producto.descripcion).includes(queryNormalizado) ||
               normalizarTexto(producto.categoria).includes(queryNormalizado);
    });

    if (resultados) {
        // Misma fila que la página de favoritos, sin los botones Ver/Eliminar.
        resultados.innerHTML = productosFiltrados
            .map(p => generarHTMLFavoritoItem(p, { conBadge: true })).join('');
    }
    if (count) {
        const plural = productosFiltrados.length === 1 ? 'producto' : 'productos';
        count.textContent = productosFiltrados.length > 0
            ? `${productosFiltrados.length} ${plural} ${productosFiltrados.length === 1 ? 'encontrado' : 'encontrados'}`
            : '';
    }
    if (vacio) vacio.classList.toggle('visible', productosFiltrados.length === 0);
}

// Limpiar búsqueda: vacía los inputs y el panel. Lo llama el `×` (a través de
// cerrarBusqueda en template.js).
function limpiarBusqueda() {
    document.querySelectorAll('.search-input').forEach(input => {
        input.value = '';
    });

    const panel = document.getElementById('searchPanel');
    if (panel) panel.classList.remove('open');

    const resultados = document.getElementById('searchPanelResults');
    if (resultados) resultados.innerHTML = '';

    const count = document.getElementById('searchPanelCount');
    if (count) count.textContent = '';

    const vacio = document.getElementById('searchPanelEmpty');
    if (vacio) vacio.classList.remove('visible');
}

// Exponer para el botón "Ver todos los productos" u otros módulos
window.limpiarBusqueda = limpiarBusqueda;
