// ============================================================================
// tema-admin.js — Dark mode del panel de administración.
//
// Script CLÁSICO (no module) cargado en el <head> de admin/index.html: aplica
// el tema ANTES del primer paint (sin flash al recargar).
//
// Reglas (requisito explícito):
//   - El panel SIEMPRE arranca en claro (light) por defecto.
//   - NUNCA detecta el tema del dispositivo: no usa matchMedia aquí.
//   - El tema lo elige el admin con el switch del topbar (junto al badge
//     Admin) y se guarda GLOBAL en la BD (settings.admin_tema, migración 0027).
//
// Como el boot es síncrono y la BD se lee async, este script usa localStorage
// solo como CACHÉ para no flashear: el último tema conocido se restaura al
// instante; admin-app.js luego lee settings.admin_tema (fuente de verdad) y
// reaplica con window.TemaPanel.aplicar(tema). Si nunca hubo caché, queda claro.
//
// Valores internos: 'oscuro' / 'claro' (los que usa la BD y la caché).
// Atributo en <html>: data-tema="dark" / "light" (el que usa el CSS y
// dashboard.js).
//
// Expone window.TemaPanel: aplicar(tema) / actual() / revertir(tema).
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

    // Traduce el valor interno a lo que lee el CSS/JS: 'oscuro' → "dark".
    function atributo(tema) {
        return tema === 'oscuro' ? 'dark' : 'light';
    }

    function aplicar(tema) {
        var t = tema === 'oscuro' ? 'oscuro' : 'claro';
        document.documentElement.setAttribute('data-tema', atributo(t));
        escribirCache(t);
        // Avisa al resto del panel (gráficos/UI) por si algo debe reaccionar.
        try {
            window.dispatchEvent(new CustomEvent('lemora:tema-panel', { detail: t }));
        } catch (e) { /* noop */ }
        return t;
    }

    function actual() {
        return document.documentElement.getAttribute('data-tema') === 'dark'
            ? 'oscuro'
            : 'claro';
    }

    // El switch del topbar persiste en la BD. Si el save falla, admin-app.js
    // llama revertir(temaAnterior) para volver al tema ya persistido.
    function revertir(tema) {
        return aplicar(tema);
    }

    // Boot: restaurar caché antes del primer paint (o claro si no hay).
    aplicar(leerCache());

    window.TemaPanel = {
        aplicar: aplicar,
        actual: actual,
        revertir: revertir
    };
})();
