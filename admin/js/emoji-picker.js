// ============================================================================
// emoji-picker.js — Selector de emojis para el dashboard (sin dependencias).
//
// Monta un botón "carita" junto a un campo de texto; al tocarlo se abre un
// panel con emojis curados agrupados por categoría (el mismo criterio de lista
// curada que iconos-fa.js) y un buscador por nombre. Un clic inserta el emoji
// en la posición del cursor respetando maxlength, y el panel queda abierto
// para insertar varios. Se cierra con Esc, clic afuera, scroll/resize o
// tocando el botón otra vez.
//
// El panel se cuelga de <body> con position:fixed y un z-index por encima de
// los modales (.admin-modal es z-index:100; acá 220) así no se recorta ni por
// el overflow del panel del modal ni por el del contenedor donde vive el botón.
// ============================================================================

// Catálogo curado: emojis que caben en un mensaje promocional de la tienda.
// Cada entrada: { e: emoji, n: nombre } (el nombre alimenta el buscador).
export const EMOJIS_PICKER = [
    {
        nombre: 'Promos y ventas',
        emojis: [
            { e: '🔥', n: 'fuego' },
            { e: '✨', n: 'brillos' },
            { e: '💰', n: 'bolsa de dinero' },
            { e: '💸', n: 'dinero volando' },
            { e: '🤑', n: 'cara con dinero' },
            { e: '🏷️', n: 'etiqueta de precio' },
            { e: '💳', n: 'tarjeta' },
            { e: '💵', n: 'billete' },
            { e: '🎁', n: 'regalo' },
            { e: '🛍️', n: 'bolsas de compras' },
            { e: '🛒', n: 'carrito' },
            { e: '🏆', n: 'trofeo' },
            { e: '🎉', n: 'confeti' },
            { e: '🎊', n: 'papel picado' },
            { e: '🎯', n: 'diana' }
        ]
    },
    {
        nombre: 'Corazones y emociones',
        emojis: [
            { e: '❤️', n: 'corazón rojo' },
            { e: '🧡', n: 'corazón naranja' },
            { e: '💛', n: 'corazón amarillo' },
            { e: '💚', n: 'corazón verde' },
            { e: '💙', n: 'corazón azul' },
            { e: '💜', n: 'corazón violeta' },
            { e: '🖤', n: 'corazón negro' },
            { e: '🤍', n: 'corazón blanco' },
            { e: '💖', n: 'corazón brillante' },
            { e: '💗', n: 'corazón latiendo' },
            { e: '💘', n: 'flecha de amor' },
            { e: '😍', n: 'cara enamorada' },
            { e: '🤩', n: 'estrellas en los ojos' },
            { e: '😎', n: 'con lentes' },
            { e: '😄', n: 'sonrisa amplia' },
            { e: '😊', n: 'sonrisa tierna' },
            { e: '🥳', n: 'festejando' },
            { e: '😉', n: 'guiño' },
            { e: '😱', n: 'sorpresa' }
        ]
    },
    {
        nombre: 'Manos y gestos',
        emojis: [
            { e: '👋', n: 'saludando' },
            { e: '🫶', n: 'corazones con las manos' },
            { e: '🤝', n: 'apretón de manos' },
            { e: '👍', n: 'pulgar arriba' },
            { e: '👏', n: 'aplausos' },
            { e: '🙌', n: 'brazos arriba' },
            { e: '🤙', n: 'señal de teléfono' },
            { e: '💪', n: 'músculo' },
            { e: '✌️', n: 'paz y victoria' },
            { e: '🤞', n: 'dedos cruzados' }
        ]
    },
    {
        nombre: 'Flechas e indicadores',
        emojis: [
            { e: '⬅️', n: 'flecha a la izquierda' },
            { e: '➡️', n: 'flecha a la derecha' },
            { e: '⬆️', n: 'flecha hacia arriba' },
            { e: '⬇️', n: 'flecha hacia abajo' },
            { e: '↗️', n: 'diagonal arriba' },
            { e: '↘️', n: 'diagonal abajo' },
            { e: '↪️', n: 'volver' },
            { e: '🔁', n: 'repetir' },
            { e: '🔄', n: 'actualizar' },
            { e: '⏫', n: 'rápido arriba' },
            { e: '⏬', n: 'rápido abajo' },
            { e: '📌', n: 'chinche' },
            { e: '📍', n: 'pin de ubicación' },
            { e: '📢', n: 'altavoz' },
            { e: '🔔', n: 'campana' },
            { e: '⏰', n: 'despertador' },
            { e: '🕒', n: 'reloj' },
            { e: '🚨', n: 'alerta' }
        ]
    },
    {
        nombre: 'Servicios y comercio',
        emojis: [
            { e: '💇', n: 'corte de pelo' },
            { e: '💅', n: 'manicura' },
            { e: '💄', n: 'labial' },
            { e: '💋', n: 'beso' },
            { e: '💆', n: 'masaje' },
            { e: '✂️', n: 'tijeras' },
            { e: '🪞', n: 'espejo' },
            { e: '🧴', n: 'crema' },
            { e: '🛁', n: 'bañera' },
            { e: '🧖', n: 'spa' },
            { e: '🦷', n: 'diente' },
            { e: '🌸', n: 'flor de cerezo' },
            { e: '🕶️', n: 'lentes de sol' },
            { e: '👗', n: 'vestido' },
            { e: '👠', n: 'taco alto' },
            { e: '💍', n: 'anillo' },
            { e: '⏳', n: 'reloj de arena' },
            { e: '🧺', n: 'canasto' }
        ]
    },
    {
        nombre: 'Naturaleza y confianza',
        emojis: [
            { e: '✅', n: 'check' },
            { e: '✔️', n: 'palomita' },
            { e: '❌', n: 'cruz' },
            { e: '⚠️', n: 'advertencia' },
            { e: '❗', n: 'exclamación' },
            { e: '💯', n: 'cien puntos' },
            { e: '🍃', n: 'hoja al viento' },
            { e: '🌱', n: 'brote' },
            { e: '🌿', n: 'hierba' },
            { e: '🌟', n: 'estrella brillante' },
            { e: '☀️', n: 'sol' },
            { e: '🌈', n: 'arcoíris' },
            { e: '🦋', n: 'mariposa' },
            { e: '🐝', n: 'abeja' }
        ]
    },
    {
        nombre: 'Comida y bebida',
        emojis: [
            { e: '🍕', n: 'pizza' },
            { e: '🍔', n: 'hamburguesa' },
            { e: '🍟', n: 'papas fritas' },
            { e: '🥤', n: 'bebida' },
            { e: '☕', n: 'café' },
            { e: '🍰', n: 'torta' },
            { e: '🧁', n: 'cupcake' },
            { e: '🍩', n: 'dona' },
            { e: '🍪', n: 'galletita' },
            { e: '🍫', n: 'chocolate' },
            { e: '🍓', n: 'frutilla' },
            { e: '🥑', n: 'palta' },
            { e: '🍋', n: 'limón' },
            { e: '🍹', n: 'trago' },
            { e: '🎂', n: 'cumpleaños' }
        ]
    },
    {
        nombre: 'Símbolos y novedades',
        emojis: [
            { e: '🆕', n: 'nuevo' },
            { e: '🆓', n: 'gratis' },
            { e: '🆒', n: 'genial' },
            { e: '🆗', n: 'ok' },
            { e: '⭐', n: 'estrella' },
            { e: '➕', n: 'más' },
            { e: '➖', n: 'menos' },
            { e: '❓', n: 'pregunta' },
            { e: 'ℹ️', n: 'información' },
            { e: '☝️', n: 'índice arriba' },
            { e: '🔝', n: 'arriba' },
            { e: '💡', n: 'idea' },
            { e: '🚀', n: 'cohete' },
            { e: '♻️', n: 'reciclar' }
        ]
    }
];

