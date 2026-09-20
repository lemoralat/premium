// Gestión del carrito de compras

import { formatearPrecio, mostrarNotificacion, calcularTotales, CONFIG_DESCUENTO, CONFIG_CUPONES, obtenerProductos, obtenerCupones, obtenerBanners, escaparHtml, claveItemCarrito, esBannerSoloImagen, recortarTexto, imagenOptimizada } from './utils.js';

let productosGlobales = [];

// Obtener carrito del localStorage
function obtenerCarrito() {
    return JSON.parse(localStorage.getItem('cart')) || [];
}

// Guardar carrito en localStorage
function guardarCarrito(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    if (window.actualizarContadorCarrito) window.actualizarContadorCarrito();
}

// Renderizar items del carrito
function renderizarCarrito() {
    const cartItemsContainer = document.getElementById('cartItems');
    if (!cartItemsContainer) return;

    const cart = obtenerCarrito();

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart">
                <h2>Tu carrito está vacío</h2>
                <p>Agrega productos para comenzar tu compra</p>
                <a href="index.html" class="shop-btn btn-border">Ir a la tienda</a>
            </div>
        `;
        actualizarTotales();
        return;
    }

    cartItemsContainer.innerHTML = cart.map(item => {
        const productoRef = productosGlobales.find(p => p.id === item.id);
        const sinStock = productoRef && productoRef.stock === 0;
        const stockBajo = productoRef && productoRef.stock > 0 && productoRef.stock < 5;
        const clave = claveItemCarrito(item.id, item.varianteTexto);

        return `
        <div class="cart-item${sinStock ? ' sin-stock' : ''}" data-clave="${escaparHtml(clave)}">
            <img src="${imagenOptimizada(item.imagen)}" alt="${item.nombre}" class="item-image" loading="lazy">
            <div class="item-details">
                <h3 class="item-title">${recortarTexto(item.nombre)}</h3>
                ${item.varianteTexto ? `<p class="item-variant">${escaparHtml(item.varianteTexto)}</p>` : ''}
                ${sinStock ? `<p class="stock-alert stock-alert-danger">⚠️ Este producto se agotó. Debes eliminarlo para continuar.</p>` : ''}
                ${stockBajo ? `<p class="stock-alert stock-alert-warn">⚠️ ¡Últimas unidades disponibles! (Quedan ${productoRef.stock})</p>` : ''}
                <p class="item-price">$${formatearPrecio(item.precio)}</p>
            </div>
            <div class="item-controls">
                <div class="quantity-controls">
                    <button class="qty-btn btn-border" onclick="actualizarCantidad(this.dataset.clave, -1)" data-clave="${escaparHtml(clave)}" aria-label="Disminuir cantidad" ${sinStock ? 'disabled' : ''}>-</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button class="qty-btn btn-border" onclick="actualizarCantidad(this.dataset.clave, 1)" data-clave="${escaparHtml(clave)}" aria-label="Aumentar cantidad" ${sinStock ? 'disabled' : ''}>+</button>
                </div>
                <button class="remove-btn btn-border" onclick="eliminarDelCarrito(this.dataset.clave)" data-clave="${escaparHtml(clave)}" aria-label="Eliminar ${item.nombre}">
                    <i class="fa-solid fa-trash-can"></i> Eliminar
                </button>
            </div>
        </div>
    `;
    }).join('');

    actualizarTotales();
}

// Actualizar cantidad de un producto (por clave de línea)
function actualizarCantidad(clave, cambio) {
    let cart = obtenerCarrito();
    const item = cart.find(i => claveItemCarrito(i.id, i.varianteTexto) === clave);

    if (item) {
        // Validar stock si se intenta aumentar la cantidad (sumado entre líneas del mismo producto)
        if (cambio > 0) {
            const productoRef = productosGlobales.find(p => p.id === item.id);
            if (productoRef) {
                const enCarrito = cart
                    .filter(i => i.id === item.id)
                    .reduce((sum, i) => sum + i.quantity, 0);
                if (enCarrito + cambio > productoRef.stock) {
                    mostrarNotificacion(`Límite de stock alcanzado (${productoRef.stock} disponibles)`);
                    return;
                }
            }
        }

        item.quantity += cambio;
        
        if (item.quantity <= 0) {
            eliminarDelCarrito(clave);
            return;
        }

        guardarCarrito(cart);
        renderizarCarrito();
    }
}

// Eliminar producto del carrito (por clave de línea)
function eliminarDelCarrito(clave) {
    let cart = obtenerCarrito();
    cart = cart.filter(item => claveItemCarrito(item.id, item.varianteTexto) !== clave);
    guardarCarrito(cart);
    renderizarCarrito();
}

// Aplicar cupón manual
function aplicarCupon() {
    const input = document.getElementById('couponInput');
    const btn = document.getElementById('applyCouponBtn');
    if (!input || !btn) return;

    const codigo = input.value.trim().toUpperCase();
    if (!codigo) return;

    // Estado de carga
    const originalText = btn.textContent;
    btn.textContent = 'Validando...';
    btn.disabled = true;

    // Simular validación (ej. 800ms) para que el estado de carga sea visible
    setTimeout(() => {
        const cuponData = CONFIG_CUPONES[codigo];

        if (cuponData) {
            const hoy = new Date();
            const fechaExp = new Date(cuponData.expira);

            // Validar si el cupón no ha expirado
            if (hoy.setHours(0, 0, 0, 0) <= fechaExp.setHours(0, 0, 0, 0)) {
                sessionStorage.setItem('appliedCoupon', codigo);
                mostrarNotificacion(`✅ Cupón ${codigo} aplicado con éxito`);
                actualizarTotales();
                input.value = ''; // Limpiar el campo tras éxito
            } else {
                mostrarNotificacion('❌ Este cupón ha expirado', 'error');
            }
        } else {
            mostrarNotificacion('❌ El código de cupón no es válido', 'error');
        }

        // Restaurar estado original
        btn.textContent = originalText;
        btn.disabled = false;
    }, 800);
}

// Eliminar cupón aplicado
function eliminarCupon() {
    sessionStorage.removeItem('appliedCoupon');
    mostrarNotificacion('Cupón eliminado');
    actualizarTotales();
}

// Actualizar totales
function actualizarTotales() {
    const cart = obtenerCarrito();
    const cupon = sessionStorage.getItem('appliedCoupon');

    const applyBtn = document.getElementById('applyCouponBtn');
    const removeBtn = document.getElementById('removeCouponBtn');
    const couponInput = document.getElementById('couponInput');

    if (cupon) {
        if (applyBtn) {
            applyBtn.style.display = 'none';
            applyBtn.classList.remove('coupon-animate');
        }
        if (couponInput) {
            couponInput.style.display = 'none';
            couponInput.classList.remove('coupon-animate');
        }
        if (removeBtn && removeBtn.style.display !== 'block') {
            removeBtn.style.display = 'block';
            removeBtn.classList.add('coupon-animate');
        }
    } else {
        if (applyBtn && applyBtn.style.display !== 'block') {
            applyBtn.style.display = 'block';
            applyBtn.classList.add('coupon-animate');
        }
        if (couponInput && couponInput.style.display !== 'block') {
            couponInput.style.display = 'block';
            couponInput.classList.add('coupon-animate');
        }
        if (removeBtn) {
            removeBtn.style.display = 'none';
            removeBtn.classList.remove('coupon-animate');
        }
    }

    const haySinStock = cart.some(item => {
        const ref = productosGlobales.find(p => p.id === item.id);
        return ref && ref.stock === 0;
    });

    const { subtotal, descuento, total, esCupon, porcentaje } = calcularTotales(cart, cupon);

    const subtotalElement = document.getElementById('subtotal');
    const descuentoElement = document.getElementById('descuento');
    const descuentoRow = document.getElementById('descuentoRow');
    const totalElement = document.getElementById('total');

    if (subtotalElement) {
        subtotalElement.textContent = `$${formatearPrecio(subtotal)}`;
    }

    // Manejar la visualización del descuento
    if (descuento > 0) {
        if (descuentoRow) descuentoRow.style.display = 'flex';
        if (descuentoElement) {
            const etiqueta = esCupon ? `Cupón ${cupon}` : 'Dcto. Automático';
            descuentoElement.textContent = `-${etiqueta} ($${formatearPrecio(descuento)} [${porcentaje}%])`;
        }
    } else {
        if (descuentoRow) descuentoRow.style.display = 'none';
    }

    if (totalElement) {
        totalElement.textContent = `$${formatearPrecio(total)}`;
    }

    // Habilitar/deshabilitar botón de checkout
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.disabled = cart.length === 0 || haySinStock;
    }
}

// Mostrar formulario de checkout
function mostrarFormularioCheckout() {
    const checkoutForm = document.getElementById('checkoutForm');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (checkoutForm && checkoutBtn) {
        checkoutForm.classList.remove('hidden');
        checkoutBtn.style.display = 'none';
        
        // Scroll al formulario
        checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Cargar productos para referencia de stock
async function cargarProductosReferencia() {
    try {
        productosGlobales = await obtenerProductos();
    } catch (error) {
        console.error('Error al cargar productos para validación:', error);
    }
}

// Banner del carrito: el último banner de la hoja "Banners". Sin banners => el contenedor queda oculto.
function renderizarBannerCarrito(banners) {
    const contenedor = document.getElementById('banner-carrito');
    if (!contenedor) return;

    const banner = Array.isArray(banners) && banners.length > 0 ? banners[banners.length - 1] : null; // último banner publicado
    if (!banner) return;

    // Banner "solo imagen": imagen a ancho completo como fondo con cover
    if (esBannerSoloImagen(banner)) {
        const img = escaparHtml(imagenOptimizada(banner.imagen));
        const link = escaparHtml(banner.link || '');
        const etiqueta = banner.link ? `aria-label="${escaparHtml(banner.titulo || 'Banner')}" ` : '';
        contenedor.innerHTML = `
            <div class="banner-solo-imagen banner-border" style="background-image:url('${img}')">
                ${banner.link ? `<a href="${link}" target="_self" ${etiqueta}></a>` : ''}
            </div>
        `;
        contenedor.hidden = false;
        return;
    }

    const titulo = escaparHtml(banner.titulo);
    const link = escaparHtml(banner.link || '');
    const tieneBoton = Boolean(banner.boton && banner.link);

    contenedor.innerHTML = `
        <div class="banner banner-border">
            <div class="banner_imagen">
                ${banner.link ? `<a href="${link}" target="_self">` : ''}
                    <img loading="lazy" src="${escaparHtml(imagenOptimizada(banner.imagen))}" alt="${titulo}" width="1200" height="400">
                ${banner.link ? '</a>' : ''}
            </div>
            <div class="banner_info">
                ${banner.logo ? `
                <div class="banner_info_icono banner-border">
                    <img loading="lazy" src="${escaparHtml(imagenOptimizada(banner.logo))}" alt="" class="block" width="60">
                </div>
                ` : ''}

                <div class="banner_info_copy">
                    ${banner.badge ? `<span>${escaparHtml(recortarTexto(banner.badge, 20))}</span>` : ''}
                    <h2>${escaparHtml(recortarTexto(banner.titulo, 100))}</h2>
                    ${tieneBoton ? `<a href="${link}" target="_self">${escaparHtml(recortarTexto(banner.boton, 15))} <i class="fa-solid fa-chevron-right"></i></a>` : ''}
                </div>
            </div>
        </div>
    `;
    contenedor.hidden = false;
}

// Event listener para el botón de checkout
document.addEventListener('DOMContentLoaded', async function() {
    await cargarProductosReferencia();
    await obtenerCupones();
    renderizarCarrito();
    renderizarBannerCarrito(await obtenerBanners());
    
    // Alerta inicial si hay productos que se quedaron sin stock
    const cart = obtenerCarrito();
    const tieneSinStock = cart.some(item => {
        const ref = productosGlobales.find(p => p.id === item.id);
        return ref && ref.stock === 0;
    });

    if (tieneSinStock) {
        mostrarNotificacion('⚠️ Algunos productos en tu carrito ya no tienen stock disponible.');
    }

    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', mostrarFormularioCheckout);
    }

    // Validar cupón al presionar Enter en el input
    const couponInput = document.getElementById('couponInput');
    if (couponInput) {
        couponInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                aplicarCupon();
            }
        });
    }
});

// Exponer funciones globalmente (necesario por usar módulos y eventos inline en HTML)
window.actualizarCantidad = actualizarCantidad;
window.eliminarDelCarrito = eliminarDelCarrito;
window.aplicarCupon = aplicarCupon;
window.eliminarCupon = eliminarCupon;
window.mostrarFormularioCheckout = mostrarFormularioCheckout;