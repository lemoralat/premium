// favoritos.js

import { obtenerProductos, generarHTMLFavoritoItem, mostrarNotificacion, formatearPrecio } from './utils.js';
import { suscribirRefrescoCatalogo } from './supabase.js';

let allProducts = []; // Para almacenar todos los productos una vez cargados

document.addEventListener('DOMContentLoaded', async () => {
    // Cargar todos los productos disponibles
    allProducts = await obtenerProductos();
    // Renderizar la lista de favoritos
    renderizarFavoritos();
    // Refresco automático (opción A): favoritos al día sin recargar.
    suscribirRefrescoCatalogo((datos) => {
        allProducts = datos;
        renderizarFavoritos();
    });
});

// Obtener la lista de IDs de productos favoritos desde localStorage
function obtenerFavoritos() {
    return JSON.parse(localStorage.getItem('favorites')) || [];
}

// Renderizar los productos favoritos en la página
function renderizarFavoritos() {
    const favoritosContainer = document.getElementById('favoritosList');
    if (!favoritosContainer) {
        console.error('Contenedor de favoritos no encontrado: #favoritosList');
        return;
    }

    const favoriteIds = obtenerFavoritos();

    if (favoriteIds.length === 0) {
        // Mostrar mensaje de carrito vacío si no hay favoritos
        favoritosContainer.innerHTML = `
            <div class="favoritos-empty">
                <i class="fa-regular fa-heart"></i>
                <h2>Aún no tienes productos favoritos</h2>
                <p>Agrega los productos que más te gusten para verlos aquí.</p>
                <a href="index.html" class="shop-btn btn-border">Explorar productos</a>
            </div>
        `;
        return;
    }

    // Filtrar los productos completos basándose en los IDs favoritos
    const favoriteProducts = allProducts.filter(p => favoriteIds.includes(p.id));

    if (favoriteProducts.length === 0 && favoriteIds.length > 0) {
        // Esto podría ocurrir si los productos favoritos ya no existen en el catálogo
        favoritosContainer.innerHTML = `
            <div class="favoritos-empty">
                <i class="fa-regular fa-heart"></i>
                <h2>No se encontraron tus productos favoritos</h2>
                <p>Parece que los productos que marcaste como favoritos ya no están disponibles.</p>
                <a href="index.html" class="shop-btn btn-border">Explorar productos</a>
            </div>
        `;
        return;
    }

    // Generar el HTML para cada producto favorito
    // (V-2: nombre, imagen y categoría son contenido administrado → se escapan
    // dentro de generarHTMLFavoritoItem)
    favoritosContainer.innerHTML = favoriteProducts
        .map(p => generarHTMLFavoritoItem(p, { conAcciones: true })).join('');
}

// Función para eliminar un producto de favoritos (expuesta globalmente para onclick)
window.eliminarDeFavoritos = function(id) {
    let favoritos = obtenerFavoritos();
    favoritos = favoritos.filter(favId => favId !== id);
    localStorage.setItem('favorites', JSON.stringify(favoritos));
    mostrarNotificacion('Producto eliminado de favoritos');
    renderizarFavoritos(); // Volver a renderizar la lista
    if (typeof window.actualizarContadorFavoritosGlobal === 'function') {
        window.actualizarContadorFavoritosGlobal(); // Actualizar contador del nav
    }
};

// Exponer formatearPrecio para que esté disponible en el template si es necesario
// (ya viene importado arriba; el window es lo único que lo publica).
window.formatearPrecio = formatearPrecio;