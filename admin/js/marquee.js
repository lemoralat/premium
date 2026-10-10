// marquee.js — Gestor de mensajes del marquee promocional (widget reutilizable).
// Se monta dentro de la sección "Diseño" del panel (diseno.js), en su propia
// card, debajo de "Identidad visual".
//
// Repeater field: cada fila es un mensaje con su orden y estado. Sin mensajes
// activos, la tienda no muestra la barra marquee (nada hardcodeado).

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { instalarEmojiPicker } from './emoji-picker.js';

// Tope de mensajes. La garantía real está en la BD (trigger
// trg_marquee_items_max, migración 0035): esto es la parte amable, que evita
// que el admin llegue al error. El trigger cuenta TODAS las filas, y acá
// también: una fila inactiva sigue ocupando un lugar en la tabla.
const MAX_MENSAJES = 6;

let items = [];

// Renderiza el gestor completo dentro de `contenedor` (el <div> de la card
// "Marquee promocional" de Diseño). Al guardar/borrar se re-renderiza SOLO
// este contenedor, para no descartar cambios sin guardar de otros formularios.
export async function renderizarGestor(contenedor) {
    contenedor.innerHTML = '<p class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando mensajes…</p>';

    const sb = await clienteAdmin();
    const { data, error } = await sb.from('marquee_items').select('*').order('position', { ascending: true });
    if (error) throw error;
    items = data || [];

    // El botón se apaga al llegar al tope. `items` se relee en cada
    // renderizado, así que el estado nunca queda desfasado tras un borrado.
    const alTope = items.length >= MAX_MENSAJES;
    const quedan = MAX_MENSAJES - items.length;

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Se muestran en la barra animada sobre el encabezado de la tienda. Sin mensajes activos, la barra no aparece.</p>
            <button type="button" class="btn btn-primary" id="btnNuevoMensaje" ${alTope ? 'disabled title="Límite alcanzado"' : ''}>
                <i class="fa-solid fa-plus"></i> Nuevo mensaje
            </button>
        </div>
        <p class="hint">Máximo ${MAX_MENSAJES} mensajes. ${alTope
            ? 'Límite alcanzado: borrá alguno para crear otro (desactivar no libera lugar).'
            : `Te quedan ${quedan}.`}</p>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Mensaje</th><th>Orden</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    if (!alTope) {
        $('#btnNuevoMensaje').addEventListener('click', () => abrirModalMensaje(null, contenedor));
    }
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalMensaje(Number(btn.dataset.editar), contenedor));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarMensaje(Number(btn.dataset.borrar), contenedor));
    });
}

function filas() {
    if (!items.length) {
        return `<tr><td colspan="4"><div class="admin-empty"><p>No hay mensajes todavía. Creá el primero para activar la barra marquee.</p></div></td></tr>`;
    }
    return items.map((m) => `
        <tr>
            <td class="td-principal"><strong>${esc(m.texto)}</strong></td>
            <td data-label="Orden">${esc(m.position ?? 0)}</td>
            <td data-label="Estado">${m.activo
                ? '<span class="estado-badge estado-entregado">Activo</span>'
                : '<span class="estado-badge estado-cancelado">Inactivo</span>'}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(m.id)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(m.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function abrirModalMensaje(idExistente, contenedor) {
    const item = idExistente ? items.find((m) => m.id === idExistente) : null;

    abrirModal(`
        <h2>${item ? 'Editar mensaje' : 'Nuevo mensaje'}</h2>
        <p class="modal-sub">${item ? esc(item.texto) : 'La barra marquee se arma con estos mensajes'}</p>
        <form class="admin-form" id="mqForm">
            <input type="hidden" id="mqId" value="${item ? item.id : ''}">

            <div class="admin-form-grid">
                <div class="admin-field full">
                    <label for="mqTexto">Mensaje <span style="color:var(--danger);">*</span></label>
                    <div class="admin-input-emoji">
                        <input type="text" id="mqTexto" required maxlength="200" value="${esc(item?.texto || '')}" placeholder="Ej. 🔥 ¡20% OFF con PROMO20!">
                        <button type="button" class="btn btn-sm admin-emoji-btn" id="mqEmojiBtn" aria-label="Insertar emoji" title="Insertar emoji">😀</button>
                    </div>
                    <span class="hint">Obligatorio. Se muestra en la barra sobre el encabezado; tocá la carita para insertar emojis.</span>
                </div>
                <div class="admin-field">
                    <label for="mqPosition">Orden</label>
                    <input type="number" id="mqPosition" min="0" step="1" value="${esc(item?.position ?? (items.length + 1))}">
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="mqActivo" ${item?.activo === false ? '' : 'checked'}>
                        Mensaje activo (visible en la tienda)
                    </label>
                </div>
            </div>

            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    // Emoji picker: el botón de la carita junto al campo Mensaje inserta
    // emojis en la posición del cursor (widget reutilizable de emoji-picker.js).
    instalarEmojiPicker({ input: $('#mqTexto'), boton: $('#mqEmojiBtn') });

    $('#mqForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#mqForm').querySelector('[type="submit"]');

        const texto = $('#mqTexto').value.trim();
        if (!texto) {
            toast('El mensaje es obligatorio.', 'error');
            return;
        }

        // `id` vacío = mensaje nuevo. El botón ya viene deshabilitado en el
        // tope, pero si el panel está abierto en dos pestañas el `items` de
        // esta quedó viejo: el trigger de 0035 lo rechaza igual, esto sólo
        // evita que el error llegue como toast de servidor.
        if (!idExistente && items.length >= MAX_MENSAJES) {
            toast(`La barra marquee admite máximo ${MAX_MENSAJES} mensajes.`, 'error');
            return;
        }

        const payload = {
            texto,
            position: parseInt($('#mqPosition').value) || 0,
            activo: $('#mqActivo').checked
        };

        conCarga(submitBtn, guardarMensaje(payload, $('#mqId').value ? Number($('#mqId').value) : null))
            .then(() => { cerrarModal(); return renderizarGestor(contenedor); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarMensaje(payload, id) {
    const sb = await clienteAdmin();
    if (id) {
        const { error } = await sb.from('marquee_items').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { error } = await sb.from('marquee_items').insert(payload);
        if (error) throw new Error(error.message);
    }
    toast(id ? 'Mensaje actualizado.' : 'Mensaje creado.');
}

async function borrarMensaje(id, contenedor) {
    if (!(await confirmarBorrado('¿Eliminar este mensaje?'))) return;
    const sb = await clienteAdmin();
    const { error } = await sb.from('marquee_items').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    toast('Mensaje eliminado.');
    renderizarGestor(contenedor).catch((error) => toast(error.message, 'error'));
}
