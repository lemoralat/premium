// Template dinámico para Header y Footer

import { WHATSAPP_CONFIG, obtenerProductos, obtenerNombreSitio, formatearPrecio, calcularTotales, escaparHtml, claveItemCarrito, mostrarNotificacion, imagenOptimizada } from './utils.js';

// Renderizar Header
function renderHeader(activePage = '', categorias = []) {
    const header = document.createElement('div');
    header.className = 'header-wrapper';

    // Generar HTML del submenú de categorías
    const submenuHTML = categorias.length > 0 ? `
        <ul class="submenu">
            ${categorias.map(cat => `
                <li><a href="index.html#cat-${cat.toLowerCase().replace(/\s+/g, '-')}">${cat}</a></li>
            `).join('')}
        </ul>
    ` : '';

    header.innerHTML = `
        <div class="redes">
            <div class="contenedor">
                <a href="https://www.facebook.com/p/" target="_blank" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>
                <a href="https://www.instagram.com/" target="_blank" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
                <a href="https://www.tiktok.com/@" target="_blank" aria-label="TikTok"><i class="fa-brands fa-tiktok"></i></a>
            </div>
        </div>
        <nav class="navbar" aria-label="Menú principal">
            <div class="nav-container contenedor">
                <!--
                <a href="index.html" class="logo">Mi Tienda</a>
                -->
                <a href="index.html" class="logo-link">
                    <img src="img/logo.svg" alt="Logo de la tienda" class="logo">
                </a>

                <div class="header-actions-mobile">
                    <button type="button" class="header-icon" onclick="toggleBusquedaMovil()" aria-label="Buscar productos">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </button>
                    <a href="favoritos.html" class="header-icon" aria-label="Mis favoritos">
                        <i class="fa-solid fa-heart"></i>
                        <span class="favorites-count">0</span>
                    </a>
                    <button type="button" class="header-icon" onclick="abrirCarritoSidemenu()" aria-label="Abrir carrito de compras">
                        <i class="fa-solid fa-cart-shopping"></i>
                        <span class="cart-count">0</span>
                    </button>
                </div>

                <button class="menu-toggle" aria-label="Abrir menú de navegación">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
                
                <div class="nav-menu">
                    <button type="button" class="nav-menu-close" aria-label="Cerrar menú">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <a href="index.html" class="nav-link ${activePage === 'inicio' ? 'active' : ''}">Inicio</a>
                    <div class="nav-item-dropdown">
                        <a href="index.html#tienda" class="nav-link ${activePage === 'productos' ? 'active' : ''}">Productos <i class="fa-solid fa-chevron-down"></i></a>
                        ${submenuHTML}
                    </div>
                    <!-- <a href="nosotros.html" class="nav-link ${activePage === 'nosotros' ? 'active' : ''}">Nosotros</a> -->
                    <a href="faq.html" class="nav-link ${activePage === 'faq' ? 'active' : ''}">Preguntas</a> 
                    <!-- <a href="index.html#contacto" class="nav-link ${activePage === 'contacto' ? 'active' : ''}">Contacto</a>-->
                    <a href="contacto.html" class="nav-link ${activePage === 'contacto' ? 'active' : ''}">Contacto</a> 
                    <button type="button" class="nav-link search-link" aria-label="Buscar productos" onclick="toggleBusquedaMovil()">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <span class="nav-label">Buscar</span>
                    </button>
                    <a href="favoritos.html" class="nav-link favorites-link ${activePage === 'favoritos' ? 'active' : ''}" aria-label="Mis Favoritos">
                        <i class="fa-solid fa-heart"></i>
                        <span class="nav-label">Favoritos</span>
                        <span class="favorites-count">0</span>
                    </a>
                    <button type="button" class="nav-link cart-link ${activePage === 'carrito' ? 'active' : ''}" aria-label="Abrir carrito de compras" onclick="abrirCarritoSidemenu()">
                        <i class="fa-solid fa-cart-shopping"></i>
                        <span class="nav-label">Carrito</span>
                        <span class="cart-count">0</span>
                    </button>
                </div>
            </div>

            <div class="search-sidemenu-overlay" id="searchSidemenuOverlay" onclick="cerrarBusquedaMovil()"></div>
            <div class="mobile-search" id="mobileSearch">
                <div class="search-sidemenu-header">
                    <span class="search-sidemenu-title"><i class="fa-solid fa-magnifying-glass"></i></span>
                    <input type="search" class="search-input search-side-input" placeholder="¿Qué estás buscando?"
                        aria-label="¿Qué estás buscando?" autocomplete="off">
                    <button type="button" class="search-sidemenu-close" onclick="cerrarBusquedaMovil()" aria-label="Cerrar búsqueda">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="search-container">
                    <input type="search" class="search-input" placeholder="¿Qué estás buscando?"
                        aria-label="¿Qué estás buscando?">
                    <button class="search-close" onclick="cerrarBusquedaMovil()" aria-label="Cerrar búsqueda">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="mobile-results-count" id="mobileSearchCount"></div>
                <div class="mobile-results" id="mobileSearchResults"></div>
                <div class="mobile-results-empty" id="mobileSearchEmpty">No se encontraron resultados</div>
            </div>
        </nav>
    `;
    return header;
}

