// ============================================================================
// Política de orígenes POST para las serverless (pedido, sesion, ubicacion).
//
// El módulo que vive en api/ lleva prefijo "_" justamente para que no se publique
// como ruta: es un módulo compartido. Antes de esto la misma función estaba copiada en los tres
// handlers, con el comentario "misma política que api/pedido.js" para intentar
// que no se desincronicen. Con una copia por handler cualquier arreglo tenía
// que repetirse tres veces y un olvido dejaba un endpoint con otra política.
//
// ----------------------------------------------------------------------------
// POR QUÉ NO HAY UN DOMINIO DE LA TIENDA ACA
// ----------------------------------------------------------------------------
// La lista por defecto tenía 'https://supabase.lemora.lat' hardcodeado: el
// dominio de la tienda que originó la plantilla. Eso servía mientras la
// plantilla era esa tienda y nada más. En cuanto un cliente la despliega en su
// propio dominio, el navegador manda otro Origin y los tres endpoints responden
// 403: no se puede confirmar un pedido, ni iniciar sesión, ni geocodificar una
// dirección. Una plantilla que funciona sólo en el dominio de su autor no es
// reutilizable.
//
// La regla por defecto es la que corresponde a cualquier despliegue: la tienda
// y sus endpoints se sirven desde el MISMO host, así que el origen propio
// siempre vale. Un atacante no puede declararse ese origen: el browser pone en
// Origin el dominio desde el que salió la request, no uno elegido a mano.
//
// ----------------------------------------------------------------------------
// CÓMO RESTRINGIRLO (o Ampliarlo)
// ----------------------------------------------------------------------------
//   ALLOWED_ORIGINS=https://tienda.com,https://www.tienda.com
//
// Con la variable puesta, la lista por defecto se ignora por completo: la
// allowlist es exactamente la que se configure, y el origen propio deja de
// estar permitido salvo que lo incluyas. Conviene hacerlo en un despliegue
// abierto a internet, para que un preview de Vercel no pueda POSTear contra la
// tienda.
//
//   - Sin Origin (curl, server-to-server, cron): se permite. No hay cookies de
//     sesión que robar y el endpoint igual valida todo lo demás.
//   - '*' admite subdominios: "https://*.vercel.app" cubre las previews, que
//     si no quedarían afuera en cada push.
//   - http://localhost:* se acepta en desarrollo para poder probar sin deploy.
//
// La comparación es case-insensitive porque el Origin del browser normaliza el
// host a minúsculas pero un cliente curl puede no hacerlo.
// ============================================================================

// Orígenes que se permiten siempre, pase lo que pase con ALLOWED_ORIGINS: los
// preview de Vercel y el desarrollo local. No son de ninguna tienda concreta.
const SIEMPRE = ['https://*.vercel.app', 'http://localhost:*'];

// Convierte "https://*.vercel.app" en una regex, escapando el resto de los
// metacaracteres. Ojo con el orden: si se reemplazan los asteriscos primero, el
// "\\*" que genera el escape se volvería "\\\\*" y la regex rompería.
function patronARegex(patron) {
    return new RegExp(
        '^' + patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
        'i'
    );
}

function listaPermitidos() {
    const crudo = process.env.ALLOWED_ORIGINS;
    if (crudo && crudo.trim()) {
        return crudo.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return SIEMPRE;
}

// El dominio propio del despliegue, que es el origen de la tienda y de estos
// endpoints a la vez. Vercel pone el host público en x-forwarded-host; `host` es
// el fallback para correrlo local o en otro hosting.
function origenPropio(request) {
    const headers = (request && request.headers) || {};
    const host = String(
        headers['x-forwarded-host'] || headers.host || ''
    ).split(',')[0].trim();
    if (!host) return null;
    // x-forwarded-proto puede no estar; en producción siempre es https y en
    // desarrollo http, así que se deduce del propio header si falta.
    const proto = String(headers['x-forwarded-proto'] || '').split(',')[0].trim()
        || (/^localhost|:300[01]$/.test(host) ? 'http' : 'https');
    return `${proto}://${host}`;
}

/**
 * ¿Este Origin puede llamar a los endpoints?
 *
 * @param {string} origin  valor del header Origin (puede venir vacío)
 * @param {object} request la request, para deducir el host propio
 * @returns {boolean}
 */
function origenPermitido(origin, request) {
    if (!origin) return true;

    const limpio = String(origin).trim();
    const permitidos = listaPermitidos();

    // Sin ALLOWED_ORIGINS configurado, el origen propio siempre vale.
    if (!process.env.ALLOWED_ORIGINS) {
        const propio = origenPropio(request);
        if (propio && limpio.toLowerCase() === propio.toLowerCase()) return true;
    }

    return permitidos.some((patron) =>
        patron.includes('*') ? patronARegex(patron).test(limpio) : limpio.toLowerCase() === patron.toLowerCase()
    );
}

module.exports = { origenPermitido };
