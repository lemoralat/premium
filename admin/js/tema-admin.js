// ============================================================================
// tema-admin.js — Dark mode del panel de administración.
//
// Script CLÁSICO (no module) cargado en el <head> de admin/index.html: aplica
// el tema ANTES del primer paint (sin flash al recargar).
//
// Reglas (requisito explícito):
//   - El panel SIEMPRE arranca en claro (light) por defecto.
//   - NUNCA detecta el tema del dispositivo: no usa matchMedia aquí.
//   - El tema lo elige el admin en Configuración → Apariencia del panel y se
//     guarda GLOBAL en la BD (settings.admin_tema, migración 0027).
//
// Como el boot es síncrono y la BD se lee async, este script usa localStorage
// solo como CACHÉ para no flashear: el último tema conocido se restaura al
// instante; admin-app.js luego lee settings.admin_tema (fuente de verdad) y
// reaplica con window.TemaPanel.aplicar(tema). Si nunca hubo caché, queda claro.
//
// Expone window.TemaPanel: aplicar(tema) / actual().
// ============================================================================
(function () {
    'use strict';

    var CLAVE = 'tema_admin';

    function leerCache() {
        try {
            var v = localStorage.getItem(CLAVE);
            return v === 'oscuro' ? 'oscuro' : 'claro'; // default: claro
        } catch (e) { }
        return 'claro';
    }

    function escribirCache(tema) {
        try { localStorage.setItem(CLAVE, tema); } catch (e) { /* noop */ }
    }

    function aplicar(tema) {
        var t = tema === 'oscuro' ? 'oscuro' : 'claro';
        document.documentElement.setAttribute('data-tema', t);
        escribirCache(t);
        // Avisa al resto del panel (gráficos/UI) por si algo debe reaccionar.
        try {
            window.dispatchEvent(new CustomEvent('lemora:tema-panel', { detail: t }));
        } catch (e) { /* noop */ }
        return t;
    }

    function actual() {
        return document.documentElement.getAttribute('data-tema') === 'oscuro'
            ? 'oscuro'
            : 'claro';
    }

    // Boot: restaurar caché antes del primer paint (o claro si no hay).
    document.documentElement.setAttribute('data-tema', leerCache());

    window.TemaPanel = {
        aplicar: aplicar,
        actual: actual
    };
})();