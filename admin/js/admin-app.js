// ============================================================================
// admin-app.js — Router del panel de administración.
// Protege el acceso (requiere sesión), renderiza el shell y delega cada sección
// a su módulo. Navegación por hash: #/productos, #/pedidos, etc.
// ============================================================================

import { protegerAdmin, cerrarSesionAdmin } from './auth.js';
import { esc, $ } from './admin-ui.js';

import * as dashboard from './dashboard.js';
import * as productos from './productos.js';
import * as categorias from './categorias.js';
import * as pedidos from './pedidos.js';
import * as cupones from './cupones.js';
import * as slider from './slider.js';
import * as banners from './banners.js';
import * as resenas from './resenas.js';
import * as iconosPie from './iconos-pie.js';
import * as configuracion from './configuracion.js';
import * as cuenta from './cuenta.js';

const secciones = {
    dashboard:     { ...dashboard,     titulo: 'Dashboard' },
    productos:     { ...productos,     titulo: 'Productos' },
    categorias:    { ...categorias,    titulo: 'Categorías' },
    pedidos:       { ...pedidos,       titulo: 'Pedidos' },
    cupones:       { ...cupones,       titulo: 'Cupones' },
    slider:        { ...slider,        titulo: 'Slider' },
    banners:       { ...banners,       titulo: 'Banners' },
    resenas:       { ...resenas,       titulo: 'Reseñas' },
    iconosPie:     { ...iconosPie,     titulo: 'Iconos' },
    configuracion: { ...configuracion, titulo: 'Configuración' },
    cuenta:        { ...cuenta,        titulo: 'Mi cuenta' }
};

let navegando = false;

async function navegar() {
    if (navegando) return;
    navegando = true;

    const hash = (window.location.hash || '#/dashboard').replace(/^#\//, '').split('?')[0];
    const nombre = secciones[hash] ? hash : 'dashboard';
    const definicion = secciones[nombre];

    const titulo = $('#adminTopbarTitle');
    if (titulo) titulo.textContent = definicion.titulo;

    document.querySelectorAll('#adminNav a').forEach((a) => {
        a.classList.toggle('active', a.dataset.seccion === nombre);
    });

    const contenedor = $('#adminView');
    if (contenedor) {
        contenedor.innerHTML = '<p class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando…</p>';
        try {
            await definicion.renderizar(contenedor);
        } catch (error) {
            console.error(`Error en sección ${nombre}:`, error);
            contenedor.innerHTML = `
                <div class="admin-error">
                    <p><strong>Ocurrió un error al cargar esta sección.</strong></p>
                    <p>${esc(error.message || String(error))}</p>
                </div>`;
        }
    }

    navegando = false;
}

// ---------- Menú móvil ----------
function configurarMenuMovil() {
    const sidebar = $('#adminSidebar');
    const btnMenu = $('#btnMenu');
    if (!sidebar || !btnMenu) return;

    btnMenu.addEventListener('click', () => sidebar.classList.toggle('abierta'));

    document.addEventListener('click', (event) => {
        if (sidebar.classList.contains('abierta')
            && !sidebar.contains(event.target)
            && !btnMenu.contains(event.target)) {
            sidebar.classList.remove('abierta');
        }
    });

    document.querySelectorAll('#adminNav a').forEach((a) => {
        a.addEventListener('click', () => sidebar.classList.remove('abierta'));
    });
}

// ---------- Arranque ----------
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await protegerAdmin();
    if (!sesion) return;

    const emailEl = $('#adminUserEmail');
    if (emailEl) emailEl.textContent = sesion.user.email || '';

    const btnLogout = $('#btnLogout');
    if (btnLogout) btnLogout.addEventListener('click', () => cerrarSesionAdmin());

    configurarMenuMovil();

    window.addEventListener('hashchange', navegar);
    navegar();
});