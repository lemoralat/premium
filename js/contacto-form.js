// Gestión de la página de contacto: formulario por WhatsApp + ubicación del
// negocio (Configuración → Datos generales) en el mapa de contacto.

import { mostrarNotificacion, WHATSAPP_CONFIG, CONFIG_APP, cargarConfiguracionGlobal } from './utils.js';

document.addEventListener('DOMContentLoaded', async function() {
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', enviarContactoWhatsApp);
    }

    await aplicarUbicacion();
});

// ————— Ubicación del negocio (Configuración → Datos generales → "Ubicación del negocio") —————
// El campo acepta una dirección como texto o una URL de Google Maps. Sin
// valores por defecto: con el campo vacío el bloque de ubicación no se muestra
// en la página de contacto (sin fallback hardcodeado).

function esURL(valor) {
    return /^https?:\/\//i.test(valor);
}

// Convierte una URL de Google Maps a una URL embebible para el iframe.
// Devuelve null si la URL no se puede incrustar (ej. links cortos goo.gl).
function urlMapaEmbebible(url) {
    // Ya es un mapa embebido (iframe de "Compartir → Insertar un mapa").
    if (url.includes('/maps/embed') || /[?&]output=embed/.test(url)) {
        return url;
    }
    // Enlace largo con coordenadas (@lat,lng): se embebe apuntando a ellas.
    const coord = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coord) {
        return `https://maps.google.com/maps?q=${coord[1]},${coord[2]}&z=16&output=embed`;
    }
    // Enlace largo con el nombre del lugar: /maps/place/Edificio+inteligente/@...
    const lugar = url.match(/\/maps\/place\/([^/?@]+)/);
    if (lugar) {
        return `https://maps.google.com/maps?q=${encodeURIComponent(lugar[1])}&output=embed`;
    }
    // Los links cortos de compartir (maps.app.goo.gl) requieren una redirección
    // que el navegador no puede seguir desde un iframe; no son embebibles.
    if (url.includes('maps.app.goo.gl')) {
        return null;
    }
    // Cualquier otra URL se usa tal cual (best effort). En producción el CSP
    // del deploy limita los iframes a https://www.google.com.
    return url;
}

// Nombre legible del lugar dentro de una URL de Google Maps (/maps/place/...).
function nombreLugar(url) {
    const lugar = url.match(/\/maps\/place\/([^/?@]+)/);
    if (!lugar) return '';
    try {
        return decodeURIComponent(lugar[1]).replace(/\+/g, ' ');
    } catch {
        return lugar[1].replace(/\+/g, ' ');
    }
}

// Aplica la ubicación del negocio al bloque de mapa de contacto.html:
// dirección como texto → dirección + mapa derivado (maps?q=...&output=embed);
// URL de Google Maps → mapa embebido exacto (y nombre del lugar si aplica).
async function aplicarUbicacion() {
    const contenedor = document.querySelector('.contact-map-container');
    if (!contenedor) return;

    // template.js ya la cargó, pero es idempotente (caché de 5 min).
    await cargarConfiguracionGlobal();

    const ubicacion = (CONFIG_APP.address || '').trim();
    if (!ubicacion) {
        contenedor.classList.add('sin-ubicacion');
        return;
    }

    contenedor.classList.remove('sin-ubicacion');

    const mapaFrame = document.getElementById('contactMapFrame');
    const bloqueDireccion = document.querySelector('.contact-address');
    const direccionTexto = document.getElementById('contactAddressText');

    if (esURL(ubicacion)) {
        const src = urlMapaEmbebible(ubicacion);
        const nombre = nombreLugar(ubicacion);

        if (src && mapaFrame) {
            mapaFrame.src = src;
        }
        if (nombre && direccionTexto) {
            // Con mapa y nombre legible: se muestra el nombre bajo el mapa.
            direccionTexto.textContent = nombre;
            if (bloqueDireccion) bloqueDireccion.hidden = false;
        } else if (!src && direccionTexto) {
            // URL que no se pudo incrustar (ej. link corto): se muestra tal cual.
            direccionTexto.textContent = ubicacion;
            if (bloqueDireccion) bloqueDireccion.hidden = false;
        }
        // Con mapa embebido y sin nombre extraíble → solo el mapa.
    } else if (mapaFrame) {
        // Dirección como texto: mapa derivado + el texto bajo el mapa.
        mapaFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(ubicacion)}&output=embed`;
        if (direccionTexto) direccionTexto.textContent = ubicacion;
        if (bloqueDireccion) bloqueDireccion.hidden = false;
    }
}

function enviarContactoWhatsApp(e) {
    e.preventDefault();
    
    // Obtener datos del formulario
    const formData = new FormData(e.target);
    const nombre = formData.get('nombre').trim();
    const mensaje = formData.get('mensaje').trim();
    
    // Validación básica
    if (!nombre || !mensaje) {
        mostrarNotificacion('Por favor, completa todos los campos', 'error');
        return;
    }
    
    // Construir mensaje para WhatsApp
    let mensajeWhatsApp = `*CONSULTA DESDE LA WEB*\n\n`;
    mensajeWhatsApp += `*Nombre:* ${nombre}\n\n`;
    mensajeWhatsApp += `*Mensaje:*\n${mensaje}`;
    
    // Codificar mensaje para URL
    const mensajeCodificado = encodeURIComponent(mensajeWhatsApp);
    
    // Crear URL de WhatsApp
    const urlWhatsApp = `https://wa.me/${WHATSAPP_CONFIG.number}?text=${mensajeCodificado}`;
    
    // Abrir WhatsApp en nueva ventana
    window.open(urlWhatsApp, '_blank');
    
    // Limpiar formulario después de enviar
    e.target.reset();
    
    // Mostrar mensaje de confirmación
    mostrarConfirmacion();
}

function mostrarConfirmacion() {
    // Crear overlay de confirmación
    const overlay = document.createElement('div');
    overlay.className = 'confirmacion-overlay';
    
    // Crear mensaje de confirmación
    const mensaje = document.createElement('div');
    mensaje.className = 'confirmacion-modal';
    
    mensaje.innerHTML = `
        <div class="confirmacion-icon">✓</div>
        <h2 class="confirmacion-title success">¡Mensaje Enviado!</h2>
        <p class="confirmacion-text">
            Tu consulta se ha abierto en WhatsApp. Te responderemos lo antes posible.
        </p>
        <button onclick="cerrarConfirmacion()" class="confirmacion-btn">Cerrar</button>
    `;
    
    overlay.appendChild(mensaje);
    document.body.appendChild(overlay);
    
    // Hacer disponible globalmente la función de cerrar
    window.cerrarConfirmacion = function() {
        overlay.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => overlay.remove(), 300);
    };
    
    // Cerrar al hacer clic fuera del mensaje
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            window.cerrarConfirmacion();
        }
    });
}

// Si `mostrarNotificacion` se mueve a `utils.js`, los estilos de animación `fadeIn`, `fadeOut`, `slideUp`
// deberían permanecer en `styles.css` o ser gestionados de forma centralizada.
// Por ahora, se asume que `mostrarNotificacion` en `utils.js` ya maneja sus propios estilos o los espera en `styles.css`.