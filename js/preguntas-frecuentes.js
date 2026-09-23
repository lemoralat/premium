// Preguntas frecuentes (página faq.html).
// Carga dinámica desde Supabase (sección "Preguntas frecuentes" del dashboard):
//   - Array no vacío: reemplaza el contenido con los ítems del acordeón.
//   - [] (sin filas activas): oculta la sección.
//   - null (red/Supabase caída): se mantiene el HTML estático actual como
//     fallback (misma estrategia que iconos-pie).

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

    const preguntas = await obtenerPreguntasFrecuentes();

    // Sin preguntas activas: ocultar la sección (el header de la página se mantiene).
    if (preguntas && preguntas.length === 0) {
        contenedor.style.display = 'none';
        return;
    }

    // Fallback (Supabase caído): respetar el HTML estático actual.
    if (!preguntas) return;

    contenedor.innerHTML = preguntas.map(generarFaqItem).join('');
});