// Gestión del formulario de contacto - WhatsApp

import { mostrarNotificacion, WHATSAPP_CONFIG } from './utils.js';

document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', enviarContactoWhatsApp);
    }
});

function enviarContactoWhatsApp(e) {
    e.preventDefault();
    
    // Obtener datos del formulario
    const formData = new FormData(e.target);
    const nombre = formData.get('nombre').trim();
    const mensaje = formData.get('mensaje').trim();
    
    // Validación básica
    if (!nombre || !mensaje) {
        alert('Por favor, completa todos los campos');
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