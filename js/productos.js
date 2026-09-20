// productos.js
import { obtenerProductos, generarHTMLTarjetaProducto, agregarAlCarritoBase } from './utils.js';

let productos = [];

// Función para cargar productos desde el JSON
async function cargarProductos() {
    productos = await obtenerProductos();
    renderizarProductos();
}

// Renderizar productos
function renderizarProductos() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    grid.innerHTML = productos.map(p => generarHTMLTarjetaProducto(p)).join('');
}

// Agregar al carrito
function agregarAlCarrito(id) {
    agregarAlCarritoBase(id, productos);
}

// Exponer a window para que funcione con onclick en módulos
window.agregarAlCarrito = agregarAlCarrito;

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', cargarProductos);
