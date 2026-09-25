// productos.js — Catálogo para la página de detalle de producto.
//
// El listado del inicio lo renderiza productos-categorias.js en #tienda, y los
// resultados de búsqueda viven en el panel del header (busqueda.js). Acá solo
// queda la carga de datos que necesitan los controles de la ficha.
import { obtenerProductos, agregarAlCarritoBase } from './utils.js';

let productos = [];

// Agregar al carrito
function agregarAlCarrito(id) {
    agregarAlCarritoBase(id, productos);
}

// Exponer a window para que funcione con onclick en módulos
window.agregarAlCarrito = agregarAlCarrito;

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    obtenerProductos().then(datos => { productos = datos; });
});
