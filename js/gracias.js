// Página de agradecimiento - mostrar monto total y funcionalidad de copiar alias
// Los datos de transferencia (entidad, titular, alias) salen de la configuración
// de Supabase (tabla settings) con los valores actuales como respaldo.

import { formatearPrecio, CONFIG_APP, cargarConfiguracionGlobal, mostrarNotificacion } from './utils.js';

document.addEventListener('DOMContentLoaded', async function () {
    await cargarConfiguracionGlobal();
    validarToken();
    mostrarMontoTotal();
    cargarDatosTransferencia();
});

// Validar que el acceso sea legítimo (vía token desde formulario.js)
function validarToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const storedToken = sessionStorage.getItem('order_token');

    if (!urlToken || !storedToken || urlToken !== storedToken) {
        window.location.href = 'index.html';
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

// Completar la tabla "Datos para Realizar la Transferencia" con la configuración
// remota. Antes el alias mostrado (alias.o.cbu) y el copiado (hola.mundo.2023)
// no coincidían; ahora ambos salen de la misma fuente (settings).
function cargarDatosTransferencia() {
    const entidad = document.getElementById('transferEntity');
    if (entidad) entidad.textContent = CONFIG_APP.transferEntity || '';

    const titular = document.getElementById('transferHolder');
    if (titular) titular.textContent = CONFIG_APP.transferHolder || '';

    const alias = document.getElementById('transferAlias');
    if (alias) alias.textContent = CONFIG_APP.transferAlias;
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