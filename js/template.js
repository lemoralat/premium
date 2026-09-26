// Template dinámico para Header y Footer

import { WHATSAPP_CONFIG, CONFIG_APP, CONFIG_DISENO, obtenerProductos, obtenerNombreSitio, cargarConfiguracionGlobal, formatearPrecio, calcularTotales, escaparHtml, urlSegura, claveItemCarrito, mostrarNotificacion, imagenOptimizada, slugificar, obtenerMarquee, placeholderImagenPublica } from './utils.js';

const CARD_ASPECT_RATIOS = Object.freeze({
    '1:1': '1 / 1',
    '3:2': '3 / 2',
    '4:5': '4 / 5'
});

// Renderizar Header
function renderHeader(activePage = '', categorias = []) {
    const header = document.createElement('div');
    header.className = 'header-wrapper';

    // Generar HTML del submenú de categorías
    // V-2: el nombre de categoría es contenido administrado → escapar el texto
    // y slugificar el fragmento para que coincida con el id de las secciones.
    const submenuHTML = categorias.length > 0 ? `
        <ul class="submenu">
            ${categorias.map(cat => `
                <li><a href="index.html#cat-${slugificar(cat)}">${escaparHtml(cat)}</a></li>
            `).join('')}
        </ul>
    ` : '';

    // Logo del header: si hay logotipo subido (sección Diseño) se muestra la
    // imagen; si no, el nombre de la tienda (settings.site_name) como texto.
    const logoSitio = CONFIG_DISENO.logoUrl
        ? `<a href="index.html" class="logo-link">
                    <img src="${escaparHtml(CONFIG_DISENO.logoUrl)}" alt="${escaparHtml(obtenerNombreSitio())}" class="logo logo--${CONFIG_DISENO.logoTamano}">
                </a>`
        : `<a href="index.html" class="logo-link logo-text" title="${escaparHtml(obtenerNombreSitio())}">${escaparHtml(obtenerNombreSitio())}</a>`;

    // Redes sociales del header: se muestran solo las que tienen URL configurada
    // (Configuración → Redes sociales del dashboard).
    const REDES_HEADER = [
        { campo: 'socialInstagram', clase: 'fa-brands fa-instagram', label: 'Instagram' },
        { campo: 'socialFacebook', clase: 'fa-brands fa-facebook-f', label: 'Facebook' },
        { campo: 'socialTiktok', clase: 'fa-brands fa-tiktok', label: 'TikTok' },
        { campo: 'socialYoutube', clase: 'fa-brands fa-youtube', label: 'YouTube' },
        { campo: 'socialX', clase: 'fa-brands fa-x-twitter', label: 'X' },
        { campo: 'socialPinterest', clase: 'fa-brands fa-pinterest-p', label: 'Pinterest' },
        { campo: 'socialLinkedin', clase: 'fa-brands fa-linkedin-in', label: 'LinkedIn' },
        { campo: 'socialOtra', clase: 'fa-solid fa-globe', label: 'Otra' }
    ];
    // V-3: urlSegura bloquea esquemas peligrosos en las URLs de redes sociales
    // administradas; si no es navegable, el ícono no se renderiza.
    const redesHTML = REDES_HEADER.map((r) => {
        const url = urlSegura(CONFIG_APP[r.campo]);
        return url
            ? `<a href="${escaparHtml(url)}" target="_blank" aria-label="${r.label}" rel="noopener"><i class="${r.clase}"></i></a>`
            : '';
    }).join('');

    header.innerHTML = `
        <div class="redes">
            <div class="contenedor">
                ${redesHTML}
            </div>
        </div>
        <nav class="navbar" aria-label="Menú principal">
            <div class="nav-container contenedor">
                <!-- Logo + buscador en un mismo contenedor flex: el gap entre
                     ambos se define aquí (--space-sm) y no con márgenes sueltos. -->
                <div class="header-brand">
                    ${logoSitio}

                    <!-- Barra de búsqueda del header: solo desktop. No hay botón de
                         submit — los resultados salen en vivo en el panel desplegable
                         (#searchPanel), el mismo que usa el móvil. Es un div y no un
                         form justamente para que Enter no dispare un submit inexistente. -->
                    <div class="header-search" id="headerSearch" role="search">
                        <i class="fa-solid fa-magnifying-glass search-leading" aria-hidden="true"></i>
                        <input type="search" class="search-input" placeholder="¿Qué estás buscando?"
                            aria-label="¿Qué estás buscando?" autocomplete="off">
                    </div>
                </div>

                <div class="header-actions-mobile">
                    <!-- data-search-toggle: el clic-fuera de busqueda.js lo excluye
                         explícitamente. Es el ÚNICO punto de entrada al panel en
                         móvil, y sin la exclusión el mismo toque que abría el panel
                         lo cerraba: su onclick inline corre en la fase AT_TARGET,
                         antes de que el listener de document corra en la de
                         burbujeo, así que el panel se cerraba en el mismo toque. -->
                    <button type="button" class="header-icon" data-search-toggle onclick="toggleBusquedaMovil()" aria-label="Buscar productos">
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

            <!-- Panel de resultados: se despliega bajo el navbar en TODOS los
                 breakpoints. En desktop lo abre la barra de arriba (al escribir);
                 en móvil, donde la barra está oculta, lo abre el ícono de la lupa y
                 el panel trae su propio input. -->
            <div class="search-panel" id="searchPanel" aria-label="Resultados de búsqueda">
                <div class="search-panel-input">
                    <div class="search-container">
                        <input type="search" class="search-input" placeholder="¿Qué estás buscando?"
                            aria-label="¿Qué estás buscando?">
                        <button type="button" class="search-close" onclick="cerrarBusqueda()" aria-label="Cerrar búsqueda">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
                <div class="search-panel-count" id="searchPanelCount" aria-live="polite"></div>
                <div class="search-panel-results" id="searchPanelResults"></div>
                <div class="search-panel-empty" id="searchPanelEmpty">No se encontraron resultados</div>
            </div>
        </nav>
    `;
    return header;
}