// Conecta el botón de emoji con su campo de texto. Devuelve una función de
// limpieza (cierra el panel y quita los listeners) por si el contenedor se
// destruye (los modales del panel se recrean por cada apertura).
export function instalarEmojiPicker({ input, boton }) {
    if (!input || !boton) return () => {};

    let popover = null;
    let observador = null;

    function insertar(emoji) {
        const inicio = input.selectionStart ?? input.value.length;
        const fin = input.selectionEnd ?? input.value.length;
        input.setRangeText(emoji, inicio, fin, 'end');

        // maxlength: setRangeText no siempre lo aplica; se recorta acá.
        const max = Number(input.maxLength);
        let caret = fin + emoji.length;
        if (max && input.value.length > max) {
            input.value = input.value.slice(0, max);
            caret = max;
        }
        input.selectionStart = input.selectionEnd = Math.min(caret, input.value.length);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    }

    function filtrar(texto) {
        const q = (texto || '').trim().toLowerCase();
        popover.querySelectorAll('.admin-emoji-bloque').forEach((bloque) => {
            let visibles = 0;
            bloque.querySelectorAll('.admin-emoji-celda').forEach((celda) => {
                const coincide = !q || celda.dataset.nombre.includes(q);
                celda.hidden = !coincide;
                if (coincide) visibles += 1;
            });
            bloque.hidden = visibles === 0;
        });
    }

    function enPointerFuera(e) {
        if (!popover) return;
        // Clic dentro del panel o sobre el botón: no cerrar.
        if (popover.contains(e.target) || boton.contains(e.target)) return;
        cerrar();
    }

    function enTecla(e) {
        if (e.key !== 'Escape') return;
        e.stopPropagation(); // cierra solo el picker, no el modal de fondo
        cerrar();
    }

    function enScroll() {
        if (popover) cerrar();
    }

    function cerrar() {
        if (popover) {
            popover.remove();
            popover = null;
        }
        if (observador) {
            observador.disconnect();
            observador = null;
        }
        document.removeEventListener('pointerdown', enPointerFuera, true);
        document.removeEventListener('keydown', enTecla, true);
        document.removeEventListener('scroll', enScroll, true);
        window.removeEventListener('resize', enScroll);
        boton.classList.remove('activo');
        boton.setAttribute('aria-expanded', 'false');
    }

    function abrir() {
        if (popover) return;

        popover = document.createElement('div');
        popover.className = 'admin-emoji-popover';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-label', 'Insertar emoji');
        popover.innerHTML = `
            <div class="admin-emoji-buscar-wrap">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" class="admin-emoji-buscar" placeholder="Buscar emoji…"
                    aria-label="Buscar emoji" autocomplete="off">
            </div>
            <div class="admin-emoji-cuerpo">
                ${EMOJIS_PICKER.map((grupo) => `
                    <section class="admin-emoji-bloque">
                        <p class="admin-emoji-grupo">${grupo.nombre}</p>
                        <div class="admin-emoji-grilla">
                            ${grupo.emojis.map((x) =>
                                `<button type="button" class="admin-emoji-celda" data-emoji="${x.e}"
                                    data-nombre="${(x.n + ' ' + x.e).toLowerCase()}" title="${x.n}"
                                    aria-label="${x.n}">${x.e}</button>`
                            ).join('')}
                        </div>
                    </section>`).join('')}
            </div>
        `;
        document.body.appendChild(popover);

        // Posicionar alineado a la derecha del botón, abajo; si no entra, arriba.
        const rect = boton.getBoundingClientRect();
        const ancho = popover.offsetWidth;
        const alto = popover.offsetHeight;
        let left = Math.max(10, Math.min(rect.right - ancho, window.innerWidth - ancho - 10));
        let top = rect.bottom + 6;
        if (top + alto > window.innerHeight - 10) top = Math.max(10, rect.top - alto - 6);
        popover.style.left = `${Math.round(left)}px`;
        popover.style.top = `${Math.round(top)}px`;

        boton.classList.add('activo');
        boton.setAttribute('aria-expanded', 'true');

        const buscar = popover.querySelector('.admin-emoji-buscar');
        popover.querySelectorAll('.admin-emoji-celda').forEach((celda) => {
            celda.addEventListener('click', () => insertar(celda.dataset.emoji));
        });
        buscar?.addEventListener('input', () => filtrar(buscar.value));

        document.addEventListener('pointerdown', enPointerFuera, true);
        document.addEventListener('keydown', enTecla, true);
        document.addEventListener('scroll', enScroll, true);
        window.addEventListener('resize', enScroll);

        // Si el modal que contiene el botón se cierra con el picker abierto,
        // no dejar el panel colgando huérfano en <body>.
        observador = new MutationObserver(() => {
            if (!document.getElementById('adminModal')) cerrar();
        });
        observador.observe(document.body, { childList: true });

        buscar?.focus();
    }

    boton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (popover) cerrar();
        else abrir();
    });
    boton.setAttribute('aria-haspopup', 'dialog');
    boton.setAttribute('aria-expanded', 'false');

    return () => cerrar();
}