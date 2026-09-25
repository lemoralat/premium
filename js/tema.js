// ============================================================================
// tema.js — Dark mode del front (tienda pública).
//
// Script CLÁSICO (no module) cargado con <script> en el <head> de cada página:
// se ejecuta de forma síncrona ANTES del primer paint, así el tema se aplica
// sin flash de color al recargar.
//
// Comportamiento:
//   - Por defecto el front SIGUE el modo de color del dispositivo
//     (matchMedia '(prefers-color-scheme: dark)') y reacciona EN VIVO cuando
//     el dispositivo cambia. No hay opción "Auto" en la UI.
//   - El switch del header (sol/luna) fuerza claro/oscuro de forma manual y
//     persiste la preferencia en localStorage ('tema_front').
//   - Sin preferencia guardada (o si estaba 'auto' / inválido) → se vuelve a
//     seguir al dispositivo automáticamente.
//
// Expone window.TemaFront y avisa con el evento 'lemora:tema' para que
// template.js re-aplique el color de marca aclarado en modo oscuro.
// ============================================================================
(function () {
    'use strict';

    var CLAVE = 'tema_front';
    var MEDIA = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    // Preferencia manual: 'claro' | 'oscuro' | null (null = seguir al dispositivo).
    var preferencia = leer();

    function leer() {
        try {
            var v = localStorage.getItem(CLAVE);
            return v === 'claro' || v === 'oscuro' ? v : null;
        } catch (e) { /* localStorage no disponible */ }
        return null;
    }

    function guardar(v) {
        try { localStorage.setItem(CLAVE, v); } catch (e) { /* noop */ }
    }

    // Tema EFECTIVO aplicado a <html data-tema="dark|light">.
    function efectivo() {
        if (preferencia) return preferencia === 'oscuro' ? 'dark' : 'light';
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
    }

    function aplicar() {
        document.documentElement.setAttribute('data-tema', efectivo());
        actualizarUI();
        // Avisa a template.js (color de marca aclarado en oscuro) y demás módulos.
        try {
            window.dispatchEvent(new CustomEvent('lemora:tema', { detail: efectivo() }));
        } catch (e) { /* noop */ }
    }

    // Switch binario del header: fuerza lo contrario del estado efectivo actual
    // (claro ↔ oscuro) y persiste la preferencia. Para volver a seguir al
    // dispositivo basta con que no haya preferencia guardada.
    function ciclar() {
        preferencia = efectivo() === 'dark' ? 'claro' : 'oscuro';
        guardar(preferencia);
        aplicar();
    }

    // Cambio de tema del sistema en vivo (solo relevante sin preferencia manual;
    // si el usuario forzó claro/oscuro, su elección manda hasta recargar).
    if (MEDIA && MEDIA.addEventListener) {
        MEDIA.addEventListener('change', function () {
            if (!preferencia) aplicar();
        });
    }

    // Aplicación inicial ANTES del primer paint (el header aún no existe,
    // por lo que actualizarUI() simplemente no encuentra elementos).
    aplicar();

    window.TemaFront = {
        estado: function () { return preferencia; },
        efectivo: efectivo,
        ciclar: ciclar
    };
})();