// Renderizar Footer
function renderFooter() {
    const footer = document.createElement('footer');
    footer.innerHTML = `
        <p>&copy; ${new Date().getFullYear()} ${obtenerNombreSitio()}. Todos los derechos reservados. Hecho con <i class="fa-solid fa-heart footer-heart"></i> por <a href="https://lemora.lat" target="_blank"><img src="img/lemora.svg" alt="Diseño y Desarrollo por Lemora" class="devBy"></a></p>
        `;

    return footer;
}

/*
// Función para inicializar el Marquee (integrada para evitar conflictos de orden)
function initMarquee() {
    const textos = [
        '🔥 ¡20% OFF en toda la tienda con el código PROMO20!',
        '🚚 Envío gratis en compras mayores a $100.000',
        '⭐ Nuevos productos disponibles — ¡Descubrí las novedades!'
    ];

    const marqueeBar = document.createElement('div');
    marqueeBar.className = 'marquee-bar';

    const marqueeTrack = document.createElement('div');
    marqueeTrack.className = 'marquee-track';

    const contenido = textos.map(t => `<span class="marquee-item">${t}</span>`).join('');
    marqueeTrack.innerHTML = contenido + contenido; // Duplicado para loop infinito

    marqueeBar.appendChild(marqueeTrack);
    return marqueeBar;
}
*/

// Inicializar template
async function initTemplate(activePage = '') {
    const body = document.body;

    // Obtener categorías dinámicas
    let categorias = [];
    try {
        const productos = await obtenerProductos();
        categorias = [...new Set(productos.map(p => p.categoria))].filter(Boolean);
        productosRef = productos;
    } catch (e) { console.error("Error cargando categorías para el menú", e); }

    // 1. Insertar Marquee (desactivado)
    // const marquee = initMarquee();
    // body.insertBefore(marquee, body.firstChild);

    // 2. Insertar Header (primero, ya que el marquee está desactivado)
    const header = renderHeader(activePage, categorias);
    body.insertBefore(header, body.firstChild);
    // Avisar a módulos (ej. búsqueda) de que el header ya está en el DOM
    document.dispatchEvent(new CustomEvent('lemora:header-ready'));

    // Insertar footer al final del body
    const footer = renderFooter();
    body.appendChild(footer);

    // WhatsApp flotante (posición fija, independiente del footer)
    const whatsapp = document.createElement('div');
    whatsapp.className = 'whatsapp';
    whatsapp.innerHTML = `
        <a href="https://wa.me/${WHATSAPP_CONFIG.number}?text=${encodeURIComponent(WHATSAPP_CONFIG.defaultMessage)}" 
           target="_blank" 
           rel="noopener" 
           aria-label="Contactar por WhatsApp">
            <i class="fa-brands fa-whatsapp"></i>
        </a>
    `;
    body.appendChild(whatsapp);

    // 3. Sidemenu del carrito: panel deslizante desde la derecha
    body.appendChild(crearEstructuraSidemenu());
    const sidemenu = document.getElementById('cartSidemenu');
    if (sidemenu) {
        sidemenu.addEventListener('click', function (e) {
            if (e.target.closest('[data-cerrar-sidemenu]')) {
                cerrarCarritoSidemenu();
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sidemenu.classList.contains('active')) {
                cerrarCarritoSidemenu();
            }
            const searchPanel = document.getElementById('mobileSearch');
            if (e.key === 'Escape' && searchPanel && searchPanel.classList.contains('open')) {
                cerrarBusquedaMovil();
            }
        });
    }
}

// Actualizar contador de favoritos en el nav
function actualizarContadorFavoritosGlobal() {
    const favoritos = JSON.parse(localStorage.getItem('favorites')) || [];
    const contadores = document.querySelectorAll('.favorites-count');
    contadores.forEach(contador => {
        contador.textContent = favoritos.length;
        if (favoritos.length > 0) {
            contador.style.display = 'flex';
        } else {
            contador.style.display = 'none';
        }
    });
}

// Actualizar contador del carrito en el nav
function actualizarContadorCarrito() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const contadores = document.querySelectorAll('.cart-count');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    contadores.forEach(contador => {
        contador.textContent = totalItems;
        if (totalItems > 0) {
            contador.style.display = 'flex';
        } else {
            contador.style.display = 'none';
        }
    });
}

// ===================== Sidemenu del Carrito =====================
let productosRef = [];

