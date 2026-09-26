// preguntas-frecuentes.js — Gestor de preguntas frecuentes (widget reutilizable).
// Se monta dentro de la sección "Configuración" del panel (configuracion.js),
// debajo del formulario del popup de salida.
//
// Repeater field: cada fila es una pregunta con respuesta y un ícono FontAwesome
// opcional (selector curado con buscador, compartido con la sección "Iconos").
// Mientras no haya preguntas activas, la tienda mantiene el contenido estático
// actual de faq.html como fallback.

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { montarSelectorIconos } from './selector-iconos.js';

let preguntas = [];

// Tope de preguntas. La garantía real está en la BD (trigger
// trg_preguntas_frecuentes_max, migración 0041): esto es la parte amable, que
// evita que el admin llegue al error. El trigger cuenta TODAS las filas, y acá
// también: una pregunta oculta sigue ocupando un lugar en la tabla.
const MAX_PREGUNTAS = 20;

// Renderiza el gestor completo dentro de `contenedor` (el <div> de un
// .admin-card de Configuración). Al guardar/borrar se re-renderiza SOLO este
// contenedor, para no descartar cambios sin guardar de los demás formularios.
export async function renderizarGestor(contenedor) {
    contenedor.innerHTML = '<p class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando preguntas…</p>';

    const sb = await clienteAdmin();
    const { data, error } = await sb.from('preguntas_frecuentes').select('*').order('position', { ascending: true });
    if (error) throw error;
    preguntas = data || [];

    // El botón se apaga al llegar al tope. `preguntas` se relee en cada
    // renderizado, así que el estado nunca queda desfasado tras un borrado.
    const alTope = preguntas.length >= MAX_PREGUNTAS;
    const quedan = MAX_PREGUNTAS - preguntas.length;

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Se muestran en la página de ayuda (/faq). Mientras no haya preguntas activas, la tienda usa el contenido estático actual.</p>
            <button type="button" class="btn btn-primary" id="btnNuevaPregunta" ${alTope ? 'disabled title="Límite alcanzado"' : ''}>
                <i class="fa-solid fa-plus"></i> Nueva pregunta
            </button>
        </div>
        <p class="hint">Máximo ${MAX_PREGUNTAS} preguntas. ${alTope
            ? 'Límite alcanzado: borrá alguna para crear otra (desactivar no libera lugar).'
            : `Te quedan ${quedan}.`}</p>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Pregunta</th><th>Orden</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    if (!alTope) {
        $('#btnNuevaPregunta').addEventListener('click', () => abrirModalPregunta(null, contenedor));
    }
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalPregunta(Number(btn.dataset.editar), contenedor));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarPregunta(Number(btn.dataset.borrar), contenedor));
    });
}

