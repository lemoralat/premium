// ============================================================================
// admin-supabase.js — Cliente Supabase del DASHBOARD (autenticado).
//
// Usa la anon key (pública) + Supabase Auth. La service_role key nunca se
// carga en el navegador: queda exclusivamente en api/pedido.js (Vercel).
// La sesión del admin se persiste (persistSession: true).
// ============================================================================

import { SUPABASE_CONFIG } from '../../js/env.generated.js';

// ----------------------------------------------------------------------------
// Sesión admin → cookie para el middleware de Vercel (middleware.js).
//
// El SDK persiste la sesión en localStorage, y Vercel Edge no puede leer
// localStorage. Espejamos el access_token en una cookie de ámbito /admin
// para que el guard de servidor pueda validar el acceso ANTES de servir
// cualquier página del panel. Se refresca en cada evento de auth (inicio de
// sesión, refresh de token, cierre) y se borra al cerrar sesión.
// ----------------------------------------------------------------------------
const COOKIE_TOKEN = 'lemora_admin_token';

function sincronizarCookieSesion(event, session) {
    if (typeof document === 'undefined') return; // fuera del navegador
    const token = event === 'SIGNED_OUT' ? '' : (session?.access_token || '');
    const base = `${COOKIE_TOKEN}=${token}; Path=/admin; SameSite=Lax; Secure`;
    if (token) {
        document.cookie = `${base}; Max-Age=604800`;
    } else {
        document.cookie = `${base}; Max-Age=0`;
    }
}

let cliente = null;
let promesa = null;

export function clienteAdmin() {
    if (cliente) return Promise.resolve(cliente);
    if (!promesa) {
        promesa = (async () => {
            if (!SUPABASE_CONFIG || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.publishableKey) {
                throw new Error('Supabase no configurado. Ejecutá `npm run build:env` con tus variables.');
            }
            const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm');
            cliente = mod.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey);
            cliente.auth.onAuthStateChange(sincronizarCookieSesion);
            return cliente;
        })();
    }
    return promesa;
}