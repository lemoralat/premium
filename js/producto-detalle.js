// Página de detalle de producto con galería de imágenes y zoom

import { formatearPrecio, mostrarNotificacion, obtenerProductos, generarHTMLTarjetaProducto, agregarAlCarritoBase, renderPrecioAnterior, tieneVariantes, escaparHtml, claveItemCarrito, recortarTexto, imagenOptimizada } from './utils.js';

let imagenActualIndex = 0;
let zoomActivo = false;
let productos = []; // Se cargará dinámicamente

document.addEventListener('DOMContentLoaded', function() {
    cargarTodosLosProductos().then(() => {
        cargarDetalleProducto();
        cargarProductosRelacionados();
    });
});

// Cargar todos los productos desde el JSON
async function cargarTodosLosProductos() {
    productos = await obtenerProductos();
};

// Obtener el ID del producto desde la URL
function obtenerIdProducto() {
    const params = new URLSearchParams(window.location.search);
    return parseInt(params.get('id'));
}

// Cargar detalle del producto
function cargarDetalleProducto() {
    const productoId = obtenerIdProducto();
    const producto = productos.find(p => p.id === productoId);
    
    if (!producto) {
        mostrarProductoNoEncontrado();
        return;
    }
    
    // Actualizar título de la página
    document.title = `${recortarTexto(producto.nombre)} - Mi Tienda Online`;
    
    // Actualizar breadcrumb
    const breadcrumbProduct = document.getElementById('breadcrumbProduct');
    if (breadcrumbProduct) {
        breadcrumbProduct.textContent = recortarTexto(producto.nombre);
    }
    
    // Renderizar detalle del producto
    renderizarDetalleProducto(producto);

    // Sugerencia: Inyectar Datos Estructurados para SEO (Google Rich Snippets)
    inyectarDatosEstructurados(producto);
}

function inyectarDatosEstructurados(producto) {
    const schemaData = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": producto.nombre,
        "image": producto.imagen,
        "description": producto.descripcion,
        "sku": `PROD-${producto.id}`,
        "offers": {
            "@type": "Offer",
            "url": window.location.href,
            "priceCurrency": "ARS",
            "price": producto.precio,
            "availability": producto.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition"
        }
    };

    // Eliminar esquema previo si existe
    const oldScript = document.getElementById('product-schema');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.id = 'product-schema';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schemaData);
    document.head.appendChild(script);
}

