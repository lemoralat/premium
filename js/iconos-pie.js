// Iconos del pie del home (sección iconos-pie).
// Carga dinámica: Supabase primero y fallback a los iconos de Tabler de abajo.

import { obtenerIconosPie, imagenOptimizada } from './utils.js';

const ICONOS_ESTATICOS = [
    {
        titulo: 'Muchas formas de pago',
        descripcion: 'Trabajo con mercadopago, lo cuál se aceptan todos los medios de pagos de la villetera virtual número 1 de Argentina, para que compres con total confianza.',
        icono: 'ti ti-credit-card'
    },
    {
        titulo: 'Envíos a toda Argentina',
        descripcion: 'Envío a toda la Argentina de norte a sur, todos los pedidos salen desde Córdoba, Argentina y pueden variar dependiendo tu ubicación.',
        icono: 'ti ti-truck'
    },
    {
        titulo: 'Stock siempre disponible',
        descripcion: 'Toda la web opera bajo pedido, compra con total confianza, yo me comunicaré contigo personalmente para asegurar que llegue lo que pidas.',
        icono: 'ti ti-box'
    }
];

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

    // Ícono de Tabler (configurado desde el dashboard) o imagen.
    // Ojo: acá el valor YA viene con el prefijo `ti` (lo guarda la columna
    // iconos_pie.icono), así que no se agrega otra vez.
    const visual = icono.icono
        ? `<div class="icono-icono"><i class="${escapar(icono.icono)}" aria-hidden="true"></i></div>`
        : icono.imagen
            ? `<img loading="lazy" src="${escapar(icono.imagen)}" alt="${titulo}" width="60" height="60">`
            : '<div class="icono-icono"><i class="ti ti-photo" aria-hidden="true"></i></div>';

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

    // Cargar iconos (Supabase primero, fallback a JSON).
    // - Array no vacío: iconos activos de la BD
    // - null (red/cache caída): fallback estático
    // - [] (sin iconos activos): ocultar la sección
    const iconos = await obtenerIconosPie();
    if (iconos && iconos.length === 0 && seccion) {
        seccion.style.display = 'none';
        return;
    }

    const datos = (iconos || ICONOS_ESTATICOS).map((i) => ({
        titulo: i.titulo,
        descripcion: i.descripcion,
        imagen: imagenOptimizada(i.imagen) || '',
        icono: i.icono || (i.imagen ? '' : 'ti ti-photo')
    }));

    contenedor.innerHTML = datos.map(generarIcono).join('');
});