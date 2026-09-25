// ============================================================================
// tema.js — Dark mode del front (tienda pública).
//
// Script CLÁSICO (no module) cargado con <script> en el <head> de cada página:
// se ejecuta de forma síncrona ANTES del primer paint, así el tema se aplica
// sin flash de color al recargar.
//
// Estados (localStorage 'tema_front'):
//   'auto'   (por defecto) → sigue a matchMedia('(prefers-color-scheme: dark)')
//                            y reacciona EN VIVO cuando el dispositivo cambia.
//   'claro' | 'oscuro'     → forzado manualmente desde el switch del header.
//
// Expone window.TemaFront y avisa con el evento 'lemora:tema' para que
// template.js re-aplique el color de marca aclarado en modo oscuro.
// ============================================================================
(function () {
    'use strict';

    var CLAVE = 'tema_front';
    var MEDIA = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    var VALIDOS = { auto: 1, claro: 1, oscuro: 1 };

    var tema = leer();

    function leer() {
        try {
            var v = localStorage.getItem(CLAVE);
            return VALIDOS[v] ? v : 'auto';
        } catch (e) { /* localStorage no disponible */ }
        return 'auto';
    }

    function guardar(v) {
        try { localStorage.setItem(CLAVE, v); } catch (e) { /* noop */ }
    }

    // Tema EFECTIVO aplicado a <html data-tema="dark|light">.
    function efectivo() {
        if (tema !== 'auto') return tema === 'oscuro' ? 'dark' : 'light';
        return MEDIA && MEDIA.matches ? 'dark' : 'light';
    }

    // Sincroniza con el switch del header (pintado por template.js).
    function actualizarUI() {
        var oscuro = efectivo() === 'dark';
        var icono = 'fa-solid ' + (oscuro ? 'fa-moon' : 'fa-sun');
        var label = oscuro
            ? 'Tema oscuro. Pulsá para cambiar a claro.'
            : 'Tema claro. Pulsá para cambiar a oscuro.';

        document.querySelectorAll('[data-tema-switch]').forEach(function (el) {
            var i = el.querySelector('i');
            if (i) i.className = icono;
            el.setAttribute('aria-label', label);
            el.setAttribute('title', label);
        });

        // Chip "Auto": solo cuando hay preferencia forzada (permite volver a
        // seguir al dispositivo).
        document.querySelectorAll('[data-tema-auto]').forEach(function (el) {
            el.hidden = (tema === 'auto');
        });
    }

    function aplicar() {
        document.documentElement.setAttribute('data-tema', efectivo());
        actualizarUI();
        // Avisa a template.js (color de marca aclarado en oscuro) y demás módulos.
        try {
            window.dispatchEvent(new CustomEvent('lemora:tema', { detail: efectivo() }));
        } catch (e) { /* noop */ }
    }

    // Switch binario del header: sin preferencia (auto) fuerza lo contrario del
    // estado efectivo; ya forzado, alterna claro ↔ oscuro.
    function ciclar() {
        if (tema === 'auto') {
            tema = efectivo() === 'dark' ? 'claro' : 'oscuro';
        } else {
            tema = tema === 'oscuro' ? 'claro' : 'oscuro';
        }
        guardar(tema);
        aplicar();
    }

    // Restaurar el seguimiento del dispositivo (chip "Auto").
    function volverAuto() {
        tema = 'auto';
        guardar(tema);
        aplicar();
    }

    // Cambio de tema del sistema en vivo (solo relevante en modo auto).
    if (MEDIA && MEDIA.addEventListener) {
        MEDIA.addEventListener('change', function () {
            if (tema === 'auto') aplicar();
        });
    }

    // Aplicación inicial ANTES del primer paint (el header aún no existe,
    // por lo que actualizarUI() simplemente no encuentra elementos).
    aplicar();

    window.TemaFront = {
        estado: function () { return tema; },
        efectivo: efectivo,
        ciclar: ciclar,
        volverAuto: volverAuto
    };
})();