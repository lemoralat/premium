// ============================================================================
// admin-app.js — Router del panel de administración.
// Protege el acceso (requiere sesión), renderiza el shell y delega cada sección
// a su módulo. Navegación por hash: #/productos, #/pedidos, etc.
// ============================================================================

import { protegerAdmin, cerrarSesionAdmin } from './auth.js';
import { esc, $, urlPublica, cerrarModal } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { hayCambios, confirmarSalida, guardarCambiosPendientes, limpiarVigilancia } from './cambios-sin-guardar.js';

import * as dashboard from './dashboard.js';
import * as diseno from './diseno.js';
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
    diseno:        { ...diseno,        titulo: 'Diseño' },
    productos:     { ...productos,     titulo: 'Productos' },
    categorias:    { ...categorias,    titulo: 'Categorías' },
    pedidos:       { ...pedidos,       titulo: 'Pedidos' },
    cupones:       { ...cupones,       titulo: 'Descuentos' },
    slider:        { ...slider,        titulo: 'Slider' },
    banners:       { ...banners,       titulo: 'Banners' },
    resenas:       { ...resenas,       titulo: 'Reseñas' },
    'iconos-pie':  { ...iconosPie,     titulo: 'Iconos' },
    configuracion: { ...configuracion, titulo: 'Configuración' },
    cuenta:        { ...cuenta,        titulo: 'Mi cuenta' }
};

let navegando = false;
let seccionActual = 'dashboard';

async function navegar() {
    if (navegando) return;
    navegando = true;

    const hash = (window.location.hash || '#/dashboard').replace(/^#\//, '').split('?')[0];
    const nombre = secciones[hash] ? hash : 'dashboard';

    // Cambios sin guardar: si hay cambios en la sección actual y se intenta ir
    // a otra, se pregunta antes de avanzar (Guardar / Descartar / Cancelar).
    if (nombre !== seccionActual && hayCambios()) {
        try {
            const decision = await confirmarSalida();
            if (decision === 'cancelar') {
                // Vuelve la URL a la sección actual sin disparar otro render.
                if (window.location.hash !== `#/${seccionActual}`) {
                    history.replaceState(null, '', `#/${seccionActual}`);
                }
                navegando = false;
                return;
            }
            if (decision === 'guardar') {
                await guardarCambiosPendientes();
            } else {
                limpiarVigilancia();
            }
            cerrarModal(); // si quedó un modal abierto, se cierra al cambiar de sección
        } catch (error) {
            console.error('Error al resolver cambios sin guardar:', error);
            limpiarVigilancia();
            cerrarModal();
        }
    }

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

    seccionActual = nombre;

    navegando = false;
}

// ---------- Menú móvil ----------
function configurarMenuMovil() {
    const sidebar = $('#adminSidebar');
    const btnMenu = $('#btnMenu');
    if (!sidebar || !btnMenu) return;

    const abrir = (abierto) => {
        sidebar.classList.toggle('abierta', abierto);
        document.body.classList.toggle('menu-abierta', abierto);
    };

    btnMenu.addEventListener('click', () => abrir(!sidebar.classList.contains('abierta')));

    document.addEventListener('click', (event) => {
        if (sidebar.classList.contains('abierta')
            && !sidebar.contains(event.target)
            && !btnMenu.contains(event.target)) {
            abrir(false);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('abierta')) abrir(false);
    });

    document.querySelectorAll('#adminNav a').forEach((a) => {
        a.addEventListener('click', () => abrir(false));
    });
}

// Branding del panel: usa el logotipo configurado en Diseño (settings.logo_path)
// y el nombre de la tienda (Configuración → Datos generales, settings.site_name);
// si no hay logotipo cargado queda el default de lemora (../img/lemora.svg) y si
// no hay nombre, se mantiene "Lemora Administración". También actualiza el
// favicon, igual que la tienda. No bloquea el arranque del panel.
async function aplicarBrandingPanel() {
    const img = document.querySelector('.admin-brand img');
    const nombreEl = document.querySelector('#adminBrandName');
    const iconos = document.querySelectorAll('link[rel="icon"]');
    const ruta = await (async () => {
        try {
            const sb = await clienteAdmin();
            const { data } = await sb.from('settings').select('logo_path, site_name').eq('id', 1).single();

            const nombre = (data?.site_name || '').trim();
            if (nombre && nombreEl) {
                // Reemplaza "Lemora" por el nombre real de la tienda, conservando
                // la segunda línea "Administración" (bloque de marca del panel).
                nombreEl.innerHTML = `${esc(nombre)}<br>Administración`;
            }

            return data?.logo_path || '';
        } catch {
            return ''; // sin acceso o sin configuración: default
        }
    })();

    const fuente = ruta ? urlPublica(ruta) : '../img/lemora.svg';
    if (img) img.src = fuente;
    iconos.forEach((el) => {
        el.href = fuente;
        if (ruta) el.removeAttribute('type'); // favicon subido puede ser PNG
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

    aplicarBrandingPanel(); // no bloquea el routing

    window.addEventListener('hashchange', navegar);
    navegar();
});
