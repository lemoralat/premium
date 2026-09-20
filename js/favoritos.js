// favoritos.js

import { obtenerProductos, generarHTMLTarjetaProducto, mostrarNotificacion, renderPrecioAnterior, imagenOptimizada } from './utils.js';

let allProducts = []; // Para almacenar todos los productos una vez cargados

document.addEventListener('DOMContentLoaded', async () => {
    // Cargar todos los productos disponibles
    allProducts = await obtenerProductos();
    // Renderizar la lista de favoritos
    renderizarFavoritos();
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
    favoritosContainer.innerHTML = favoriteProducts.map(p => `
        <div class="favorito-item">
            <img src="${imagenOptimizada(p.imagen)}" alt="${p.nombre}" class="favorito-imagen">
            <div class="favorito-info">
                <a href="producto.html?id=${p.id}" class="favorito-nombre">${p.nombre}</a>
                <p class="favorito-categoria">${p.categoria}</p>
                <p class="favorito-precio">${renderPrecioAnterior(p)}$${formatearPrecio(p.precio)}</p>
            </div>
            <div class="favorito-acciones">
                <a href="producto.html?id=${p.id}" class="favorito-ver-btn btn-border">
                    <i class="fa-solid fa-eye"></i> Ver
                </a>
                <button class="favorito-eliminar-btn btn-border" onclick="eliminarDeFavoritos(${p.id})">
                    <i class="fa-solid fa-trash-can"></i> Eliminar
                </button>
            </div>
        </div>
    `).join('');
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
import { formatearPrecio } from './utils.js';
window.formatearPrecio = formatearPrecio;