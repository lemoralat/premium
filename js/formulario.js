// Gestión del formulario de envío y WhatsApp

import { formatearPrecio, mostrarNotificacion, calcularTotales, obtenerCupones, obtenerUrlWhatsApp } from './utils.js';

// ============ CONFIGURACIÓN ============
const CONFIG_PEDIDOS = {
    // Proxy serverless en Vercel (api/pedido.js).
    // Inyecta la WEB_API_KEY desde la variable de entorno de Vercel:
    // la clave nunca viaja ni se almacena en el frontend.
    GOOGLE_SCRIPT_URL: '/api/pedido'
};

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('shippingForm');
    
    if (form) {
        form.addEventListener('submit', enviarPedidoWhatsApp);
    }
});

// ============ VALIDACIÓN DEL FORMULARIO DE PEDIDO ============
function validarDatos(datos) {
    // Limpiar errores previos
    document.querySelectorAll('#shippingForm .input-invalid').forEach(el => el.classList.remove('input-invalid'));
    document.querySelectorAll('#shippingForm .field-error').forEach(el => el.remove());

    const reglas = [
        { campo: 'nombre', valido: v => v.length >= 2, mensaje: 'Ingresá tu nombre completo (mínimo 2 caracteres)' },
        { campo: 'email', valido: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), mensaje: 'Ingresá un email válido (ej: nombre@dominio.com)' },
        { campo: 'telefono', valido: v => /^[0-9+\s()-]{7,20}$/.test(v), mensaje: 'Ingresá un teléfono válido (ej: 11 1234 5678)' },
        { campo: 'direccion', valido: v => v.length >= 2, mensaje: 'Ingresá tu dirección (mínimo 2 caracteres)' },
        { campo: 'ciudad', valido: v => v.length >= 2, mensaje: 'Ingresá tu ciudad (mínimo 2 caracteres)' },
        { campo: 'provincia', valido: v => v.length >= 2, mensaje: 'Ingresá tu provincia (mínimo 2 caracteres)' },
        { campo: 'codigoPostal', valido: v => /^[A-Za-z0-9]{4,5}$/.test(v), mensaje: 'Ingresá un código postal válido (4 o 5 caracteres alfanuméricos)' },
    ];

    let errores = 0;
    for (const regla of reglas) {
        if (!regla.valido(String(datos[regla.campo] || ''))) {
            errores++;
            const input = document.getElementById(regla.campo);
            if (!input) continue;
            input.classList.add('input-invalid');
            const group = input.closest('.form-group');
            if (!group) continue;
            const p = document.createElement('p');
            p.className = 'field-error';
            p.textContent = regla.mensaje;
            group.appendChild(p);
        }
    }

    if (errores > 0) {
        const primerError = document.querySelector('#shippingForm .input-invalid');
        if (primerError) primerError.focus();
        return false;
    }
    return true;
}

// ============ ENVÍO DEL PEDIDO ============
async function enviarPedidoWhatsApp(e) {
    e.preventDefault();

    // Activar animación de carga en el botón
    const btnSubmit = e.target.querySelector('.submit-btn');
    if (btnSubmit) btnSubmit.classList.add('loading');

    // Obtener datos del formulario
    const formData = new FormData(e.target);
    const text = (n) => String(formData.get(n) || '').trim();
    const datosCliente = {
        nombre: text('nombre'),
        email: text('email'),
        telefono: text('telefono'),
        direccion: text('direccion'),
        ciudad: text('ciudad'),
        provincia: text('provincia'),
        codigoPostal: text('codigoPostal'),
        notas: text('notas') || 'Sin notas adicionales'
    };

    // Obtener productos del carrito
    const cart = JSON.parse(localStorage.getItem('cart')) || [];

    if (cart.length === 0) {
        alert('Tu carrito está vacío');
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    // Validar datos del cliente antes de enviar
    if (!validarDatos(datosCliente)) {
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    // Abrir la ventana de WhatsApp ANTES de cualquier await:
    // la "user activation" del click se pierde al cruzar un await y los navegadores
    // bloquean el window.open posterior como popup
    const ventanaWhatsApp = window.open('', '_blank');

    try {
        // Obtener cupón aplicado
        const cupon = sessionStorage.getItem('appliedCoupon');

        // Asegurar que los cupones estén cargados para el cálculo final
        await obtenerCupones();

        // Calcular totales con cupón
        const { subtotal, descuento, total, esCupon, porcentaje } = calcularTotales(cart, cupon);

        // Guardar el total en localStorage para mostrarlo en la página de gracias
        localStorage.setItem('orderTotal', total.toString());

        // Generar token único para proteger la página de gracias
        const token = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        sessionStorage.setItem('order_token', token);

        // ============ ENVIAR A GOOGLE SHEETS ============
        await enviarPedidoGoogleSheets({
            cliente: datosCliente,
            productos: cart,
            subtotal: subtotal,
            descuento: descuento,
            porcentaje: porcentaje,
            cupon: esCupon ? cupon : 'NINGUNO',
            total: total,
            token: token
        });

        // ============ ENVIAR POR WHATSAPP ============
        const urlWhatsApp = construirUrlWhatsApp(datosCliente, cart, subtotal, descuento, total, esCupon ? cupon : null);

        if (ventanaWhatsApp) {
            ventanaWhatsApp.location.href = urlWhatsApp;
        } else {
            // Popup bloqueado: ofrecer el enlace manualmente y no redirigir aún
            mostrarFallbackWhatsApp(urlWhatsApp, token);
            return;
        }

        // Limpiar carrito y redirigir a página de gracias
        localStorage.removeItem('cart');
        sessionStorage.removeItem('appliedCoupon');

        // Redirigir a la página de agradecimiento con el token
        window.location.href = `gracias.html?token=${token}`;
    } finally {
        if (btnSubmit) btnSubmit.classList.remove('loading');
    }
}

// ============ ENVIAR PEDIDO A GOOGLE SHEETS ============
async function enviarPedidoGoogleSheets(pedido) {
    try {
        const response = await fetch(CONFIG_PEDIDOS.GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pedido)
        });

        const resultado = await response.json();

        if (resultado.status === 'success') {
            console.log('✅ Pedido registrado en Google Sheets');
        } else {
            console.warn('⚠️ El backend rechazó el pedido:', resultado.message);
            mostrarNotificacion(`❌ ${resultado.message || 'No se pudo registrar el pedido.'}`, 'error');
        }

    } catch (error) {
        console.error('❌ Error al registrar el pedido:', error);
        mostrarNotificacion('❌ Error al registrar el pedido. Por favor, inténtalo de nuevo o contáctanos por WhatsApp.', 'error');
        // No bloqueamos el proceso si falla Google Sheets
        // El pedido se enviará igualmente por WhatsApp
    }
}

