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
// ----------------------------------------------------------------------------
// Cookie de sesión del /admin (guard de servidor).
// ----------------------------------------------------------------------------
// La sesión vive en el cliente (Supabase guarda el access_token en
// localStorage; este archivo lo espeja en una cookie de ámbito /admin para
// que el guard de servidor pueda validar el acceso ANTES de servir cualquier
// página del panel. Se refresca en cada evento de auth (inicio de sesión,
// refresh de token, cierre) y se borra al cerrar sesión.
//
// V-3 (auditoría M4): la cookie ES HttpOnly, porque la escribe el SERVIDOR vía
// /api/sesion (document.cookie no puede emitir HttpOnly). El cliente MANTIENE
// el token en localStorage (lo usa el SDK), pero la cookie no puede leerse por
// JS → una XSS en el panel no la puede exfiltrar.
//
// Fallback: si /api/sesion no responde (offline, deploy parcial, dev local sin
// API), se degrada a document.cookie con los mismos atributos para NO romper
// el acceso del admin. En ese modo la cookie no es HttpOnly (mismo estado que
// antes de la V-3), pero la sesión sigue funcionando.
// ----------------------------------------------------------------------------
const COOKIE_TOKEN = 'lemora_admin_token';

async function sincronizarCookieSesion(event, session) {
    if (typeof document === 'undefined') return; // fuera del navegador
    const token = event === 'SIGNED_OUT' ? '' : (session?.access_token || '');

    try {
        const resp = await fetch('/api/sesion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(token ? { token } : { limpiar: true })
        });
        if (resp.ok) return; // cookie HttpOnly escrita por el servidor
        console.warn('sincronizarCookieSesion: /api/sesion no respondió OK, se usa fallback local.');
    } catch (error) {
        console.warn('sincronizarCookieSesion: error conectando /api/sesion, se usa fallback local:', error?.message);
    }

    // Fallback (mismo comportamiento que antes de la V-3): cookie sin HttpOnly.
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