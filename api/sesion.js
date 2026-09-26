// ============================================================================
// api/sesion.js — Puente de sesión del panel admin (ciego, sin lógica).
//
// MOTIVO (auditoría V-3, hallazgo M4): la cookie `lemora_admin_token` se
// escribía desde el navegador con document.cookie, y eso impide HttpOnly:
// cualquier XSS en el panel la habría exfiltrado. document.cookie NO puede
// emitir HttpOnly; solo lo puede hacer el servidor con el header Set-Cookie.
//
// Este endpoint hace justamente eso, sin lógica de sesión: recibe el
// access_token JWT que el cliente ya validó contra Supabase y lo espeja en la
// MISMA cookie que sigue leyendo el guard de servidor (proxy.ts → /admin*).
//
//   POST /api/sesion  { token: "<access_token>" } → sienta la cookie (7 días).
//   POST /api/sesion  { limpiar: true } (o token vacío) → expira la cookie.
//
// Seguridad:
//   - El valor se valida como JWT compacto (3 segmentos base64url): solo
//     caracteres seguros, sin ';' ni CR/LF → no hay header injection.
//     El guard igual valida el token contra es_admin() ANTES de servir.
//   - Cookie: Path=/admin (mismo ámbito), SameSite=Lax, Secure, HttpOnly.
//   - Origen: misma política que los otros endpoints (deny los POSTs
//     cross-site no autorizados).
// ============================================================================

const COOKIE_TOKEN = 'lemora_admin_token';

// JWT compacto: 3 segmentos base64url separados por '.' (los base64url solo
// usan A-Za-z0-9_- , y el header/payload/firma no pueden contener ';' ni CR/LF).
const JWT_COMPACTO = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// Política de orígenes compartida: ver api/_lib/origenes.js. No volver a
// copiar la lista de permitidos en un cuarto handler.
const { origenPermitido } = require('./_lib/origenes.js');

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.method !== 'POST') {
        return response.status(405).json({ status: 'error', message: 'Método no permitido.' });
    }

    if (!origenPermitido(String(request.headers.origin || ''), request)) {
        return response.status(403).json({ status: 'error', message: 'Origen no permitido.' });
    }

    const body = request.body || {};
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const limpiar = body.limpiar === true || token === '';

    // Si viene token, debe tener formato JWT compacto y tamaño razonable;
    // de lo contrario no se sienta nada (sin header injection posible).
    if (!limpiar && (!JWT_COMPACTO.test(token) || token.length > 4096)) {
        return response.status(400).json({ status: 'error', message: 'Token inválido.' });
    }

    let atributos = [
        `${COOKIE_TOKEN}=${limpiar ? '' : token}`,
        'Path=/admin',
        'SameSite=Lax',
        'Secure',
        'HttpOnly'
    ].join('; ');
    if (limpiar) {
        atributos += '; Max-Age=0';
    } else {
        atributos += '; Max-Age=604800';
    }

    response.setHeader('Set-Cookie', atributos);
    return response.status(200).json({ status: 'success' });
};