// ============ CONSTRUIR URL DE WHATSAPP ============
function construirUrlWhatsApp(datos, cart, subtotal, descuento, total, cupon) {
    // Construir mensaje para WhatsApp
    let mensaje = `*NUEVO PEDIDO*\n\n`;
    mensaje += `*Datos del Cliente:*\n`;
    mensaje += `Nombre: ${datos.nombre}\n`;
    mensaje += `Email: ${datos.email}\n`;
    mensaje += `Teléfono: ${datos.telefono}\n\n`;
    
    mensaje += `*Dirección de Envío:*\n`;
    mensaje += `Calle: ${datos.direccion}\n`;
    mensaje += `Ciudad: ${datos.ciudad}\n`;
    mensaje += `Provincia: ${datos.provincia}\n`;
    mensaje += `Código Postal: ${datos.codigoPostal}\n\n`;
    
    mensaje += `*Productos:*\n`;
    cart.forEach((item, index) => {
        const variante = item.varianteTexto ? ` [${String(item.varianteTexto).replace(/[\r\n]+/g, ' ')}]` : '';
        mensaje += `${index + 1}. ${item.nombre}${variante}\n`;
        mensaje += `   Cantidad: ${item.quantity}\n`;
        mensaje += `   Precio unitario: $${formatearPrecio(item.precio)}\n`;
        mensaje += `   Subtotal: $${formatearPrecio(item.precio * item.quantity)}\n\n`;
    });
    
    if (descuento > 0) {
        mensaje += `*Subtotal: $${formatearPrecio(subtotal)}*\n`;
        const etiqueta = cupon ? `Cupón (${cupon})` : 'Descuento Automático';
        mensaje += `*${etiqueta}: -$${formatearPrecio(descuento)}*\n`;
    }
    mensaje += `*TOTAL: $${formatearPrecio(total)}*\n\n`;
    mensaje += `*Notas adicionales:*\n${datos.notas}`;
    
    // Crear URL de WhatsApp con la función centralizada de utils.js
    return obtenerUrlWhatsApp(mensaje);
}

// ============ FALLBACK SI EL POPUP ESTÁ BLOQUEADO ============
function mostrarFallbackWhatsApp(urlWhatsApp, token) {
    const overlay = document.createElement('div');
    overlay.className = 'confirmacion-overlay emergencia';

    const modal = document.createElement('div');
    modal.className = 'confirmacion-modal';

    const enlace = document.createElement('a');
    enlace.href = urlWhatsApp;
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.className = 'confirmacion-btn verde';
    enlace.textContent = 'Abrir WhatsApp';

    const continuar = document.createElement('button');
    continuar.className = 'confirmacion-btn';
    continuar.textContent = 'Continuar al resumen';
    continuar.addEventListener('click', () => {
        localStorage.removeItem('cart');
        sessionStorage.removeItem('appliedCoupon');
        window.location.href = `gracias.html?token=${token}`;
    });

    modal.innerHTML = `
        <div class="confirmacion-icon">⚠️</div>
        <h2 class="confirmacion-title">Tu navegador bloqueó WhatsApp</h2>
        <p class="confirmacion-text">
            El pedido ya fue registrado. Hacé clic en el botón verde para enviarlo por WhatsApp.
        </p>
    `;
    modal.appendChild(enlace);
    modal.appendChild(document.createElement('br'));
    modal.appendChild(continuar);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}