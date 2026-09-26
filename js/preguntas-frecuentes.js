// Preguntas frecuentes (página faq.html).
// Carga dinámica desde Supabase (panel → Configuración → Preguntas frecuentes):
//   - datos no vacíos: reemplaza el contenido con los ítems del acordeón.
//   - total = 0 (tabla vacía, admin aún sin cargar): estado vacío neutro.
//   - 0 activas pero total > 0 (todas ocultas), o Supabase caída: se oculta.
//
// El HTML de faq.html llega sin contenido a propósito: la FAQ es contenido
// administrado y no debe vivir en el repositorio (ver el comentario del
// contenedor en faq.html).

import { obtenerPreguntasFrecuentes } from './utils.js';

function escapar(texto) {
    return String(texto ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// La respuesta del admin puede tener párrafos separados por líneas en blanco.
function formarRespuesta(respuesta) {
    const parrafos = (respuesta || '')
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
    if (!parrafos.length) return '<p></p>';
    return parrafos.map((p) => `<p>${escapar(p)}</p>`).join('');
}

function generarFaqItem(item) {
    const pregunta = escapar(item.pregunta);
    // Ícono FontAwesome opcional que acompaña al título (como pide el diseño actual).
    const icono = item.icono
        ? `<i class="${escapar(item.icono)} faq-question-icon" aria-hidden="true"></i>`
        : '';

    return `
        <div class="faq-item">
            <button class="faq-question" aria-expanded="false">
                ${icono}
                <span>${pregunta}</span>
                <i class="fa-solid fa-chevron-down faq-chevron" aria-hidden="true"></i>
            </button>
            <div class="faq-answer">
                ${formarRespuesta(item.respuesta)}
            </div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', async function () {
    const contenedor = document.querySelector('.faq-sections');
    if (!contenedor) return;

    const res = await obtenerPreguntasFrecuentes();

    // Sin Supabase o sin configurar: se oculta la sección. No hay contenido
    // de respaldo en el HTML (ver el comentario del contenedor en faq.html).
    if (!res) {
        contenedor.style.display = 'none';
        return;
    }

    // Tabla vacía (el admin todavía no cargó preguntas): se muestra un estado
    // vacío neutro. Antes caía al FAQ estático de faq.html, que describía los
    // medios de pago de la tienda original.
    if (res.total === 0) {
        contenedor.innerHTML = `
            <div class="faq-vacio">
                <p>Todavía no hay preguntas cargadas.</p>
            </div>`;
        return;
    }

    // Hay preguntas pero todas inactivas: se oculta la sección completa.
    if (res.datos.length === 0) {
        contenedor.style.display = 'none';
        return;
    }

    // Contenido dinámico gestionado desde el panel (Configuración → Preguntas
    // frecuentes).
    contenedor.innerHTML = res.datos.map(generarFaqItem).join('');
});