function crearEstructuraSidemenu() {
    const overlay = document.createElement('div');
    overlay.className = 'cart-sidemenu-overlay';
    overlay.id = 'cartSidemenu';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Carrito de compras');
    overlay.innerHTML = `
        <div class="cart-sidemenu-backdrop" data-cerrar-sidemenu></div>
        <aside class="cart-sidemenu-panel">
            <div class="cart-sidemenu-header">
                <h2><i class="fa-solid fa-cart-shopping"></i> Tu Carrito</h2>
                <button type="button" class="cart-sidemenu-close" data-cerrar-sidemenu aria-label="Cerrar carrito">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="cart-sidemenu-items" id="cartSidemenuItems"></div>
            <div class="cart-sidemenu-footer" id="cartSidemenuFooter"></div>
        </aside>
    `;
    return overlay;
}

function renderSidemenuCarrito() {
    const contenedorItems = document.getElementById('cartSidemenuItems');
    const contenedorFooter = document.getElementById('cartSidemenuFooter');
    if (!contenedorItems || !contenedorFooter) return;

    const cart = JSON.parse(localStorage.getItem('cart')) || [];

    if (window.actualizarContadorCarrito) window.actualizarContadorCarrito();

    if (cart.length === 0) {
        contenedorItems.innerHTML = `
            <div class="side-cart-empty">
                <i class="fa-solid fa-cart-shopping"></i>
                <h3>Tu carrito está vacío</h3>
                <p>Agregá productos para comenzar tu compra</p>
                <a href="index.html" class="shop-btn btn-border">Ir a la tienda</a>
            </div>
        `;
        contenedorFooter.innerHTML = '';
        return;
    }

    const itemHTML = cart.map(item => {
        const ref = productosRef.find(p => p.id === item.id);
        const sinStock = ref && ref.stock === 0;
        const clave = claveItemCarrito(item.id, item.varianteTexto);
        const claveEscapada = escaparHtml(clave);

        return `
        <div class="side-cart-item${sinStock ? ' sin-stock' : ''}" data-clave="${claveEscapada}">
            <img src="${escaparHtml(imagenOptimizada(item.imagen))}" alt="${escaparHtml(item.nombre)}" class="item-image" loading="lazy">
            <div class="side-item-details">
                <h4 class="item-title">${escaparHtml(item.nombre)}</h4>
                ${item.varianteTexto ? `<p class="item-variant">${escaparHtml(item.varianteTexto)}</p>` : ''}
                ${sinStock ? `<p class="stock-alert stock-alert-danger">⚠️ Se agotó</p>` : ''}
                <p class="item-price">$${formatearPrecio(item.precio)}</p>
                <div class="side-item-controls">
                    <div class="quantity-controls">
                        <button type="button" class="qty-btn btn-border" onclick="sideCambiarCantidad(this.dataset.clave, -1)" data-clave="${claveEscapada}" aria-label="Disminuir cantidad" ${sinStock ? 'disabled' : ''}>-</button>
                        <span class="qty-display">${item.quantity}</span>
                        <button type="button" class="qty-btn btn-border" onclick="sideCambiarCantidad(this.dataset.clave, 1)" data-clave="${claveEscapada}" aria-label="Aumentar cantidad" ${sinStock ? 'disabled' : ''}>+</button>
                    </div>
                    <button type="button" class="side-remove-btn" onclick="sideEliminarItem(this.dataset.clave)" data-clave="${claveEscapada}" aria-label="Eliminar ${escaparHtml(item.nombre)}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');

    contenedorItems.innerHTML = itemHTML;

    const cupon = sessionStorage.getItem('appliedCoupon');
    const { subtotal, descuento, total } = calcularTotales(cart, cupon);

    contenedorFooter.innerHTML = `
        <div class="side-summary-row">
            <span>Subtotal</span>
            <span>$${formatearPrecio(subtotal)}</span>
        </div>
        ${descuento > 0 ? `
        <div class="side-summary-row">
            <span>Descuento</span>
            <span>−$${formatearPrecio(descuento)}</span>
        </div>` : ''}
        <div class="side-summary-row side-total-row">
            <span>Total</span>
            <span>$${formatearPrecio(total)}</span>
        </div>
        <a href="carrito.html" class="side-cart-checkout">
            Ir al carrito <i class="fa-solid fa-arrow-right"></i>
        </a>
        <button type="button" class="side-cart-continue" data-cerrar-sidemenu>Seguir comprando</button>
    `;
}

function sideCambiarCantidad(clave, cambio) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = cart.find(i => claveItemCarrito(i.id, i.varianteTexto) === clave);
    if (!item) return;

    if (cambio > 0) {
        const ref = productosRef.find(p => p.id === item.id);
        if (ref) {
            const enCarrito = cart
                .filter(i => i.id === item.id)
                .reduce((sum, i) => sum + i.quantity, 0);
            if (enCarrito + cambio > ref.stock) {
                mostrarNotificacion(`Límite de stock alcanzado (${ref.stock} disponibles)`);
                return;
            }
        }
    }

    item.quantity += cambio;
    if (item.quantity <= 0) {
        cart = cart.filter(i => claveItemCarrito(i.id, i.varianteTexto) !== clave);
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    if (window.actualizarContadorCarrito) window.actualizarContadorCarrito();
    renderSidemenuCarrito();
}

function sideEliminarItem(clave) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart = cart.filter(i => claveItemCarrito(i.id, i.varianteTexto) !== clave);
    localStorage.setItem('cart', JSON.stringify(cart));
    if (window.actualizarContadorCarrito) window.actualizarContadorCarrito();
    renderSidemenuCarrito();
}

function abrirCarritoSidemenu() {
    const overlay = document.getElementById('cartSidemenu');
    if (!overlay) return;
    // Si el buscador está abierto, lo cerramos primero
    if (window.cerrarBusquedaMovil) window.cerrarBusquedaMovil();
    renderSidemenuCarrito();
    overlay.classList.add('active');
    document.documentElement.classList.add('cart-sidemenu-locked');
    const closeBtn = overlay.querySelector('.cart-sidemenu-close');
    if (closeBtn) closeBtn.focus();
}

function cerrarCarritoSidemenu() {
    const overlay = document.getElementById('cartSidemenu');
    if (!overlay) return;
    overlay.classList.remove('active');
    document.documentElement.classList.remove('cart-sidemenu-locked');
}

// ===================== Búsqueda móvil (panel bajo el navbar) =====================
function toggleBusquedaMovil() {
    const panel = document.getElementById('mobileSearch');
    if (!panel) return;
    if (panel.classList.contains('open')) {
        cerrarBusquedaMovil();
        return;
    }
    // Abrir: si el carrito lateral estaba abierto, lo cerramos primero
    if (window.cerrarCarritoSidemenu) window.cerrarCarritoSidemenu();
    panel.classList.add('open');
    const overlay = document.getElementById('searchSidemenuOverlay');
    if (overlay) overlay.classList.add('active');
    if (window.matchMedia('(min-width: 769px)').matches) {
        document.documentElement.classList.add('search-sidemenu-locked');
    }
    const input = [...panel.querySelectorAll('.search-input')]
        .find(i => i.offsetParent !== null) || panel.querySelector('.search-input');
    if (input) input.focus();
}

function cerrarBusquedaMovil() {
    const panel = document.getElementById('mobileSearch');
    if (!panel) return;
    panel.classList.remove('open');
    const overlay = document.getElementById('searchSidemenuOverlay');
    if (overlay) overlay.classList.remove('active');
    document.documentElement.classList.remove('search-sidemenu-locked');
    if (window.limpiarBusqueda) window.limpiarBusqueda();
}

// Actualizar elementos de WhatsApp en el contenido de la página
function actualizarElementosWhatsApp() {
    const links = document.querySelectorAll('.wa-link');
    const numbers = document.querySelectorAll('.wa-number');
    
    const url = `https://wa.me/${WHATSAPP_CONFIG.number}?text=${encodeURIComponent(WHATSAPP_CONFIG.defaultMessage)}`;
    
    links.forEach(link => {
        link.href = url;
    });
    
    numbers.forEach(el => {
        // Se muestra el número con un formato simple para el usuario
        el.textContent = `+${WHATSAPP_CONFIG.number}`;
    });
}

// Auto-inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async function () {
    // Detectar página activa desde el atributo data-page del body
    const activePage = document.body.getAttribute('data-page') || '';
    await initTemplate(activePage);
    
    // Actualizar contador de favoritos
    actualizarContadorFavoritosGlobal();
    // Actualizar contador del carrito
    actualizarContadorCarrito();

    // Actualizar enlaces y textos de WhatsApp dinámicos
    actualizarElementosWhatsApp();

    // Hacer que la función de actualizar favoritos sea accesible para otros módulos
    // sin tener que duplicar el código en cada archivo.
    window.actualizarContadorFavoritosGlobal = actualizarContadorFavoritosGlobal;
    // Hacer que la función de actualizar carrito sea accesible para otros módulos
    window.actualizarContadorCarrito = actualizarContadorCarrito;
    // Funciones del sidemenu del carrito (usadas por eventos inline en el header y el panel)
    window.abrirCarritoSidemenu = abrirCarritoSidemenu;
    window.cerrarCarritoSidemenu = cerrarCarritoSidemenu;
    window.sideCambiarCantidad = sideCambiarCantidad;
    window.sideEliminarItem = sideEliminarItem;
    window.toggleBusquedaMovil = toggleBusquedaMovil;
    window.cerrarBusquedaMovil = cerrarBusquedaMovil;
});
