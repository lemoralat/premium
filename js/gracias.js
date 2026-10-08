// Página de agradecimiento - mostrar monto total y funcionalidad de copiar alias
// Los datos de transferencia (entidad, titular, alias) salen de la configuración
// de Supabase (tabla settings) con los valores actuales como respaldo.

import { formatearPrecio, CONFIG_APP, cargarConfiguracionGlobal, mostrarNotificacion, esModoTurnos, escaparHtml } from './utils.js';

document.addEventListener('DOMContentLoaded', async function () {
    await cargarConfiguracionGlobal();

    // `validarToken` devuelve true si la página vino de una solicitud de turno
    // (?tipo=turno). En ese caso (o si el sitio está en modo turnos) la página
    // se adapta: sin montos, sin transferencia y con el resumen de la solicitud.
    const esTurno = validarToken();
    if (esTurno || esModoTurnos()) {
        configurarGraciasTurno();
    } else {
        mostrarMontoTotal();
        renderizarInfoBox();
        cargarDatosTransferencia();
    }
});

// Validar que el acceso sea legítimo (vía token desde formulario.js).
// En el flujo de turnos el token se guarda aparte (turno_token) y la URL
// llega con ?tipo=turno.
function validarToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const esTurno = urlParams.get('tipo') === 'turno';
    const storedToken = sessionStorage.getItem(esTurno ? 'turno_token' : 'order_token');

    if (!urlToken || !storedToken || urlToken !== storedToken) {
        window.location.href = '/';
        return false;
    }

    sessionStorage.removeItem(esTurno ? 'turno_token' : 'order_token');
    return esTurno;
}

// Adaptar la página de gracias al modo turnos: sin montos ni transferencia;
// el título y el mensaje cambian y se muestra el resumen de la solicitud
// (número TRN-####, fecha y hora preferidas) guardado por formulario.js.
function configurarGraciasTurno() {
    const h1 = document.getElementById('graciasTituloPrincipal');
    if (h1) h1.textContent = '¡Solicitud Recibida con Éxito!';

    const msg = document.getElementById('graciasMensajePrincipal');
    if (msg) msg.textContent = 'Gracias por tu solicitud. Te confirmaremos tu turno por WhatsApp.';

    // Las secciones de venta no aplican en este flujo.
    const infoBox = document.getElementById('infoBox');
    if (infoBox) infoBox.hidden = true;
    const paymentSection = document.getElementById('paymentSection');
    if (paymentSection) paymentSection.hidden = true;
    const amountBox = document.getElementById('amountBox');
    if (amountBox) amountBox.hidden = true;

    // Resumen de la solicitud: lo que guardó formulario.js (desde la respuesta
    // de insertar_turno, no del formulario del cliente).
    const resumen = document.getElementById('turnoResumen');
    if (!resumen) return;

    let datos = null;
    try {
        datos = JSON.parse(localStorage.getItem('turnoInfo') || 'null');
    } catch {
        datos = null;
    }

    if (!datos) {
        resumen.hidden = true;
        return;
    }

    const elNumero = document.getElementById('turnoNumero');
    if (elNumero) elNumero.textContent = datos.numero || '—';
    const elFecha = document.getElementById('turnoFechaConfirmada');
    if (elFecha) elFecha.textContent = datos.fecha || '—';
    const elHora = document.getElementById('turnoHoraConfirmada');
    if (elHora) elHora.textContent = datos.hora || 'A coordinar';

    // Ítems solicitados (migración 0053): snapshot del carrito que venía en la
    // respuesta de insertar_turno (fuente de verdad), guardado por
    // formulario.js en turnoInfo.
    const lista = document.getElementById('turnoItemsList');
    const wrap = document.getElementById('turnoItemsWrap');
    const items = Array.isArray(datos.items) ? datos.items : [];
    if (wrap) wrap.hidden = items.length === 0;
    if (lista && items.length) {
        lista.innerHTML = items.map((item) => {
            const nombre = escaparHtml(String(item.nombre || '').trim());
            const variante = item.variante_texto
                ? ` <span class="turno-item-variante">(${escaparHtml(String(item.variante_texto).trim())})</span>`
                : '';
            const cantidad = Number(item.cantidad) || 0;
            const precio = Number(item.precio_unitario) || 0;
            const subtotal = precio > 0 ? ` — <strong>$${formatearPrecio(precio * cantidad)}</strong>` : '';
            const multiplicador = cantidad > 1 ? ` × ${cantidad}` : '';
            return `<li>${nombre}${variante}${multiplicador}${subtotal}</li>`;
        }).join('');
    }

    // Total estimado recalculado del lado del servidor (0 = no informado).
    const total = Number(datos.total) || 0;
    const lineaTotal = document.getElementById('turnoTotalLine');
    if (lineaTotal) lineaTotal.hidden = !(total > 0);
    const valorTotal = document.getElementById('turnoTotalValue');
    if (valorTotal) valorTotal.textContent = `$${formatearPrecio(total)}`;

    resumen.hidden = false;
}