// Renderizar Footer
function renderFooter() {
    const footer = document.createElement('footer');
    footer.innerHTML = `
        <p>&copy; ${new Date().getFullYear()} ${escaparHtml(obtenerNombreSitio())}. Todos los derechos reservados. Hecho con <i class="fa-solid fa-heart footer-heart"></i> por <a href="https://lemora.lat" target="_blank" rel="noopener"><img src="img/lemora.svg" alt="Diseño y Desarrollo por Lemora" class="devBy"></a></p>
        `;

    return footer;
}

// Barra superior animada (marquee promocional, sección "Diseño" del panel).
// Los textos vienen de la BD (marquee_items) y el color de fondo del settings.
function crearMarquee(textos = [], colorFondo = '#000000') {
    const marqueeBar = document.createElement('div');
    marqueeBar.className = 'marquee-bar';
    marqueeBar.style.backgroundColor = colorFondo;
    // z-index directo: la variable --z-marquee está comentada en el CSS.
    marqueeBar.style.zIndex = '1010';

    const marqueeTrack = document.createElement('div');
    marqueeTrack.className = 'marquee-track';

    // Contenido administrado → escapar. Se duplica para el scroll infinito.
    const contenido = textos.map(t => `<span class="marquee-item">${escaparHtml(t)}</span>`).join('');
    marqueeTrack.innerHTML = contenido + contenido;

    marqueeBar.appendChild(marqueeTrack);
    return marqueeBar;
}

// El marquee funciona con translateX(-50%): recorre la mitad del ancho del
// TRACK, no el de la barra. Si el contenido duplicado (2 copias) es más
// angosto que la barra (caso típico: un solo mensaje corto), la animación
// solo recorre una fracción del ancho. Se duplican los "sets" (un set =
// todos los mensajes una vez) hasta que el track mida >= 2× la barra; con
// un número PAR de sets, el -50% cae siempre en el límite de un set y el
// loop cierra sin salto visible.
function asegurarCoberturaMarquee(bar, textos) {
    const track = bar.querySelector('.marquee-track');
    const anchoBarra = bar.clientWidth;
    if (!anchoBarra || !textos || !textos.length) return;

    const anchoSet = track.scrollWidth / 2; // base: se arranca con 2 copias
    if (anchoSet >= anchoBarra) return;     // ya cubre el ancho completo

    let sets = Math.max(2, Math.ceil((2 * anchoBarra) / anchoSet));
    if (sets % 2 !== 0) sets += 1; // par → el -50% = set(s) exacto(s)

    const setHTML = textos.map(t => `<span class="marquee-item">${escaparHtml(t)}</span>`).join('');
    track.innerHTML = new Array(sets).fill(setHTML).join('');
}

