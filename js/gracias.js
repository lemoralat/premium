// Página de agradecimiento - mostrar monto total y funcionalidad de copiar alias
// Los datos de transferencia (entidad, titular, alias) salen de la configuración
// de Supabase (tabla settings) con los valores actuales como respaldo.

import { formatearPrecio, CONFIG_APP, cargarConfiguracionGlobal, mostrarNotificacion } from './utils.js';

document.addEventListener('DOMContentLoaded', async function () {
    await cargarConfiguracionGlobal();
    validarToken();
    mostrarMontoTotal();
    renderizarInfoBox();
    cargarDatosTransferencia();
});

// Validar que el acceso sea legítimo (vía token desde formulario.js)
function validarToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const storedToken = sessionStorage.getItem('order_token');

    if (!urlToken || !storedToken || urlToken !== storedToken) {
        window.location.href = '/';
        return;
    }

    sessionStorage.removeItem('order_token');
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