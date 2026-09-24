// ============================================================================
// middleware.js — Guard de servidor (Vercel Edge) para /admin*.
//
// El panel es una página estática: sin este guard, cualquiera que entre a
// /admin (o /admin/ sin slash) ve el shell del panel aunque el JS del cliente
// falle o esté desactivado. Este middleware valida la sesión ANTES de servir
// cualquier página admin:
//
//   1. Lee la cookie `lemora_admin_token` (espejo del access_token que escribe
//      admin-supabase.js en el navegador).
//   2. Sin token → 307 a /admin/login.html (el shell jamás se sirve).
//   3. Con token → valida con el RPC es_admin de Supabase (la misma policy que
//      usa el panel). Si no es admin → 307 a login.
//
// Los assets (css/js) y las páginas públicas (login/recuperar) pasan siempre.
// ============================================================================

import { NextResponse } from 'next/server';
import { SUPABASE_CONFIG } from './js/env.generated.js';

// Se pueden sobreescribir con variables de entorno en Vercel; por defecto usa
// la configuración pública del repositorio (URL del proyecto + anon key).
const SUPABASE_URL = process.env.SUPABASE_URL || SUPABASE_CONFIG.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || SUPABASE_CONFIG.publishableKey;
const COOKIE_TOKEN = 'lemora_admin_token';

// Páginas públicas del panel y assets: no requieren sesión.
const RUTAS_PUBLICAS = new Set(['/admin/login.html', '/admin/recuperar.html']);
const RE_ASSETS = /^\/admin\/(css|js|img)\/.*$/;

export const config = {
    matcher: ['/admin/:path*']
};

export default async function middleware(req) {
    const { pathname } = req.nextUrl;

    if (RUTAS_PUBLICAS.has(pathname) || RE_ASSETS.test(pathname)) {
        return NextResponse.next();
    }

    const token = req.cookies.get(COOKIE_TOKEN)?.value;
    if (!token) {
        return NextResponse.redirect(new URL('/admin/login.html', req.url));
    }

    try {
        // es_admin() devuelve true/false (JSON): solo devuelve true para
        // usuarios presentes en la tabla public.admins. Anónimos y
        // no-admins devuelven false (o 401 con token inválido) → se redirige
        // a login. La comprobación es sobre `=== true`, no sobre el status.
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/es_admin`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: '{}'
        });
        const esAdmin = resp.ok && (await resp.json()) === true;
        if (esAdmin) return NextResponse.next();
    } catch {
        // Sin respuesta de Supabase: ante la duda, no exponer el panel.
    }

    return NextResponse.redirect(new URL('/admin/login.html', req.url));
}