// Aplicar branding configurable (sección "Diseño" del panel): color principal,
// estilo de bordes, favicon y metas OpenGraph/Twitter. Se ejecuta en cada carga.
function aplicarDisenoGlobal() {
    aplicarColoresMarca();

    // Estilo de bordes ("redondeado" es el por defecto: sin clase extra)
    document.body.classList.remove('diseno-circular', 'diseno-recto');
    if (CONFIG_DISENO.estiloBordes === 'circular') document.body.classList.add('diseno-circular');
    if (CONFIG_DISENO.estiloBordes === 'recto') document.body.classList.add('diseno-recto');

    // Formato de imágenes de los cards de catálogo.
    const aspectRatio = CARD_ASPECT_RATIOS[CONFIG_DISENO.cardImageFormat] || CARD_ASPECT_RATIOS['1:1'];
    document.documentElement.style.setProperty('--product-card-aspect-ratio', aspectRatio);

    // Favicon dinámico (todas las páginas usan template.js)
    if (CONFIG_DISENO.faviconUrl) {
        document.querySelectorAll('link[rel="icon"]').forEach((el) => {
            el.href = CONFIG_DISENO.faviconUrl;
            // El favicon por defecto es SVG; al cambiarlo se limpia el "type"
            // para que el navegador detecte el formato real (ej. PNG).
            el.removeAttribute('type');
        });
    }

    // OpenGraph / Twitter (best effort: los rastreadores pueden no ejecutar JS;
    // la meta estática queda como fallback)
    if (CONFIG_DISENO.ogImageUrl) {
        document.querySelector('meta[property="og:image"]')?.setAttribute('content', CONFIG_DISENO.ogImageUrl);
        document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', CONFIG_DISENO.ogImageUrl);
    }
    const nombreSitio = obtenerNombreSitio();
    // Reemplaza la marca en metas y título preservando los prefijos específicos
    // de página ("Contacto -", "Mis Favoritos -", "404 - ...").
    document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach((el) => {
        const contenido = el.getAttribute('content') || '';
        if (contenido.includes('Mi Tienda Online')) {
            el.setAttribute('content', contenido.replace('Mi Tienda Online', nombreSitio));
        }
    });
    if (document.title.includes('Mi Tienda Online')) {
        document.title = document.title.replace('Mi Tienda Online', nombreSitio);
    }
}

