// Iconos del pie del home (sección iconos-pie).
// Carga dinámica desde Supabase. Sin datos, la sección se oculta.

import { obtenerIconosPie } from './utils.js';

function escapar(texto) {
    return String(texto ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function generarIcono(icono) {
    const titulo = escapar(icono.titulo);
    const descripcion = escapar(icono.descripcion);

    // Ícono de Font Awesome (configurado desde el dashboard) o imagen.
    const visual = icono.icono
        ? `<div class="icono-icono"><i class="${escapar(icono.icono)}" aria-hidden="true"></i></div>`
        : icono.imagen
            ? `<img loading="lazy" src="${escapar(icono.imagen)}" alt="${titulo}" width="60" height="60">`
            : '<div class="icono-icono"><i class="fa-regular fa-image" aria-hidden="true"></i></div>';

    return `
        <div class="icono">
            ${visual}
            <h3>${titulo}</h3>
            <p>${descripcion}</p>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', async function () {
    const contenedor = document.getElementById('iconosPie');
    const seccion = document.querySelector('.iconos-pie');
    if (!contenedor) return;

    // Cargar iconos (tabla iconos_pie).
    // - Array no vacío: iconos activos de la BD.
    // - [] (tabla vacía) o null (Supabase caído): ocultar la sección.
    //
    // OJO: antes, con Supabase caído, se caía a ICONOS_ESTATICOS: tres
    // beneficios con texto de esta tienda concreta ("mercadopago", "villeter[a]
    // virtual número 1 de Argentina", "los pedidos salen desde Córdoba"). En
    // una plantilla que se reparte entre clientes, esos textos describen a la
    // tienda que.originó el template, no a quien la compró. Ahora la sección
    // desaparece si no hay datos, como el slider.
    const iconos = await obtenerIconosPie();
    if (!iconos || iconos.length === 0) {
        if (seccion) seccion.style.display = 'none';
        return;
    }

    const datos = iconos.map((i) => ({
        titulo: i.titulo,
        descripcion: i.descripcion,
        imagen: i.imagen || '',
        icono: i.icono || (i.imagen ? '' : 'fa-regular fa-image')
    }));

    contenedor.innerHTML = datos.map(generarIcono).join('');
});