// Renderizar el detalle completo del producto
function renderizarDetalleProducto(producto) {
    const container = document.getElementById('productDetailContainer');
    if (!container) return;
    
    // Determinar estado del stock
    let stockClass = '';
    let stockText = '';
    if (producto.stock > 10) {
        stockClass = '';
        stockText = `En stock (${producto.stock} disponibles)`;
    } else if (producto.stock > 0) {
        stockClass = 'low';
        stockText = `¡Últimas unidades! (${producto.stock} disponibles)`;
    } else {
        stockClass = 'out';
        stockText = 'Agotado';
    }
    
    // Navegación entre productos
    const prevProduct = productos.find(p => p.id === producto.id - 1);
    const nextProduct = productos.find(p => p.id === producto.id + 1);
    
    // Usar galería si existe, sino usar imagen principal
    const imagenesGaleria = (producto.galeria && producto.galeria.length > 0 
        ? producto.galeria 
        : [producto.imagen]).map(imagenOptimizada);
    
    container.innerHTML = `
        <div class="product-detail-grid">
            <div class="product-detail-image-container">
                <!-- Imagen principal -->
                <div class="main-image-wrapper">
                    <img src="${imagenesGaleria[0]}" 
                         alt="${producto.nombre}" 
                         class="product-detail-image" 
                         id="mainProductImage"
                         onclick="toggleZoom()">
                    
                    ${imagenesGaleria.length > 1 ? `
                        <button class="gallery-nav-btn prev-img" onclick="cambiarImagen(-1)" aria-label="Imagen anterior">
                            ‹
                        </button>
                        <button class="gallery-nav-btn next-img" onclick="cambiarImagen(1)" aria-label="Imagen siguiente">
                            ›
                        </button>
                        
                        <div class="image-counter">
                            <span id="imageCounter">1 / ${imagenesGaleria.length}</span>
                        </div>
                    ` : ''}
                    
                    <div class="zoom-hint">
                        <i class="fa-solid fa-magnifying-glass-plus"></i>
                        <span>Click para ampliar</span>
                    </div>
                </div>
                
                <!-- Miniaturas -->
                ${imagenesGaleria.length > 1 ? `
                    <div class="thumbnails-container">
                        ${imagenesGaleria.map((img, idx) => `
                            <img src="${img}" 
                                 alt="${producto.nombre} - Vista ${idx + 1}" 
                                 class="thumbnail ${idx === 0 ? 'active' : ''}" 
                                 onclick="seleccionarImagen(${idx})"
                                 loading="lazy">
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            
            <div class="product-detail-info">
                <span class="product-category">${producto.categoria}</span>
                <div class="product-title-row">
                    <h1 class="product-detail-title">${recortarTexto(producto.nombre)}</h1>
                    <button class="btn-favorito ${esFavorito(producto.id) ? 'active' : ''}" 
                            onclick="toggleFavorito(${producto.id})" 
                            aria-label="Agregar a favoritos"
                            id="btnFavorito">
                        <i class="${esFavorito(producto.id) ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>
                </div>
                
                <p class="product-stock ${stockClass}">${stockText}</p>
                
                <p class="product-detail-price">${renderPrecioAnterior(producto)}$${formatearPrecio(producto.precio)}</p>
                
                <p class="product-detail-description">${recortarTexto(producto.descripcionDetallada, 400)}</p>
                
                <div class="product-features">
                    <h3>Características:</h3>
                    <ul>
                        ${(producto.caracteristicas || []).slice(0, 10).map(caracteristica => `
                            <li>${caracteristica}</li>
                        `).join('')}
                    </ul>
                </div>
                
                ${tieneVariantes(producto) ? `
                <div class="variant-selector">
                    <h3>Elegí tu opción:</h3>
                    ${producto.variantes.map((v, i) => `
                        <div class="variant-group">
                            <label for="variantSelect${i}">${escaparHtml(v.opcion)}:</label>
                            <select id="variantSelect${i}" class="variant-select">
                                <option value="">Seleccioná ${escaparHtml(v.opcion)}</option>
                                ${v.valores.map(val => `
                                    <option value="${escaparHtml(val)}">${escaparHtml(val)}</option>
                                `).join('')}
                            </select>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                
                <div class="quantity-selector">
                    <label for="quantity">Cantidad:</label>
                    <div class="quantity-controls">
                        <button class="quantity-btn btn-border" onclick="cambiarCantidad(-1)" aria-label="Disminuir cantidad">-</button>
                        <span class="quantity-value" id="quantityValue">1</span>
                        <button class="quantity-btn btn-border" onclick="cambiarCantidad(1)" aria-label="Aumentar cantidad">+</button>
                    </div>
                </div>
                
                <div class="product-actions-detail">
                    <button class="btn-add-cart btn-border" id="btnAddCart" onclick="agregarAlCarritoDetalle(${producto.id})" ${producto.stock === 0 ? 'disabled' : ''}>
                        ${producto.stock === 0 ? 'Agotado' : 'Agregar al Carrito'}
                    </button>
                    <a href="carrito.html" class="btn-go-cart btn-border hidden" id="btnGoCart">
                        Ir al Carrito →
                    </a>
                </div>
                
                <div class="product-share">
                    <h3>Compartir este producto:</h3>
                    <div class="share-buttons">
                        <a href="https://wa.me/?text=${encodeURIComponent('¡Mirá este producto! ' + producto.nombre + ' ' + window.location.href)}" 
                           class="share-btn wa-share" target="_blank" rel="noopener" aria-label="Compartir en WhatsApp">
                            <i class="fa-brands fa-whatsapp"></i>
                        </a>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}" 
                           class="share-btn facebook" target="_blank" rel="noopener" aria-label="Compartir en Facebook">
                            <i class="fa-brands fa-facebook-f"></i>
                        </a>
                        <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent('¡Mirá lo que encontré! ' + producto.nombre)}&url=${encodeURIComponent(window.location.href)}" 
                           class="share-btn twitter" target="_blank" rel="noopener" aria-label="Compartir en Twitter">
                            <i class="fa-brands fa-x-twitter"></i>
                        </a>
                        <button class="share-btn copy" onclick="copiarEnlace()" title="Copiar enlace">
                            <i class="fa-solid fa-link"></i>
                        </button>
                    </div>
                </div>
                
                <div class="product-navigation">
                    ${prevProduct ? `
                        <a href="producto.html?id=${prevProduct.id}" class="nav-product-btn btn-border prev">
                            ← ${prevProduct.nombre}
                        </a>
                    ` : '<span></span>'}
                    
                    ${nextProduct ? `
                        <a href="producto.html?id=${nextProduct.id}" class="nav-product-btn btn-border next">
                            ${nextProduct.nombre} →
                        </a>
                    ` : '<span></span>'}
                </div>
            </div>
        </div>
    `;

    // Inicializar controles de cantidad según stock real
    setTimeout(() => cambiarCantidad(0), 0);
}

// Cambiar imagen en la galería
function cambiarImagen(direccion) {
    const productoId = obtenerIdProducto();
    const producto = productos.find(p => p.id === productoId);
    
    if (!producto || !producto.galeria || producto.galeria.length <= 1) return;
    
    imagenActualIndex += direccion;
    
    // Ciclo infinito
    if (imagenActualIndex < 0) {
        imagenActualIndex = producto.galeria.length - 1;
    }
    if (imagenActualIndex >= producto.galeria.length) {
        imagenActualIndex = 0;
    }
    
    actualizarImagenPrincipal();
}

// Seleccionar imagen desde miniatura
function seleccionarImagen(index) {
    imagenActualIndex = index;
    actualizarImagenPrincipal();
}

// Actualizar imagen principal y miniaturas
function actualizarImagenPrincipal() {
    const productoId = obtenerIdProducto();
    const producto = productos.find(p => p.id === productoId);
    
    if (!producto || !producto.galeria) return;
    
    const mainImage = document.getElementById('mainProductImage');
    const imageCounter = document.getElementById('imageCounter');
    const thumbnails = document.querySelectorAll('.thumbnail');
    
    if (mainImage) {
        // Efecto de transición
        mainImage.style.opacity = '0';
        setTimeout(() => {
            mainImage.src = imagenOptimizada(producto.galeria[imagenActualIndex]);
            mainImage.style.opacity = '1';
        }, 200);
    }
    
    if (imageCounter) {
        imageCounter.textContent = `${imagenActualIndex + 1} / ${producto.galeria.length}`;
    }
    
    // Actualizar miniaturas activas
    thumbnails.forEach((thumb, idx) => {
        if (idx === imagenActualIndex) {
            thumb.classList.add('active');
        } else {
            thumb.classList.remove('active');
        }
    });
}

// Toggle zoom en la imagen
function toggleZoom() {
    const productoId = obtenerIdProducto();
    const producto = productos.find(p => p.id === productoId);
    
    if (!producto) return;
    
    const imagenesGaleria = (producto.galeria && producto.galeria.length > 0 
        ? producto.galeria 
        : [producto.imagen]).map(imagenOptimizada);
    
    // Crear modal de zoom
    const zoomModal = document.createElement('div');
    zoomModal.className = 'zoom-modal';
    zoomModal.innerHTML = `
        <div class="zoom-overlay" onclick="cerrarZoom()"></div>
        <div class="zoom-container">
            <button class="zoom-close" onclick="cerrarZoom()" aria-label="Cerrar zoom">
                <i class="fa-solid fa-xmark"></i>
            </button>
            
            ${imagenesGaleria.length > 1 ? `
                <button class="zoom-nav-btn prev" onclick="event.stopPropagation(); cambiarImagenZoom(-1)" aria-label="Imagen anterior">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button class="zoom-nav-btn next" onclick="event.stopPropagation(); cambiarImagenZoom(1)" aria-label="Imagen siguiente">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            ` : ''}
            
            <div class="zoom-image-wrapper">
                <img src="${imagenesGaleria[imagenActualIndex]}" 
                     alt="${producto.nombre}" 
                     class="zoom-image" 
                     id="zoomImage"
                     draggable="false">
            </div>
            
            ${imagenesGaleria.length > 1 ? `
                <div class="zoom-counter">
                    <span id="zoomCounter">${imagenActualIndex + 1} / ${imagenesGaleria.length}</span>
                </div>
                
                <div class="zoom-thumbnails">
                    ${imagenesGaleria.map((img, idx) => `
                        <img src="${img}" 
                             alt="${producto.nombre} - Vista ${idx + 1}" 
                             class="zoom-thumbnail ${idx === imagenActualIndex ? 'active' : ''}" 
                             onclick="event.stopPropagation(); seleccionarImagenZoom(${idx})">
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
    
    document.body.appendChild(zoomModal);
    document.body.style.overflow = 'hidden';
    zoomActivo = true;
    
    // Animación de entrada
    setTimeout(() => {
        zoomModal.classList.add('active');
    }, 10);
    
    // Habilitar zoom con mouse y touch
    const zoomImg = document.getElementById('zoomImage');
    if (zoomImg) {
        habilitarZoomInteractivo(zoomImg);
    }
    
    // Cerrar con tecla ESC
    document.addEventListener('keydown', manejarTeclasZoom);
}

// Cerrar zoom
function cerrarZoom() {
    const zoomModal = document.querySelector('.zoom-modal');
    if (zoomModal) {
        zoomModal.classList.remove('active');
        setTimeout(() => {
            zoomModal.remove();
            document.body.style.overflow = '';
            zoomActivo = false;
        }, 300);
        document.body.classList.remove('zoom-active');
    }
    document.removeEventListener('keydown', manejarTeclasZoom);
}

// Cambiar imagen en modo zoom
function cambiarImagenZoom(direccion) {
    const productoId = obtenerIdProducto();
    const producto = productos.find(p => p.id === productoId);
    
    if (!producto || !producto.galeria || producto.galeria.length <= 1) return;
    
    imagenActualIndex += direccion;
    
    if (imagenActualIndex < 0) {
        imagenActualIndex = producto.galeria.length - 1;
    }
    if (imagenActualIndex >= producto.galeria.length) {
        imagenActualIndex = 0;
    }
    
    actualizarImagenZoom();
}

// Seleccionar imagen desde miniatura en zoom
function seleccionarImagenZoom(index) {
    imagenActualIndex = index;
    actualizarImagenZoom();
}

// Actualizar imagen en modo zoom
function actualizarImagenZoom() {
    const productoId = obtenerIdProducto();
    const producto = productos.find(p => p.id === productoId);
    
    if (!producto || !producto.galeria) return;
    
    const zoomImage = document.getElementById('zoomImage');
    const zoomCounter = document.getElementById('zoomCounter');
    const zoomThumbnails = document.querySelectorAll('.zoom-thumbnail');
    
    if (zoomImage) {
        zoomImage.style.opacity = '0';
        zoomImage.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            zoomImage.src = imagenOptimizada(producto.galeria[imagenActualIndex]);
            zoomImage.style.opacity = '1';
            zoomImage.style.transform = 'scale(1)';
            
            // Resetear zoom interactivo
            zoomImage.style.cursor = 'zoom-in';
            if (zoomImage.dataset.zoomed === 'true') {
                zoomImage.dataset.zoomed = 'false';
            }
        }, 200);
    }
    
    if (zoomCounter) {
        zoomCounter.textContent = `${imagenActualIndex + 1} / ${producto.galeria.length}`;
    }
    
    zoomThumbnails.forEach((thumb, idx) => {
        if (idx === imagenActualIndex) {
            thumb.classList.add('active');
        } else {
            thumb.classList.remove('active');
        }
    });
}

// Habilitar zoom interactivo en la imagen
function habilitarZoomInteractivo(img) {
    let zoomed = false;
    let posX = 0;
    let posY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    // Referencias para poder remover los listeners luego
    const onMouseMove = (e) => {
        if (isDragging && zoomed) {
            posX = e.clientX - startX;
            posY = e.clientY - startY;
            img.style.transform = `scale(2) translate(${posX}px, ${posY}px)`;
        }
    };

    const onMouseUp = () => {
        if (isDragging) {
            isDragging = false;
            img.style.cursor = 'zoom-out';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    };
    
    img.addEventListener('click', function(e) {
        e.stopPropagation();
        
        if (!zoomed) {
            // Hacer zoom
            const rect = img.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const xPercent = (x / rect.width) * 100;
            const yPercent = (y / rect.height) * 100;
            
            img.style.transformOrigin = `${xPercent}% ${yPercent}%`;
            img.style.transform = 'scale(2)';
            img.style.cursor = 'zoom-out';
            img.dataset.zoomed = 'true';
            zoomed = true;
        } else {
            // Quitar zoom
            img.style.transform = 'scale(1) translate(0, 0)';
            img.style.cursor = 'zoom-in';
            img.dataset.zoomed = 'false';
            zoomed = false;
            posX = 0;
            posY = 0;
        }
    });
    
    // Drag para mover la imagen zoomeada
    img.addEventListener('mousedown', function(e) {
        if (zoomed) {
            isDragging = true;
            startX = e.clientX - posX;
            startY = e.clientY - posY;
            img.style.cursor = 'grabbing';
        }
    });
    
    document.addEventListener('mousemove', function(e) {
        if (isDragging && zoomed) {
            posX = e.clientX - startX;
            posY = e.clientY - startY;
            img.style.transform = `scale(2) translate(${posX}px, ${posY}px)`;
        }
    });
    
    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            img.style.cursor = 'zoom-out';
        }
    });
    
    // Soporte para touch en móvil
    img.addEventListener('touchstart', function(e) {
        if (zoomed) {
            const touch = e.touches[0];
            startX = touch.clientX - posX;
            startY = touch.clientY - posY;
        }
    });
    
    img.addEventListener('touchmove', function(e) {
        if (zoomed) {
            e.preventDefault();
            const touch = e.touches[0];
            posX = touch.clientX - startX;
            posY = touch.clientY - startY;
            img.style.transform = `scale(2) translate(${posX}px, ${posY}px)`;
        }
    });
}

// Manejar teclas en modo zoom
function manejarTeclasZoom(e) {
    if (!zoomActivo) return;
    
    switch(e.key) {
        case 'Escape':
            cerrarZoom();
            break;
        case 'ArrowLeft':
            cambiarImagenZoom(-1);
            break;
        case 'ArrowRight':
            cambiarImagenZoom(1);
            break;
    }
}

// Control de cantidad
let cantidadSeleccionada = 1;

function cambiarCantidad(cambio) {
    const productoId = obtenerIdProducto();
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    // Calcular stock disponible real (total - lo que ya está en el carrito en todas sus líneas)
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const cantidadEnCarrito = cart
        .filter(item => item.id === producto.id)
        .reduce((sum, item) => sum + item.quantity, 0);
    const stockDisponibleReal = producto.stock - cantidadEnCarrito;

    if (stockDisponibleReal <= 0) {
        cantidadSeleccionada = 0;
    } else {
        if (cambio === 0) {
            // Inicialización o reset: asegurar que cantidadSeleccionada esté en rango
            cantidadSeleccionada = Math.min(Math.max(1, cantidadSeleccionada), stockDisponibleReal);
        } else {
            cantidadSeleccionada += cambio;
        }

        // Limitar entre 1 y el stock disponible real
        if (cantidadSeleccionada < 1) cantidadSeleccionada = 1;
        if (cantidadSeleccionada > stockDisponibleReal) cantidadSeleccionada = stockDisponibleReal;
    }

    // Actualizar display
    const quantityDisplay = document.getElementById('quantityValue');
    if (quantityDisplay) {
        quantityDisplay.textContent = stockDisponibleReal <= 0 ? '0' : cantidadSeleccionada;
    }
}

// Agregar al carrito desde detalle. Devuelve true si se agregó.
function agregarAlCarritoDetalle(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return false;

    // Validar que estén elegidas todas las variantes del producto
    let varianteTexto = '';
    if (tieneVariantes(producto)) {
        const elegidas = producto.variantes.map((v, i) => {
            const select = document.getElementById(`variantSelect${i}`);
            return { opcion: v.opcion, valor: select ? select.value.trim() : '' };
        });

        const pendientes = elegidas.filter(x => !x.valor);
        if (pendientes.length > 0) {
            mostrarNotificacion(`Elegí ${pendientes.map(x => x.opcion).join(', ')} para continuar`, 'error');
            return false;
        }
        varianteTexto = elegidas.map(x => `${x.opcion}: ${x.valor}`).join(', ');
    }

    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const clave = claveItemCarrito(id, varianteTexto);
    const existingItem = cart.find(item => claveItemCarrito(item.id, item.varianteTexto) === clave);

    const cantidadDeEsteProducto = cart
        .filter(item => item.id === id)
        .reduce((sum, item) => sum + item.quantity, 0);

    if (cantidadDeEsteProducto + cantidadSeleccionada > producto.stock) {
        mostrarNotificacion('No puedes agregar más de este producto (límite de stock)', 'error');
        return false;
    }

    if (existingItem) {
        existingItem.quantity += cantidadSeleccionada;
    } else {
        const nuevoItem = {
            id: producto.id,
            nombre: producto.nombre,
            precio: producto.precio,
            imagen: producto.imagen,
            quantity: cantidadSeleccionada
        };
        if (varianteTexto) nuevoItem.varianteTexto = varianteTexto;
        cart.push(nuevoItem);
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    if (window.actualizarContadorCarrito) window.actualizarContadorCarrito();
    mostrarNotificacion(`${cantidadSeleccionada} ${cantidadSeleccionada === 1 ? 'producto agregado' : 'productos agregados'} al carrito`);
    
    // Mostrar "Ir al Carrito" sin ocultar "Agregar al Carrito": el usuario puede
    // seguir agregando (otra variante o más cantidad) antes de ir al carrito
    const btnGoCart = document.getElementById('btnGoCart');

    if (btnGoCart) {
        btnGoCart.classList.remove('hidden');
    }
    
    // Resetear cantidad
    cantidadSeleccionada = 1;
    cambiarCantidad(0);

    return true;
}

// Cargar productos relacionados
function cargarProductosRelacionados() {
    const productoId = obtenerIdProducto();
    const productoActual = productos.find(p => p.id === productoId);
    
    if (!productoActual) return;
    
    let relacionados = productos.filter(p => 
        p.id !== productoId && p.categoria === productoActual.categoria
    );
    
    if (relacionados.length < 3) {
        const otros = productos.filter(p => 
            p.id !== productoId && !relacionados.includes(p)
        );
        relacionados = [...relacionados, ...otros];
    }
    
    relacionados = relacionados.slice(0, 3);
    
    const grid = document.getElementById('relatedProducts');
    if (!grid) return;
    
    grid.innerHTML = relacionados.map(p => generarHTMLTarjetaProducto(p)).join('');
}

// Mostrar producto no encontrado
function mostrarProductoNoEncontrado() {
    const container = document.getElementById('productDetailContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-cart">
            <h2>Producto no encontrado</h2>
            <p>El producto que buscas no existe o ha sido eliminado</p>
            <a href="index.html" class="shop-btn btn-border">Volver a la tienda</a>
        </div>
    `;
}

// ===== FAVORITOS =====

// Obtener favoritos desde localStorage
function obtenerFavoritos() {
    return JSON.parse(localStorage.getItem('favorites')) || [];
}

// Verificar si un producto es favorito
function esFavorito(id) {
    const favoritos = obtenerFavoritos();
    return favoritos.includes(id);
}

// Agregar o quitar de favoritos
function toggleFavorito(id) {
    let favoritos = obtenerFavoritos();
    const index = favoritos.indexOf(id);
    
    if (index > -1) {
        favoritos.splice(index, 1);
        mostrarNotificacion('Eliminado de favoritos');
    } else {
        favoritos.push(id);
        mostrarNotificacion('Agregado a favoritos ♥');
    }
    
    localStorage.setItem('favorites', JSON.stringify(favoritos));
    
    // Actualizar botón
    const btn = document.getElementById('btnFavorito');
    if (btn) {
        const icon = btn.querySelector('i');
        if (esFavorito(id)) {
            btn.classList.add('active');
            icon.className = 'fa-solid fa-heart';
        } else {
            btn.classList.remove('active');
            icon.className = 'fa-regular fa-heart';
        }
    }
    
    // Actualizar contador en el nav usando la función global centralizada
    if (typeof window.actualizarContadorFavoritosGlobal === 'function') {
        window.actualizarContadorFavoritosGlobal();
    }
}

// Función para copiar el enlace al portapapeles
window.copiarEnlace = function() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        mostrarNotificacion('¡Enlace copiado al portapapeles!', 'success');
    }).catch(err => {
        console.error('Error al copiar: ', err);
        // Fallback para navegadores antiguos
        mostrarNotificacion('No se pudo copiar el enlace', 'error');
    });
};

// Exponer funciones a window para que funcionen con onclick en el HTML (necesario en módulos)
window.toggleZoom = toggleZoom;
window.cerrarZoom = cerrarZoom;
window.cambiarImagen = cambiarImagen;
window.seleccionarImagen = seleccionarImagen;
window.cambiarImagenZoom = cambiarImagenZoom;
window.seleccionarImagenZoom = seleccionarImagenZoom;
window.toggleFavorito = toggleFavorito;
window.cambiarCantidad = cambiarCantidad;
window.agregarAlCarritoDetalle = agregarAlCarritoDetalle;