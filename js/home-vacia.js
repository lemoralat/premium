// ============================================================================
// home-vacia.js — Estado vacío del Home.
//
// Cuando la tienda no tiene NADA que mostrar (sin productos/servicios activos,
// sin carrusel, sin reseñas y sin iconos del pie), el Home deja de ser una
// página en blanco y muestra un mensaje distinto según quién mira:
//   - Visitante: "estamos armando la tienda" + botón de WhatsApp.
//   - Administrador logueado: "tu tienda ya está lista, cargá tus datos" +
//     botón al panel.
//
// Sólo se activa si las CUATRO cargas fueron exitosas y están vacías: un error
// de Supabase (carga ok:false) NO es una tienda vacía y no debe mostrar el
// cartel de "en construcción". Los cargadores comparten la caché en memoria de
// supabase.js, así que reutilizarlos no agrega consultas nuevas en el caso normal.
// ============================================================================

import {
    cargarConfiguracionGlobal,
    obtenerUrlWhatsApp,
    WHATSAPP_CONFIG
} from './utils.js';
import {
    cargarProductos,
    cargarCarrusel,
    cargarResenas,
    cargarIconosPie,
    esAdminActual
} from './supabase.js';

const TEXTO_VISITANTE = 'Estamos armando la tienda. Muy pronto vas a ver todo acá. Mientras tanto, escribinos por WhatsApp.';
const TEXTO_ADMIN = 'Tu tienda ya está lista. Falta cargar lo tuyo. Tu panel es el lugar para cargar productos, categorías y tu logo. Arrancá por ahí.';

document.addEventListener('DOMContentLoaded', async () => {
    const main = document.querySelector('main');
    if (!main) return;

    // Esperamos la config para leer el WhatsApp del negocio antes de armar el botón.
    await cargarConfiguracionGlobal();

    const cargas = await Promise.all([
        cargarProductos(),
        cargarCarrusel(),
        cargarResenas(),
        cargarIconosPie()
    ]);

    // Cualquier carga fallida (Supabase caído) => no es una tienda vacía: no
    // mostramos el estado, dejamos el comportamiento normal (secciones ocultas).
    if (!cargas.every((r) => r && r.ok)) return;

    const vacio = (r) => !Array.isArray(r.datos) || r.datos.length === 0;
    if (!cargas.every(vacio)) return;

    const esAdmin = await esAdminActual();
    activarHomeVacia(main, esAdmin);
});

function activarHomeVacia(main, esAdmin) {
    // La clase en <body> oculta las secciones del Home y muestra el bloque (CSS).
    document.body.classList.add('home-vacia-activa');

    const seccion = document.createElement('section');
    seccion.className = 'home-vacia';

    if (esAdmin) {
        seccion.innerHTML = `
            <img src="img/login.png" alt="Tu tienda está lista" width="768" height="675" decoding="async">
            <p>${TEXTO_ADMIN}</p>
            <a class="btn-primary btn-border" href="/admin/">Ir a mi panel</a>
        `;
    } else {
        // Sin WhatsApp configurado el botón no se muestra (convención del sitio).
        const wa = obtenerUrlWhatsApp(WHATSAPP_CONFIG.defaultMessage);
        seccion.innerHTML = `
            <img src="img/home.png" alt="Estamos armando la tienda" width="768" height="754" decoding="async">
            <p>${TEXTO_VISITANTE}</p>
            ${wa ? `<a class="btn-primary btn-border" href="${wa}" target="_blank" rel="noopener">Envíanos tu mensaje</a>` : ''}
        `;
    }

    main.appendChild(seccion);
}
