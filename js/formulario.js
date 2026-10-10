// Gestión del formulario de envío y WhatsApp

import { formatearPrecio, mostrarNotificacion, estadoCompraMinima, obtenerUrlWhatsApp } from './utils.js';

// ============ CONFIGURACIÓN ============
const CONFIG_PEDIDOS = {
    // api/pedido.js registra el pedido en Supabase con la service role key del
    // lado servidor: el frontend sigue sin manejar claves.
    API_PEDIDO_URL: '/api/pedido',
    // api/turno.js registra las solicitudes de turno (modo turnos) con el mismo
    // criterio: service_role solo del lado servidor.
    API_TURNO_URL: '/api/turno'
};

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('shippingForm');
    
    if (form) {
        form.addEventListener('submit', enviarPedidoWhatsApp);
    }

    // Modo turnos: el formulario de solicitud de /carrito tiene su propio
    // flujo. Solo existe en la página cuando el modo lo activa.
    const turnoForm = document.getElementById('turnoFormulario');
    if (turnoForm) {
        turnoForm.addEventListener('submit', enviarSolicitudTurno);
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
        { campo: 'codigoPostal', valido: v => /^[A-Za-z0-9]{1,10}$/.test(v), mensaje: 'Ingresá un código postal válido (letras y números)' },
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

// ============ VALIDACIÓN DEL FORMULARIO DE TURNO (modo turnos) ============
// Misma mecánica que validarDatos, pero las reglas apuntan a las IDs propias
// del formulario de solicitud (#turnoFormulario) porque la página puede tener
// ambos formularios cargados.
function validarDatosTurno(datos) {
    document.querySelectorAll('#turnoFormulario .input-invalid').forEach(el => el.classList.remove('input-invalid'));
    document.querySelectorAll('#turnoFormulario .field-error').forEach(el => el.remove());

    const reglas = [
        { campo: 'turnoNombre', valido: v => v.length >= 2, mensaje: 'Ingresá tu nombre completo (mínimo 2 caracteres)' },
        { campo: 'turnoTelefono', valido: v => /^[\d\s+\-()]+$/.test(v) && v.replace(/\D/g, '').length >= 7, mensaje: 'Ingresá un teléfono válido (mínimo 7 dígitos)' },
        { campo: 'turnoEmail', valido: v => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), mensaje: 'Ingresá un email válido' },
        { campo: 'turnoFecha', valido: v => v !== '', mensaje: 'Elegí una fecha preferida' },
        { campo: 'turnoHora', valido: v => v !== '', mensaje: 'Elegí una hora preferida' }
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
        const primerError = document.querySelector('#turnoFormulario .input-invalid');
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

    // Honeypot anti-bots: el campo oculto "website" debe venir vacío. Si un bot
    // lo completó, se abandona el envío en silencio (sin abrir WhatsApp ni
    // registrar pedido) y se ahorra procesamiento hasta el servidor.
    const botAtrapado = text('website') !== '';
    if (botAtrapado) {
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

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
        mostrarNotificacion('Tu carrito está vacío', 'error');
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    // Validar datos del cliente antes de enviar
    if (!validarDatos(datosCliente)) {
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    // Validar compra mínima (mismo criterio que el carrito): si no se cumple,
    // no se abre WhatsApp ni se registra el pedido.
    const min = estadoCompraMinima(cart);
    if (!min.cumple) {
        mostrarNotificacion(min.mensaje, 'error');
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    // Cupón aplicado en el carrito (ya validado contra `coupons` al aplicarlo).
    // Se manda tal cual: el RPC decide si corresponde (que esté activo, que no
    // haya vencido y que supere al descuento automático).
    const cupon = sessionStorage.getItem('appliedCoupon') || '';

    // Generar token único para proteger la página de gracias
    const token = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    sessionStorage.setItem('order_token', token);

    // Abrir la ventana de WhatsApp ANTES de cualquier await:
    // la "user activation" del click se pierde al cruzar un await y los navegadores
    // bloquean el window.open posterior como popup
    const ventanaWhatsApp = window.open('', '_blank');

    // ============ REGISTRAR PEDIDO (api/pedido) ============
    // NO se mandan montos calculados: api/pedido.js los ignora y el RPC los
    // recalcula contra `products`. La respuesta del servidor es la única fuente
    // de verdad para el mensaje de WhatsApp y para la página de gracias.
    let pedido;
    try {
        pedido = await enviarPedidoAPI({
            cliente: datosCliente,
            productos: cart,
            cupon: cupon,
            token: token
        });
    } catch (error) {
        // El pedido NO quedó registrado. Armar igual el mensaje con el carrito
        // del cliente sería mandarle al vendedor un pedido que no existe en la
        // BD, así que se aborta: se cierra la ventana en blanco, se conserva el
        // carrito y no se redirige. El usuario reintenta sin perder nada.
        console.error('❌ Error al registrar el pedido:', error);
        if (ventanaWhatsApp) ventanaWhatsApp.close();
        sessionStorage.removeItem('order_token');
        mostrarNotificacion(error.message, 'error');
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    try {
        // El monto de la página de gracias también sale del servidor, para que
        // el cliente transfiera exactamente lo que quedó registrado.
        localStorage.setItem('orderTotal', Number(pedido.total).toString());

        // ============ ENVIAR POR WHATSAPP ============
        // Todo el mensaje se arma con la respuesta del servidor: los ítems
        // vienen de `order_items` (migración 0028) y los montos, recalculados
        // por el RPC.
        //
        // Sin número configurado, obtenerUrlWhatsApp() devuelve '' (el pedido ya
        // quedó registrado vía API): se cierra la ventana en blanco y se sigue
        // a la página de gracias sin abrir un link roto.
        const urlWhatsApp = construirUrlWhatsApp(datosCliente, pedido, cart);

        if (urlWhatsApp && ventanaWhatsApp) {
            ventanaWhatsApp.location.href = urlWhatsApp;
        } else if (urlWhatsApp) {
            // Popup bloqueado: ofrecer el enlace manualmente y no redirigir aún
            mostrarFallbackWhatsApp(urlWhatsApp, token);
            return;
        } else if (ventanaWhatsApp) {
            ventanaWhatsApp.close();
        }

        // Limpiar carrito y redirigir a página de gracias
        localStorage.removeItem('cart');
        sessionStorage.removeItem('appliedCoupon');

        // Redirigir a la página de agradecimiento con el token
        window.location.href = `/gracias?token=${token}`;
    } finally {
        if (btnSubmit) btnSubmit.classList.remove('loading');
    }
}

// ============ ENVIAR PEDIDO ============
// Devuelve la respuesta del servidor (montos e ítems ya recalculados contra la
// BD) o lanza. Antes se tragaba los errores y dejaba seguir el flujo como si el
// pedido se hubiera registrado: el mensaje de WhatsApp describía un pedido que
// no estaba en la base y el stock nunca se había descontado.
async function enviarPedidoAPI(pedido) {
    let response;
    try {
        response = await fetch(CONFIG_PEDIDOS.API_PEDIDO_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pedido)
        });
    } catch (error) {
        // Fallo de red: no hay respuesta y el estado del pedido es desconocido.
        console.error('❌ No se pudo contactar al servidor:', error);
        throw new Error('No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
    }

    let resultado;
    try {
        resultado = await response.json();
    } catch (error) {
        console.error('❌ Respuesta ilegible del servidor:', error);
        throw new Error('El servidor devolvió una respuesta inesperada. Intentá de nuevo en un momento.');
    }

    if (!response.ok || resultado?.status !== 'success') {
        // api/pedido.js ya filtra qué mensajes expone (solo los de negocio:
        // stock, mínimos, cupón, límites de tasa), así que se puede mostrar.
        throw new Error(resultado?.message || 'No se pudo registrar el pedido. Intentá de nuevo en un momento.');
    }

    console.log('✅ Pedido registrado:', resultado.numero);
    return resultado;
}

// ============ ENVÍO DE SOLICITUD DE TURNO (modo turnos) ============
// Registra la solicitud en api/turno.js (→ RPC insertar_turno) y la envía por
// WhatsApp. La respuesta del servidor es la única fuente de verdad para el
// mensaje: el número (TRN-####), la fecha/hora y el servicio salen de la base.
async function enviarSolicitudTurno(e) {
    e.preventDefault();

    const btnSubmit = e.target.querySelector('.submit-btn');
    if (btnSubmit) btnSubmit.classList.add('loading');

    const formData = new FormData(e.target);
    const text = (n) => String(formData.get(n) || '').trim();

    // Honeypot anti-bots: mismo criterio que el pedido (cliente y servidor).
    if (text('website') !== '') {
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    const datosTurno = {
        turnoNombre: text('nombre'),
        turnoTelefono: text('telefono'),
        turnoEmail: text('email'),
        turnoFecha: text('fecha'),
        turnoHora: text('hora'),
        turnoNotas: text('notas')
    };

    if (!validarDatosTurno(datosTurno)) {
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    // Los servicios a registrar son los del carrito (migración 0053): el turno
    // se pide con lo que el cliente eligió, igual que un pedido. Sin carrito no
    // hay solicitud.
    const carrito = JSON.parse(localStorage.getItem('cart')) || [];
    if (carrito.length === 0) {
        mostrarNotificacion('Tu carrito está vacío. Agregá los servicios que querés reservar.', 'error');
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    // Snapshot de cada línea del carrito. insertar_turno lo normaliza y valida
    // del lado del servidor (id, nombre, variante_texto, cantidad, precio_unitario).
    const items = carrito.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        variante_texto: item.varianteTexto || '',
        cantidad: Number(item.quantity) || 1,
        precio_unitario: Number(item.precio) || 0
    }));

    // Token único para proteger la página de gracias (idempotencia del RPC).
    const token = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    sessionStorage.setItem('turno_token', token);

    // Abrir la ventana de WhatsApp ANTES de cualquier await (user activation).
    const ventanaWhatsApp = window.open('', '_blank');

    let respuesta;
    try {
        respuesta = await enviarTurnoAPI({
            cliente: {
                nombre: datosTurno.turnoNombre,
                telefono: datosTurno.turnoTelefono,
                email: datosTurno.turnoEmail
            },
            fecha: datosTurno.turnoFecha,
            hora: datosTurno.turnoHora,
            items: items,
            notas: datosTurno.turnoNotas || 'Sin notas adicionales',
            token: token
        });
    } catch (error) {
        // La solicitud NO quedó registrada: se aborta (mismo criterio que el
        // pedido: no se anuncia al vendedor algo que no existe en la base).
        console.error('❌ Error al registrar la solicitud de turno:', error);
        if (ventanaWhatsApp) ventanaWhatsApp.close();
        sessionStorage.removeItem('turno_token');
        mostrarNotificacion(error.message, 'error');
        if (btnSubmit) btnSubmit.classList.remove('loading');
        return;
    }

    try {
        // Datos para la confirmación de la página de gracias (modo turnos).
        // `items` y `total` vienen normalizados de la respuesta de insertar_turno
        // (fuente de verdad de la base, no del carrito local).
        localStorage.setItem('turnoInfo', JSON.stringify({
            numero: respuesta.numero,
            fecha: respuesta.fecha,
            hora: respuesta.hora,
            items: Array.isArray(respuesta.items) ? respuesta.items : items,
            total: Number(respuesta.total) || 0
        }));

        // Todo el mensaje sale de la respuesta del servidor (insertar_turno).
        const urlWhatsApp = construirUrlWhatsAppTurno(datosTurno, respuesta);

        if (urlWhatsApp && ventanaWhatsApp) {
            ventanaWhatsApp.location.href = urlWhatsApp;
        } else if (urlWhatsApp) {
            // Popup bloqueado: ofrecer el enlace manualmente y no redirigir aún.
            mostrarFallbackWhatsApp(urlWhatsApp, token, 'turno');
            return;
        } else if (ventanaWhatsApp) {
            ventanaWhatsApp.close();
        }

        // La solicitud ya quedó registrada con el snapshot de ítems: se vacía
        // el carrito y se redirige a la página de gracias.
        localStorage.removeItem('cart');
        sessionStorage.removeItem('appliedCoupon');
        window.location.href = `/gracias?token=${token}&tipo=turno`;
    } finally {
        if (btnSubmit) btnSubmit.classList.remove('loading');
    }
}

// Devuelve la respuesta del servidor (número, fecha, hora, producto ya
// registrados en la base) o lanza. Filtra los mismos errores de negocio que el
// flujo de pedido: solo muestra los que api/turno.js decide exponer.
async function enviarTurnoAPI(turno) {
    let response;
    try {
        response = await fetch(CONFIG_PEDIDOS.API_TURNO_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(turno)
        });
    } catch (error) {
        console.error('❌ No se pudo contactar al servidor:', error);
        throw new Error('No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
    }

    let resultado;
    try {
        resultado = await response.json();
    } catch (error) {
        console.error('❌ Respuesta ilegible del servidor:', error);
        throw new Error('El servidor devolvió una respuesta inesperada. Intentá de nuevo en un momento.');
    }

    if (!response.ok || resultado?.status !== 'success') {
        throw new Error(resultado?.message || 'No se pudo registrar la solicitud. Intentá de nuevo en un momento.');
    }

    console.log('✅ Solicitud de turno registrada:', resultado.numero);
    return resultado;
}

// ============ CONSTRUIR URL DE WHATSAPP ============
// `pedido` es la respuesta de `insertar_pedido`: todo lo que se imprime acá
// sale de la base, no del carrito del cliente. `pedido.items` viene de
// `order_items` (migración 0028) y los montos fueron recalculados por el RPC
// contra `products`.
function construirUrlWhatsApp(datos, pedido, cart) {
    const total     = Number(pedido.total) || 0;
    const subtotal  = Number(pedido.subtotal) || 0;
    const descuento = Number(pedido.descuento) || 0;
    const cupon     = pedido.cupon && pedido.cupon !== 'NINGUNO' ? pedido.cupon : null;

    // Los ítems tienen que ser los del servidor. Si la 0028 todavía no está
    // aplicada, `items` no llega y se cae al carrito local solo para las líneas
    // (los montos igual son los del servidor) en vez de dejar al cliente sin
    // salida; el aviso en consola deja claro que falta aplicar la migración.
    let items = Array.isArray(pedido.items) ? pedido.items : [];
    if (items.length === 0) {
        console.warn('⚠️ El servidor no devolvió los ítems del pedido (falta aplicar la migración 0028). Se usan los del carrito para las líneas.');
        items = Array.isArray(cart) ? cart : [];
    }

    // Construir mensaje para WhatsApp
    let mensaje = `*NUEVO PEDIDO*\n\n`;
    if (pedido.numero) mensaje += `N° de pedido: ${pedido.numero}\n\n`;
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
    items.forEach((item, index) => {
        // `order_items` usa snake_case; el carrito local, camelCase.
        const varianteTexto = item.variante_texto ?? item.varianteTexto;
        const precio = Number(item.precio_unitario ?? item.precio) || 0;
        const cantidad = Number(item.quantity) || 0;
        const variante = varianteTexto ? ` [${String(varianteTexto).replace(/[\r\n]+/g, ' ')}]` : '';
        mensaje += `${index + 1}. ${item.nombre}${variante}\n`;
        mensaje += `   Cantidad: ${cantidad}\n`;
        mensaje += `   Precio unitario: $${formatearPrecio(precio)}\n`;
        mensaje += `   Subtotal: $${formatearPrecio(precio * cantidad)}\n\n`;
    });
    
    if (descuento > 0) {
        mensaje += `*Subtotal: $${formatearPrecio(subtotal)}*\n`;
        const etiqueta = cupon ? `Cupón (${cupon})` : 'Descuento Automático';
        const pct = Number(pedido.porcentaje) || 0;
        mensaje += pct > 0
            ? `*${etiqueta} (${pct}%): -$${formatearPrecio(descuento)}*\n`
            : `*${etiqueta}: -$${formatearPrecio(descuento)}*\n`;
    }
    mensaje += `*TOTAL: $${formatearPrecio(total)}*\n\n`;
    mensaje += `*Notas adicionales:*\n${datos.notas}`;
    
    // Crear URL de WhatsApp con la función centralizada de utils.js
    return obtenerUrlWhatsApp(mensaje);
}

// ============ CONSTRUIR URL DE WHATSAPP DEL TURNO ============
// `respuesta` es la respuesta de `insertar_turno`: el número, la fecha, la
// hora, los ítems y el total salen de la base, no del formulario del cliente.
// `respuesta.items` es el snapshot normalizado de los servicios solicitados
// (id, nombre, variante_texto, cantidad, precio_unitario) y `respuesta.total`
// el total recalculado del lado del servidor (migración 0053).
function construirUrlWhatsAppTurno(datos, respuesta) {
    const items = Array.isArray(respuesta.items) ? respuesta.items : [];
    const total = Number(respuesta.total) || 0;

    let mensaje = `*NUEVA SOLICITUD DE TURNO*\n\n`;
    if (respuesta.numero) mensaje += `N° de solicitud: ${respuesta.numero}\n\n`;
    mensaje += `*Datos del Cliente:*\n`;
    mensaje += `Nombre: ${datos.turnoNombre}\n`;
    mensaje += `Teléfono: ${datos.turnoTelefono}\n`;
    if (datos.turnoEmail) mensaje += `Email: ${datos.turnoEmail}\n\n`;

    mensaje += `*Cita solicitada:*\n`;
    mensaje += `Fecha: ${respuesta.fecha || datos.turnoFecha}\n`;
    // La hora es obligatoria (form + servidor): siempre viene de la base.
    mensaje += `Hora: ${respuesta.hora}\n\n`;

    if (items.length === 0) {
        const producto = respuesta.producto;
        if (producto && producto.nombre) mensaje += `*Servicio:* ${producto.nombre}\n\n`;
    } else {
        mensaje += `*Servicios (del carrito):*\n`;
        items.forEach((item, index) => {
            const nombre = String(item.nombre || '').replace(/[\r\n]+/g, ' ');
            const variante = item.variante_texto ? ` [${String(item.variante_texto).replace(/[\r\n]+/g, ' ')}]` : '';
            const cantidad = Number(item.cantidad) || 0;
            const precio = Number(item.precio_unitario) || 0;
            mensaje += `${index + 1}. ${nombre}${variante}\n`;
            mensaje += `   Cantidad: ${cantidad}\n`;
            if (precio > 0) {
                mensaje += `   Precio unitario: $${formatearPrecio(precio)}\n`;
                mensaje += `   Subtotal: $${formatearPrecio(precio * cantidad)}\n`;
            }
        });
        if (total > 0) mensaje += `\n*Total estimado: $${formatearPrecio(total)}*\n\n`;
    }

    mensaje += `*Notas:*\n${datos.turnoNotas}`;

    return obtenerUrlWhatsApp(mensaje);
}

// ============ FALLBACK SI EL POPUP ESTÁ BLOQUEADO ============
// `tipo` es 'pedido' (flujo de compra) o 'turno' (solicitud de turno): cambia
// el texto, qué estado se limpia y a dónde va el botón "Continuar".
function mostrarFallbackWhatsApp(urlWhatsApp, token, tipo = 'pedido') {
    const esTurno = tipo === 'turno';
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
    continuar.textContent = esTurno ? 'Continuar a la confirmación' : 'Continuar al resumen';
    continuar.addEventListener('click', () => {
        if (!esTurno) {
            localStorage.removeItem('cart');
            sessionStorage.removeItem('appliedCoupon');
            window.location.href = `/gracias?token=${token}`;
        } else {
            // El turno ya quedó registrado con el snapshot de ítems (ver
            // enviarSolicitudTurno): se vacía el carrito antes de continuar.
            localStorage.removeItem('cart');
            sessionStorage.removeItem('appliedCoupon');
            window.location.href = `/gracias?token=${token}&tipo=turno`;
        }
    });

    modal.innerHTML = `
        <div class="confirmacion-icon">⚠️</div>
        <h2 class="confirmacion-title">Tu navegador bloqueó WhatsApp</h2>
        <p class="confirmacion-text">
            ${esTurno
                ? 'La solicitud ya fue registrada. Hacé clic en el botón verde para enviarla por WhatsApp.'
                : 'El pedido ya fue registrado. Hacé clic en el botón verde para enviarlo por WhatsApp.'}
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