/**
 * Popup al detectar intención de abandonar el sitio (cursor hacia la barra del navegador).
 * No usa beforeunload: en sitios multipágina molestaría al cambiar de página interna.
 */
(function () {
    const STORAGE_KEY = 'exitIntentModalShown';
    const body = document.body;

    if (body.dataset.noExitPopup !== undefined) {
        return;
    }

    let modalEl = null;
    let previousFocus = null;

    function isFinePointer() {
        return window.matchMedia('(pointer: fine)').matches;
    }

    // Móvil por viewport (breakpoint del sitio, 768px): el exit-intent es un
    // patrón de escritorio (el mouse sale por arriba del viewport), así que en
    // pantallas ≤768px el popup nunca se activa. Complementa a isFinePointer():
    // cubre iPad con trackpad/modo escritorio, notebooks táctiles y DevTools
    // responsive (ancho móvil con mouse físico).
    function esViewportMovil() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function lockScroll(lock) {
        document.documentElement.classList.toggle('exit-intent-locked', lock);
    }

    function closeModal() {
        if (!modalEl) return;
        modalEl.classList.remove('active');
        modalEl.setAttribute('aria-hidden', 'true');
        lockScroll(false);
        if (previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        }
    }

    // Configuración del popup (Configuración → Popup de salida). La expone
    // template.js en window.POPUP_CONFIG; mientras no esté lista se usan los
    // mismos valores que la tienda mostró siempre.
    function configPopup() {
        const c = window.POPUP_CONFIG || {};
        return {
            titulo: c.titulo || '¿Te vas tan pronto?',
            descripcion: c.descripcion || 'Antes de irte: envíos a todo el país y ofertas en la tienda. ¿Quieres echar un vistazo?',
            cta: c.cta || 'Ver productos',
            ctaUrl: c.ctaUrl || '/#tienda',
            activo: c.activo !== false
        };
    }

    function aplicarConfigPopup() {
        if (!modalEl) return;
        const cfg = configPopup();
        modalEl.querySelector('#exit-intent-title').textContent = cfg.titulo;
        modalEl.querySelector('.exit-intent-desc').textContent = cfg.descripcion;
        const cta = modalEl.querySelector('.exit-intent__cta');
        cta.textContent = cfg.cta;
        // El destino lo escribe el admin en Configuración → Popup de salida.
        // Solo se permiten enlaces internos (/#…, ./…, /…) o URLs
        // http(s): se bloquean esquemas tipo javascript: (hardening V-2).
        const destino = enlacePermitido(cfg.ctaUrl) ? cfg.ctaUrl : '/#tienda';
        cta.href = destino;
    }

    // ¿El enlace usa un esquema/path seguro? (anclas, relativos o http/https)
    function enlacePermitido(url) {
        return /^(\.{0,2}\/|#|https?:\/\/)/i.test(String(url || '').trim());
    }

    function openModal() {
        if (!modalEl) return;
        // La config remota pudo llegar después del build del modal.
        aplicarConfigPopup();
        previousFocus = document.activeElement;
        modalEl.classList.add('active');
        modalEl.setAttribute('aria-hidden', 'false');
        lockScroll(true);
        const btn = modalEl.querySelector('.exit-intent__cta');
        if (btn) btn.focus();
    }

    function tryShowExitIntent() {
        if (configPopup().activo === false) return;
        if (sessionStorage.getItem(STORAGE_KEY) === '1') return;
        if (esViewportMovil()) return;
        if (!isFinePointer()) return;
        sessionStorage.setItem(STORAGE_KEY, '1');
        openModal();
    }

    function onDocumentMouseLeave(e) {
        if (e.clientY > 0) return;
        tryShowExitIntent();
    }

    function buildModal() {
        const wrap = document.createElement('div');
        wrap.className = 'exit-intent-modal';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-labelledby', 'exit-intent-title');
        wrap.setAttribute('aria-hidden', 'true');
        wrap.innerHTML = `
            <div class="exit-intent-overlay" data-exit-close tabindex="-1"></div>
            <div class="exit-intent-dialog">
                <button type="button" class="exit-intent-close" aria-label="Cerrar">&times;</button>
                <h2 id="exit-intent-title">¿Te vas tan pronto?</h2>
                <p class="exit-intent-desc">Antes de irte: envíos a todo el país y ofertas en la tienda. ¿Quieres echar un vistazo?</p>
                <div class="exit-intent-actions">
                    <a href="/#tienda" class="exit-intent__cta">Ver productos</a>
                    <button type="button" class="exit-intent__secondary" data-exit-close>Seguir navegando</button>
                </div>
            </div>
        `;
        wrap.querySelectorAll('[data-exit-close]').forEach((el) => {
            el.addEventListener('click', closeModal);
        });
        wrap.querySelector('.exit-intent-close').addEventListener('click', closeModal);
        wrap.querySelector('.exit-intent__cta').addEventListener('click', closeModal);
        return wrap;
    }

    function onKeyDown(e) {
        if (e.key === 'Escape' && modalEl && modalEl.classList.contains('active')) {
            closeModal();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        modalEl = buildModal();
        document.body.appendChild(modalEl);

        document.documentElement.addEventListener('mouseleave', onDocumentMouseLeave);

        document.addEventListener('keydown', onKeyDown);
    });
})();
