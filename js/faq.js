// Sistema de acordeón para preguntas frecuentes.
//
// Usa DELEGACIÓN de eventos para funcionar con los ítems estáticos de faq.html
// y también con los que inyecta de forma asíncrona js/preguntas-frecuentes.js
// (los que se cargan dinámicamente llegan al DOM después de DOMContentLoaded,
// así que no se pueden vincular uno a uno en el arranque).
//
// Verificación de XSS (V-2): el contenido administrado llega escapado desde el
// renderizador; este archivo solo manipula clases, atributos aria y estilos.

function toggleFaqItem(questionButton) {
    const faqItem = questionButton.parentElement;
    if (!faqItem) return;
    const answer = faqItem.querySelector('.faq-answer');
    if (!answer) return;

    // El chevron lleva la clase .faq-chevron en los ítems dinámicos; en el HTML
    // estático el botón tiene un único <i> que ES el chevron. Al seleccionar el
    // chevron explícitamente, el ícono FontAwesome de la pregunta (si existe) no
    // se rota por error.
    const icon = questionButton.querySelector('.faq-chevron') || questionButton.querySelector('i');
    const isExpanded = questionButton.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
        // Cerrar item
        questionButton.setAttribute('aria-expanded', 'false');
        faqItem.classList.remove('active');
        answer.style.maxHeight = '0';
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        // Abrir item
        questionButton.setAttribute('aria-expanded', 'true');
        faqItem.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
        if (icon) icon.style.transform = 'rotate(180deg)';
    }
}

function cerrarTodosLosItems() {
    document.querySelectorAll('.faq-question').forEach(question => {
        if (question.getAttribute('aria-expanded') === 'true') {
            toggleFaqItem(question);
        }
    });
}

// Abrir un item específico por ID (útil para enlaces directos)
function abrirFaqPorId(itemId) {
    const item = document.getElementById(itemId);
    if (item) {
        const question = item.querySelector('.faq-question');
        if (question) {
            toggleFaqItem(question);
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    // Delegación sobre el documento: cubre ítems estáticos y dinámicos.
    document.addEventListener('click', (event) => {
        const question = event.target.closest('.faq-question');
        if (!question) return;
        toggleFaqItem(question);
    });

    // Accesibilidad: abrir/cerrar con Enter o Espacio (delegado igual que el click).
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const question = event.target.closest('.faq-question');
        if (!question) return;
        event.preventDefault();
        toggleFaqItem(question);
    });
});