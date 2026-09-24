// ============================================================================
// proxy.ts — Guard de servidor (Vercel Routing Middleware) para /admin*.
//
// Ejecuta ANTES de servir cualquier archivo bajo /admin:
//
//   1. Lee la cookie `lemora_admin_token` (espejo del access_token que escribe
//      admin-supabase.js en el navegador).
//   2. Sin token → 307 a /admin/login.html (el shell admin jamás se sirve).
//   3. Con token → valida contra el RPC es_admin de Supabase (=== true, la
//      misma policy que usa el panel). No-admin o token inválido → 307 a login.
//
// Solo las páginas públicas del panel y sus assets exactos pasan sin sesión:
// login.html, recuperar.html, admin.css y el grafo de módulos que cargan esas
// páginas (login.js, recuperar.js, admin-supabase.js). Todo lo demás — el
// shell del dashboard y los módulos de sus secciones — queda detrás del guard.
//
// IMPORTANTE: si en el futuro se agrega una página pública nueva bajo /admin,
// hay que whitelistearla acá (y sus imports), o quedará bloqueada por el guard.
//
// Se configura en vercel.json (proxy.entrypoint + proxy.matcher). La extensión
// .ts está en el schema oficial de vercel.json (js|ts|py) y Vercel la transpila
// como ESM sin importar el "type" de package.json — por eso NO usamos .mjs
// (rechazado por el schema) ni "type": "module" (rompería api/*.js que son CJS).
// Usa Web APIs estándar (Request/Response) + next() de @vercel/functions:
// el contrato de Routing Middleware para proyectos SIN framework (no Next.js).
// ============================================================================

import { next } from '@vercel/functions';

// Configuración pública (misma que js/env.generated.js). Se puede sobreescribir
// con variables de entorno en Vercel; los literales son solo fallback.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://euvddavykjiixofivglt.supabase.co';
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_DDq78TsFiLqDaq3sRS68Qw_ZxYWYYSF';
const COOKIE_TOKEN = 'lemora_admin_token';

// Páginas públicas del panel (no requieren sesión).
const RUTAS_PUBLICAS = new Set([
    '/admin/login.html',
    '/admin/recuperar.html'
]);

// Assets públicos: únicamente el grafo exacto que cargan esas páginas.
// (login.js → admin-supabase.js → /js/env.generated.js, este último fuera de
// /admin, siempre público.)
const ASSETS_PUBLICOS = new Set([
    '/admin/css/admin.css',
    '/admin/js/login.js',
    '/admin/js/recuperar.js',
    '/admin/js/admin-supabase.js'
]);

function esRutaPublica(pathname: string): boolean {
    return RUTAS_PUBLICAS.has(pathname) || ASSETS_PUBLICOS.has(pathname);
}

// Extrae el valor de la cookie espejo desde el header Cookie.
function leerToken(request: Request): string | null {
    const cookie = request.headers.get('cookie') || '';
    for (const par of cookie.split(';')) {
        const [nombre, ...resto] = par.trim().split('=');
        if (nombre === COOKIE_TOKEN) return resto.join('=').trim();
    }
    return null;
}

const redirigirALogin = (request: Request): Response =>
    Response.redirect(new URL('/admin/login.html', request.url), 307);

export default async function middleware(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Páginas y assets públicos pasan directo (siguen la cadena).
    if (esRutaPublica(pathname)) {
        return next();
    }

    const token = leerToken(request);
    if (!token) {
        return redirigirALogin(request);
    }

    try {
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
        // es_admin() devuelve true/false (JSON): solo true para usuarios de
        // public.admins. Anónimos y no-admins → false (o 401 con token
        // inválido) → se redirige a login. La comprobación es sobre === true.
        const esAdmin = resp.ok && (await resp.json()) === true;
        if (esAdmin) return next();
    } catch {
        // Sin respuesta de Supabase: ante la duda, no exponer el panel.
    }

    return redirigirALogin(request);
}