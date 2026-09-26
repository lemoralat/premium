// Preguntas frecuentes (página faq.html).
// Carga dinámica desde Supabase (panel → Configuración → Preguntas frecuentes):
//   - total = 0 (tabla vacía, admin aún sin cargar): HTML estático actual.
//   - 0 activas pero total > 0 (todas ocultas): se oculta la sección.
//   - datos no vacíos: reemplaza el contenido con los ítems del acordeón.
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

    const res = await obtenerPreguntasFrecuentes();

    // Supabase caído o sin configurar: se mantiene el HTML estático actual.
    if (!res) return;

    // Tabla vacía (el admin todavía no cargó preguntas): fallback al contenido
    // estático de faq.html, tal como documenta la migración 0014.
    if (res.total === 0) return;

    // Hay preguntas pero todas inactivas: se oculta la sección completa.
    if (res.datos.length === 0) {
        contenedor.style.display = 'none';
        return;
    }

    // Contenido dinámico gestionado desde el panel (Configuración → Preguntas
    // frecuentes).
    contenedor.innerHTML = res.datos.map(generarFaqItem).join('');
});