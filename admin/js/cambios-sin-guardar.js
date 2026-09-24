// ============================================================================
// cambios-sin-guardar.js — Detección de cambios sin guardar en el dashboard.
//
// Vigila los formularios `.admin-form` de la sección activa (#adminView) y de
// los modales (#adminModal), más cualquier control marcado con `data-cambios`
// (para campos que viven fuera de un <form>, como el nombre en "Mi cuenta").
//
// El estado se calcula por comparación contra un "baseline" tomado en la
// primera interacción del usuario con cada form (cuando los valores todavía
// son los originales). Así no hace falta tocar el flujo de guardado de cada
// módulo:
//   - si el usuario guarda, un submit/reset re-baselinea el form;
//   - si la sección se re-renderiza, los forms nuevos arrancan limpios
//     (baseline por WeakMap, referenciado al elemento del DOM);
//   - revertir un campo a su valor original también vuelve a "limpio".
//
// Puntos de uso (desde admin-app.js):
//   confirmarSalida()            → modal Guardar / Descartar / Cancelar
//   guardarCambiosPendientes()   → dispara el guardado real de cada form sucio
//   hayCambios()                 → bool (también para beforeunload)
// ============================================================================

import { toast } from './admin-ui.js';

// ---------- Estado interno ----------
let baselines = new WeakMap(); // form → [{ el, valor }] (estado original)
let sueltos = new WeakMap();    // control [data-cambios] → valor original
let enDialogo = false;
let inicializado = false;

// ---------- Serialización de valores ----------
function esControl(el) {
    return el instanceof HTMLInputElement
        || el instanceof HTMLSelectElement
        || el instanceof HTMLTextAreaElement;
}

function valorControl(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? (el.value || 'on') : '';
    if (el.type === 'file') return el.files.length;
    return el.value;
}

function serializarForm(form) {
    return [...form.elements]
        .filter((el) => esControl(el) && !el.disabled && el.type !== 'hidden')
        .map((el) => [el, valorControl(el)]);
}

function esFormVigilado(form) {
    return Boolean(form && form.matches('form.admin-form') && form.closest('#adminView, #adminModal'));
}

function asegurarBaseline(form) {
    if (esFormVigilado(form) && !baselines.has(form)) {
        baselines.set(form, serializarForm(form));
    }
}

function formaFormSucio(form) {
    const base = baselines.get(form);
    if (!base) return false;
    const actual = serializarForm(form);
    if (base.length !== actual.length) return true;
    for (let i = 0; i < base.length; i++) {
        if (base[i][0] !== actual[i][0] || base[i][1] !== actual[i][1]) return true;
    }
    return false;
}

function controlSuetoSucio(el) {
    const base = sueltos.get(el);
    if (base === undefined) return false;
    return base !== valorControl(el);
}

// ---------- Ámbito: forms y controles sueltos presentes en el documento ----------
function formulariosVivos() {
    return [...document.querySelectorAll('#adminView form.admin-form, #adminModal form.admin-form')];
}

function controlesSueltoVivos() {
    return [...document.querySelectorAll('#adminView [data-cambios], #adminModal [data-cambios]')]
        .filter((el) => esControl(el) && !el.closest('form.admin-form'));
}