function filas() {
    if (!preguntas.length) {
        return `<tr><td colspan="4"><div class="admin-empty"><p>No hay preguntas todavía. Creá la primera para empezar a alimentar la página de ayuda.</p></div></td></tr>`;
    }
    return preguntas.map((p) => `
        <tr>
            <td class="td-principal">
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    ${p.icono
                        ? `<span class="admin-icono-mini"><i class="${esc(p.icono)}" aria-hidden="true"></i></span>`
                        : `<span class="admin-icono-mini sin-icono"><i class="fa-solid fa-minus" aria-hidden="true"></i></span>`}
                    <strong>${esc(p.pregunta)}</strong>
                </div>
            </td>
            <td data-label="Orden">${esc(p.position ?? 0)}</td>
            <td data-label="Estado">${p.activo
                ? '<span class="estado-badge estado-entregado">Activa</span>'
                : '<span class="estado-badge estado-cancelado">Inactiva</span>'}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(p.id)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(p.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function abrirModalPregunta(idExistente, contenedor) {
    const pregunta = idExistente ? preguntas.find((p) => p.id === idExistente) : null;

    abrirModal(`
        <h2>${pregunta ? 'Editar pregunta' : 'Nueva pregunta'}</h2>
        <p class="modal-sub">${pregunta ? esc(pregunta.pregunta) : 'La página de preguntas frecuentes se arma con estos ítems'}</p>
        <form class="admin-form" id="pfForm">
            <input type="hidden" id="pfId" value="${pregunta ? pregunta.id : ''}">
            <input type="hidden" id="pfIcono" value="${esc(pregunta?.icono || '')}">

            <div class="admin-field full">
                <label for="pfBuscar">Ícono FontAwesome</label>
                <input type="search" id="pfBuscar" class="admin-url-input" placeholder="Buscar ícono… (ej. camión, escudo, tarjeta)">
                <div class="admin-iconos-grid" id="pfGrilla" role="listbox" aria-label="Catálogo de íconos"></div>
                <p class="admin-icono-vacio" id="pfVacio" hidden>Sin resultados. Probá con otra palabra.</p>
                <span class="hint">Opcional. Acompaña al título de la pregunta para seguir el diseño actual. Vacío = sin ícono.</span>
            </div>

            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="pfPregunta">Pregunta <span style="color:var(--danger);">*</span></label>
                    <input type="text" id="pfPregunta" required value="${esc(pregunta?.pregunta || '')}">
                    <span class="hint">Obligatoria. Se muestra como encabezado (título) de cada ítem del acordeón.</span>
                </div>
                <div class="admin-field">
                    <label for="pfPosition">Orden</label>
                    <input type="number" id="pfPosition" min="0" step="1" value="${esc(pregunta?.position ?? (preguntas.length + 1))}">
                </div>
                <div class="admin-field full">
                    <label for="pfRespuesta">Respuesta</label>
                    <textarea id="pfRespuesta" rows="6">${esc(pregunta?.respuesta || '')}</textarea>
                    <span class="hint">Cada línea en blanco separa párrafos.</span>
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="pfActivo" ${pregunta?.activo === false ? '' : 'checked'}>
                        Pregunta activa (visible en la tienda)
                    </label>
                </div>
            </div>

            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    // Selector de íconos del catálogo curado (compartido con la sección "Iconos").
    montarSelectorIconos({
        inputId: 'pfIcono',
        buscarId: 'pfBuscar',
        grillaId: 'pfGrilla',
        vacioId: 'pfVacio'
    });

    $('#pfForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#pfForm').querySelector('[type="submit"]');

        const idValor = $('#pfId').value;
        // `idValor` vacío = pregunta nueva. El botón ya viene deshabilitado en
        // el tope, pero si el panel está abierto en dos pestañas el
        // `preguntas` de esta quedó viejo: el trigger de 0041 lo rechaza igual,
        // esto sólo evita que el error llegue como toast de servidor.
        if (!idValor && preguntas.length >= MAX_PREGUNTAS) {
            toast(`El FAQ admite máximo ${MAX_PREGUNTAS} preguntas.`, 'error');
            return;
        }

        const preguntaTxt = $('#pfPregunta').value.trim();
        if (!preguntaTxt) {
            toast('La pregunta es obligatoria.', 'error');
            return;
        }

        const iconoClase = $('#pfIcono').value.trim();
        const payload = {
            icono: iconoClase || null,
            pregunta: preguntaTxt,
            respuesta: $('#pfRespuesta').value.trim(),
            position: parseInt($('#pfPosition').value) || 0,
            activo: $('#pfActivo').checked
        };

        conCarga(submitBtn, guardarPregunta(payload, $('#pfId').value ? Number($('#pfId').value) : null))
            .then(() => { cerrarModal(); return renderizarGestor(contenedor); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarPregunta(payload, id) {
    const sb = await clienteAdmin();
    if (id) {
        const { error } = await sb.from('preguntas_frecuentes').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { error } = await sb.from('preguntas_frecuentes').insert(payload);
        if (error) throw new Error(error.message);
    }
    toast(id ? 'Pregunta actualizada.' : 'Pregunta creada.');
}

async function borrarPregunta(id, contenedor) {
    if (!(await confirmarBorrado('¿Eliminar esta pregunta?'))) return;
    const sb = await clienteAdmin();
    const { error } = await sb.from('preguntas_frecuentes').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    toast('Pregunta eliminada.');
    renderizarGestor(contenedor).catch((error) => toast(error.message, 'error'));
}