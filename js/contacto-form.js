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
// El campo acepta una dirección como texto o una URL de mapas (Google Maps u
// otro proveedor). `/api/ubicacion` la resuelve a coordenadas (sigue links
// cortos server-side y geocodifica texto con Nominatim) y acá se renderiza un
// mapa embebido de OpenStreetMap, que no requiere API key ni restricciones de
// referrer. Sin valores por defecto: campo vacío = bloque oculto.

async function aplicarUbicacion() {
    const contenedor = document.querySelector('.contact-map-container');
    const grid = document.querySelector('.contact-grid');
    if (!contenedor) return;

    // template.js ya la cargó, pero es idempotente (caché de 5 min).
    await cargarConfiguracionGlobal();

    const ubicacion = (CONFIG_APP.address || '').trim();
    // Sin dirección: se oculta el mapa y el formulario queda solo y centrado.
    if (!ubicacion) {
        contenedor.classList.add('sin-ubicacion');
        if (grid) grid.classList.add('contact-grid--sin-ubicacion');
        return;
    }

    contenedor.classList.remove('sin-ubicacion');
    if (grid) grid.classList.remove('contact-grid--sin-ubicacion');

    const zonaMapa = document.querySelector('.contact-map');
    const mapaFrame = document.getElementById('contactMapFrame');
    const bloqueDireccion = document.querySelector('.contact-address');
    const direccionTexto = document.getElementById('contactAddressText');

    try {
        const respuesta = await fetch('/api/ubicacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valor: ubicacion })
        });
        const data = await respuesta.json();

        if (!respuesta.ok || data.status !== 'success' || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
            throw new Error((data && data.message) || 'No se pudo ubicar el negocio');
        }

        // Vista tipo "bloque" alrededor de las coordenadas.
        const dLat = 0.005;
        const dLng = 0.008;
        mapaFrame.src =
            'https://www.openstreetmap.org/export/embed.html?' +
            `bbox=${(data.lng - dLng).toFixed(6)}%2C${(data.lat - dLat).toFixed(6)}%2C` +
            `${(data.lng + dLng).toFixed(6)}%2C${(data.lat + dLat).toFixed(6)}` +
            `&layer=hot&marker=${data.lat}%2C${data.lng}`;
        if (zonaMapa) zonaMapa.style.display = '';

        if (direccionTexto) {
            direccionTexto.textContent = data.nombre || ubicacion;
            if (bloqueDireccion) bloqueDireccion.hidden = false;
        }
    } catch (error) {
        // No se pudo resolver: se muestra el valor como texto, sin mapa.
        console.warn('⚠️ No se pudo resolver la ubicación del negocio.', error);
        if (zonaMapa) zonaMapa.style.display = 'none';
        if (direccionTexto) {
            direccionTexto.textContent = ubicacion;
            if (bloqueDireccion) bloqueDireccion.hidden = false;
        }
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
    
    // Sin número configurado no hay a quién derivar la consulta.
    if (!WHATSAPP_CONFIG.number) {
        mostrarNotificacion('No hay un número de WhatsApp configurado en la tienda. Volvé a intentarlo más tarde.', 'error');
        return;
    }

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