// Oscurece (o aclara con factor > 1) un color hex #RRGGBB.
function oscurecerHex(hex, factor) {
    if (!/^#([0-9a-f]{6})$/i.test(hex)) return hex;
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * factor);
    const g = Math.round(((n >> 8) & 255) * factor);
    const b = Math.round((n & 255) * factor);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Aplica el color de marca. La tienda es solo tema claro, así que ambos roles
// usan directamente el color de la BD con su hover oscurecido:
//  - --primary-solid / --primary-solid-hover: color ORIGINAL, para FONDOS
//    SÓLIDOS (botones, banner, redes, cart-count…), conservando el texto blanco
//    (--text-on-primary) siempre legible.
//  - --primary-color / --primary-hover: acento para links, textos y bordes.
function aplicarColoresMarca() {
    document.documentElement.style.setProperty('--primary-solid', CONFIG_DISENO.colorPrincipal);
    document.documentElement.style.setProperty('--primary-solid-hover', oscurecerHex(CONFIG_DISENO.colorPrincipal, 0.9));
    document.documentElement.style.setProperty('--primary-color', CONFIG_DISENO.colorPrincipal);
    document.documentElement.style.setProperty('--primary-hover', oscurecerHex(CONFIG_DISENO.colorPrincipal, 0.85));
}

// Inicializar template
async function initTemplate(activePage = '') {
    const body = document.body;

    // Aplicar configuración remota (settings de Supabase): nombre del sitio,
    // WhatsApp, descuentos, transferencia y redes — antes de renderizar el template.
    await cargarConfiguracionGlobal();

    // Popup de salida: la config remota se expone para el script clásico
    // salida-popup.js (lee window.POPUP_CONFIG al abrir la ventana).
    window.POPUP_CONFIG = {
        titulo: CONFIG_APP.popupTitulo,
        descripcion: CONFIG_APP.popupDescripcion,
        cta: CONFIG_APP.popupCta,
        ctaUrl: CONFIG_APP.popupCtaUrl,
        activo: CONFIG_APP.popupActivo
    };

    // Aplicar branding configurable (sección "Diseño" del panel): color, bordes,
    // favicon y metas OpenGraph/Twitter.
    aplicarDisenoGlobal();

    // Obtener categorías dinámicas
    let categorias = [];
    try {
        const productos = await obtenerProductos();
        categorias = [...new Set(productos.map(p => p.categoria))].filter(Boolean);
        productosRef = productos;
    } catch (e) { console.error("Error cargando categorías para el menú", e); }

    // 1. Insertar Header
    const header = renderHeader(activePage, categorias);
    body.insertBefore(header, body.firstChild);
    // Avisar a módulos (ej. búsqueda) de que el header ya está en el DOM
    document.dispatchEvent(new CustomEvent('lemora:header-ready'));

    // 2. Marquee promocional (sección "Diseño" del panel): se inserta ANTES
    // del header para quedar como barra superior. Solo se muestra si está
    // activo y hay mensajes (vacíos no renderiza nada).
    if (CONFIG_APP.marqueeActivo) {
        const textos = await obtenerMarquee();
        if (textos.length > 0) {
            const marquee = crearMarquee(textos, CONFIG_APP.marqueeColorFondo);
            body.insertBefore(marquee, header);
            // Con pocos mensajes el contenido duplicado puede medir menos que
            // la barra (un solo ítem = solo una fracción del ancho animado).
            // Se ajusta tras insertar, con las medidas reales del DOM.
            asegurarCoberturaMarquee(marquee, textos);
        }
    }

    // Insertar footer al final del body
    const footer = renderFooter();
    body.appendChild(footer);

    // WhatsApp flotante (posición fija, independiente del footer).
    // Sin número configurado el botón no se renderiza (no hay link roto).
    if (WHATSAPP_CONFIG.number) {
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
    }

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
            const searchPanel = document.getElementById('searchPanel');
            if (e.key === 'Escape' && searchPanel && searchPanel.classList.contains('open')) {
                cerrarBusqueda();
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
            ${item.imagen
                ? `<img src="${escaparHtml(imagenOptimizada(item.imagen))}" alt="${escaparHtml(item.nombre)}" class="item-image" loading="lazy">`
                : placeholderImagenPublica('item-image')}
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
    // Si el panel de búsqueda está abierto, lo cerramos primero
    if (window.cerrarBusqueda) window.cerrarBusqueda();
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

// ===================== Búsqueda (panel de resultados bajo el navbar) =====================
// El panel es el mismo en todos los breakpoints. En desktop lo abre la barra del
// header al escribir; en móvil la barra está oculta y se entra con el ícono.
function toggleBusquedaMovil() {
    const panel = document.getElementById('searchPanel');
    if (!panel) return;
    if (panel.classList.contains('open')) {
        cerrarBusqueda();
        return;
    }
    // Abrir: si el carrito lateral estaba abierto, lo cerramos primero
    if (window.cerrarCarritoSidemenu) window.cerrarCarritoSidemenu();
    panel.classList.add('open');
    const input = panel.querySelector('.search-input');
    if (input) input.focus();
}

// Cierra el panel y limpia la consulta. Es lo que hace el `×`, tanto en el input
// del panel (móvil) como en el de la barra (desktop).
function cerrarBusqueda() {
    const panel = document.getElementById('searchPanel');
    if (panel) panel.classList.remove('open');
    if (window.limpiarBusqueda) window.limpiarBusqueda();
}

// Actualizar elementos de WhatsApp en el contenido de la página
function actualizarElementosWhatsApp() {
    const links = document.querySelectorAll('.wa-link');
    const numbers = document.querySelectorAll('.wa-number');

    // Sin número configurado: se quitan del DOM los enlaces/íconos de WhatsApp
    // (no se dejan href vacíos ni textos tipo "+" en la página).
    if (!WHATSAPP_CONFIG.number) {
        links.forEach(link => link.remove());
        numbers.forEach(el => el.remove());
        return;
    }
    
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

    // Exponer las funciones ANTES de insertar el header, no después.
    //
    // El header se inyecta dentro de initTemplate(), pero estas asignaciones
    // estaban al final del listener, es decir después de `await initTemplate()`.
    // Como initTemplate espera dos llamadas de red (cargarConfiguracionGlobal y
    // obtenerProductos), había una ventana en la que los botones del header ya
    // eran visibles y pulsables pero su onclick inline lanzaba ReferenceError
    // ("toggleBusquedaMovil is not defined") sin abrir nada. Moverlas arriba
    // cierra esa ventana para todos los handlers inline (búsqueda y sidemenu).
    // No dependen del DOM: solo reasignan referencias a funciones declaradas.
    //
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
    window.cerrarBusqueda = cerrarBusqueda;

    await initTemplate(activePage);
    
    // Actualizar contador de favoritos
    actualizarContadorFavoritosGlobal();
    // Actualizar contador del carrito
    actualizarContadorCarrito();

    // Actualizar enlaces y textos de WhatsApp dinámicos
    actualizarElementosWhatsApp();
});
