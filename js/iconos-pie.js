// Iconos del pie del home (sección iconos-pie).
// Carga dinámica: Supabase primero, fallback a js/iconos-pie.json y, en última
// instancia, a los 3 iconos estáticos originales (mismo diseño que siempre).

import { obtenerIconosPie, imagenOptimizada } from './utils.js';

const ICONOS_ESTATICOS = [
    {
        titulo: 'Muchas formas de pago',
        descripcion: 'Trabajo con mercadopago, lo cuál se aceptan todos los medios de pagos de la villetera virtual número 1 de Argentina, para que compres con total confianza.',
        imagen: 'img/icons/icono-pagos.png'
    },
    {
        titulo: 'Envíos a toda Argentina',
        descripcion: 'Envío a toda la Argentina de norte a sur, todos los pedidos salen desde Córdoba, Argentina y pueden variar dependiendo tu ubicación.',
        imagen: 'img/icons/icono-envios.png'
    },
    {
        titulo: 'Stock siempre disponible',
        descripcion: 'Toda la web opera bajo pedido, compra con total confianza, yo me comunicaré contigo personalmente para asegurar que llegue lo que pidas.',
        imagen: 'img/icons/icono-stock.png'
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
    const imagen = escapar(icono.imagen);

    return `
        <div class="icono">
            <img loading="lazy" src="${imagen}" alt="${titulo}" width="60" height="60">
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
        imagen: imagenOptimizada(i.imagen) || 'img/icons/icono-pagos.png'
    }));

    contenedor.innerHTML = datos.map(generarIcono).join('');
});