// Mostrar el monto total del pedido
function mostrarMontoTotal() {
    const totalAmountElement = document.getElementById('totalAmount');

    if (!totalAmountElement) return;

    // Obtener el total del localStorage (guardado desde el formulario)
    const orderTotal = localStorage.getItem('orderTotal');

    if (orderTotal) {
        const total = parseFloat(orderTotal);
        totalAmountElement.textContent = `$${formatearPrecio(total)}`;
    } else {
        // Si no hay total guardado, calcular del carrito
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const total = cart.reduce((sum, item) => sum + (item.precio * item.quantity), 0);
        totalAmountElement.textContent = `$${formatearPrecio(total)}`;
    }
}

// Cuadro "Próximos Pasos": título y texto salen de settings (Configuración →
// Datos para la transferencia), con lo que la página mostraba siempre como
// default. Se escribe con textContent + white-space: pre-line, así que el
// admin puede poner saltos de línea sin poder inyectar HTML.
//
// Vacíos (a propósito, para poder sacar el cuadro sin tocar código):
//   - texto vacío  → se oculta el cuadro entero.
//   - título vacío → se oculta solo el h2, queda el párrafo.
function renderizarInfoBox() {
    const box = document.getElementById('infoBox');
    if (!box) return;

    const titulo = document.getElementById('graciasTitulo');
    const texto = document.getElementById('graciasTexto');

    const t = (CONFIG_APP.graciasTexto || '').trim();
    if (!t) {
        box.hidden = true;
        return;
    }

    if (titulo) {
        const h = (CONFIG_APP.graciasTitulo || '').trim();
        titulo.textContent = h;
        titulo.hidden = !h;
    }
    if (texto) texto.textContent = t;
}

// Completar la tabla "Datos para Realizar la Transferencia" con la configuración
// remota: el alias mostrado y el copiado salen de la misma fuente (settings).
//
// El bloque se oculta entero si no hay Alias CBU configurado: sin alias no hay
// cuenta a la que transferir, y es la forma de cobrar por otro medio sin que
// quede una tabla con una celda vacía. La entidad y el titular van sueltos en
// la misma tarjeta, pero no alcanzan para mostrar el bloque — el alias es el
// dato que el cliente necesita para transferir.
function cargarDatosTransferencia() {
    const aliasCbu = (CONFIG_APP.transferAlias || '').trim();

    const seccion = document.getElementById('paymentSection');
    if (seccion) {
        seccion.hidden = !aliasCbu;
        if (!aliasCbu) return; // no hay cuenta: no se completa la tabla
    }

    const entidad = document.getElementById('transferEntity');
    if (entidad) entidad.textContent = CONFIG_APP.transferEntity || '';

    const titular = document.getElementById('transferHolder');
    if (titular) titular.textContent = CONFIG_APP.transferHolder || '';

    const alias = document.getElementById('transferAlias');
    if (alias) alias.textContent = aliasCbu;
}

// Exponer a window para el onclick del HTML
window.copiarAlias = function () {
    const alias = CONFIG_APP.transferAlias || '';
    const copyBtn = document.querySelector('.copy-btn');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(alias)
            .then(() => mostrarExitoCopia(copyBtn))
            .catch(() => copiarConFallback(alias, copyBtn));
    } else {
        copiarConFallback(alias, copyBtn);
    }
};

// Método alternativo para copiar (fallback)
function copiarConFallback(text, btn) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
        document.execCommand('copy');
        mostrarExitoCopia(btn);
    } catch (err) {
        mostrarNotificacion('No se pudo copiar el alias. Por favor, cópialo manualmente: ' + text, 'error');
    }

    document.body.removeChild(textArea);
}

// Mostrar feedback visual al copiar
function mostrarExitoCopia(btn) {
    const originalText = btn.textContent;
    btn.textContent = '¡Copiado!';
    btn.classList.add('copied');

    setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
    }, 2000);
}