// ---------- Eventos (fase de captura, corren antes que los handlers de cada módulo) ----------
function inicializarVigilancia() {
    if (inicializado) return;
    inicializado = true;

    // La primera interacción con un form captura su baseline (valores originales).
    document.addEventListener('focusin', (event) => {
        if (enDialogo) return;
        const target = event.target;
        if (esControl(target)) {
            asegurarBaseline(target.closest('form'));
            if (target.hasAttribute('data-cambios') && !sueltos.has(target)) {
                sueltos.set(target, valorControl(target));
            }
        }
    }, true);

    // input / change: asegurar baseline si todavía no existe.
    document.addEventListener('input', (event) => {
        if (enDialogo) return;
        const target = event.target;
        if (esControl(target)) {
            asegurarBaseline(target.closest('form'));
            if (target.hasAttribute('data-cambios') && !sueltos.has(target)) {
                sueltos.set(target, valorControl(target));
            }
        }
    }, true);

    document.addEventListener('change', (event) => {
        if (enDialogo) return;
        const target = event.target;
        if (esControl(target)) asegurarBaseline(target.closest('form'));
    }, true);

    // Click dentro de un form vigilado: asegurar baseline (cubre cambios
    // programáticos sin evento de input, ej. botones "Restaurar" de color).
    // Click en un botón "btnGuardar*" fuera de un form: re-baselinea los
    // controles [data-cambios] de su tarjeta (caso "Guardar nombre" en cuenta).
    document.addEventListener('click', (event) => {
        if (enDialogo) return;
        const target = event.target;
        const form = target.closest?.('form');
        if (form) asegurarBaseline(form);

        const btn = target.closest?.('.admin-card [id^="btnGuardar"], .admin-card button[type="submit"]');
        if (btn && !btn.closest('form')) {
            const card = btn.closest('.admin-card');
            if (card) {
                for (const c of card.querySelectorAll('[data-cambios]')) {
                    if (esControl(c) && sueltos.has(c)) sueltos.set(c, valorControl(c));
                }
            }
        }
    }, true);

    // Después de guardar (submit) o resetear un form vigilado, los valores que
    // quedaron son los que se persisten: re-baselineo para no marcar falso sucio
    // (cubre módulos que guardan sin re-renderizar, como Configuración).
    const reBaselinear = (event) => {
        const form = event.target;
        if (form instanceof HTMLFormElement && esFormVigilado(form)) {
            setTimeout(() => {
                if (form.isConnected) baselines.set(form, serializarForm(form));
            }, 0);
        }
    };
    document.addEventListener('submit', reBaselinear, true);
    document.addEventListener('reset', reBaselinear, true);

    // Salir / recargar la pestaña con cambios sin guardar → prompt nativo.
    window.addEventListener('beforeunload', (event) => {
        if (hayCambios()) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

// ---------- API pública ----------
export function hayCambios() {
    if (!inicializado) return false;
    return formulariosVivos().some(formaFormSucio)
        || controlesSueltoVivos().some(controlSuetoSucio);
}

export function formulariosConCambios() {
    return formulariosVivos().filter(formaFormSucio);
}

export function controlesSueltoConCambios() {
    return controlesSueltoVivos().filter(controlSuetoSucio);
}

// Descarta los baselines acumulados (se llama al navegar / tras decidir).
export function limpiarVigilancia() {
    baselines = new WeakMap();
    sueltos = new WeakMap();
}

// Dispara el guardado real de cada form sucio (submit) y de los controles
// [data-cambios] sueltos (clic en el botón "btnGuardar*" de su tarjeta).
// Devuelve una promesa que resuelve cuando los guardados asíncronos corrieron.
export async function guardarCambiosPendientes() {
    for (const form of formulariosConCambios()) {
        try {
            form.requestSubmit();
        } catch {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
    }
    for (const el of controlesSueltoConCambios()) {
        const card = el.closest('.admin-card');
        const btn = card?.querySelector('[id^="btnGuardar"], button[type="submit"]');
        if (btn) {
            sueltos.set(el, valorControl(el)); // pasa a considerarse guardado
            btn.click();
        }
    }
    // Espera a que corran los guardados asíncronos (Supabase) y avisa si algo
    // no se pudo (ej. validación): se continúa con el resto a salvo.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (hayCambios()) {
        toast('Algunos cambios no se guardaron y se descartarán al continuar.', 'error');
    }
    limpiarVigilancia();
}

// Modal propio del panel (mismos estilos que el resto del dashboard).
// Resuelve: 'guardar' | 'descartar' | 'cancelar' (backdrop / ✕ / Esc = cancelar).
export function confirmarSalida() {
    return new Promise((resolve) => {
        if (enDialogo) { resolve('cancelar'); return; }
        enDialogo = true;

        const overlay = document.createElement('div');
        overlay.id = 'adminModal';
        overlay.className = 'admin-modal';
        overlay.innerHTML = `
            <div class="admin-modal-backdrop" data-cerrar-salida></div>
            <div class="admin-modal-panel admin-confirm-panel">
                <button type="button" class="admin-modal-close" data-cerrar-salida aria-label="Cerrar">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <h2>Cambios sin guardar</h2>
                <p class="admin-confirm-mensaje">Modificaste campos en esta sección y todavía no los guardaste. Si continuás sin guardar, se perderán.</p>
                <div class="admin-modal-acciones">
                    <button type="button" class="btn btn-outline" data-salida-cancelar>Cancelar</button>
                    <button type="button" class="btn btn-danger" data-salida-descartar>Descartar cambios</button>
                    <button type="button" class="btn btn-primary" data-salida-guardar>
                        <i class="fa-solid fa-floppy-disk"></i> Guardar y continuar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('admin-modal-abierto');

        let resuelto = false;
        const terminar = (valor) => {
            if (resuelto) return;
            resuelto = true;
            document.removeEventListener('keydown', onKey);
            overlay.classList.add('admin-modal-cerrando');
            document.body.classList.remove('admin-modal-abierto');
            setTimeout(() => overlay.remove(), 160);
            enDialogo = false;
            resolve(valor);
        };
        const onKey = (event) => { if (event.key === 'Escape') terminar('cancelar'); };

        overlay.addEventListener('click', (event) => {
            if (event.target.closest('[data-cerrar-salida]')) terminar('cancelar');
        });
        overlay.querySelector('[data-salida-guardar]').addEventListener('click', () => terminar('guardar'));
        overlay.querySelector('[data-salida-descartar]').addEventListener('click', () => terminar('descartar'));
        overlay.querySelector('[data-salida-cancelar]').addEventListener('click', () => terminar('cancelar'));
        document.addEventListener('keydown', onKey);
    });
}

// Arranque automático: el módulo solo se carga desde el panel admin.
inicializarVigilancia();