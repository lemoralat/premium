// ============================================================================
// api/ubicacion.js — Función serverless de Vercel que resuelve la ubicación
// del negocio (Configuración → Datos generales → "Ubicación del negocio") a
// coordenadas, para que contacto.html la muestre en un mapa de OpenStreetMap.
//
// Acepta en el campo `valor`:
//   - una dirección como texto          → se geocodifica con Nominatim,
//   - un link corto maps.app.goo.gl/…   → se siguen las redirecciones server-side
//                                          y se extraen las coordenadas,
//   - una URL de mapas larga (place/search, embeds pb=, ?q=lat,lng, …) → se
//     extraen las coordenadas/el nombre del lugar del texto de la URL.
//
// MOTIVO: el embed keyless de Google (maps?q=…&output=embed) fue desactivado
// por Google y muestra "Este contenido está bloqueado"; los links cortos no
// son embebibles desde el navegador (CORS en la redirección). OpenStreetMap
// se incrusta sin API key y sin restricciones de referrer.
//
// Respuestas:
//   200 { status:'success', lat, lng, nombre, fuente }
//   400 { status:'error', message }
//   403 { status:'error', message }  (origen no permitido)
//   405 { status:'error', message }  (no es POST)
// ============================================================================

// Política de orígenes compartida: ver api/_lib/origenes.js. No volver a
// copiar la lista de permitidos en un cuarto handler.
const { origenPermitido } = require('./_lib/origenes.js');

// Cache en memoria (por instancia serverless): evita golpear a Nominatim
// repetidamente (su política de uso permite ~1 req/s con User-Agent propio).
const cache = new Map(); // clave normalizada → { lat, lng, nombre, fuente, ts }
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let ultimaGeocodificacion = 0;

function decod(s) {
    try { return decodeURIComponent(s); } catch { return s; }
}

function coordenadasValidas(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Nombre legible del lugar dentro de una URL de mapas (/maps/place/…).
function nombreDeUrl(url) {
    const m = url.match(/\/maps\/place\/([^/?@]+)/);
    if (!m) return '';
    try {
        return decod(m[1]).replace(/\+/g, ' ').trim();
    } catch {
        return m[1].replace(/\+/g, ' ').trim();
    }
}

// Extrae coordenadas (y, si hay, el nombre del lugar) del texto de una URL.
// Puede devolver { lat: null, lng: null, nombre } cuando la URL solo trae un
// nombre de lugar sin coordenadas.
function extraerDeUrl(url) {
    let m;

    // 1) Coordenadas @lat,lng (place/search): /maps/place/Nombre/@-31.41,-64.18,17z
    m = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), nombre: nombreDeUrl(url) };

    // 2) Coordenadas de lugar en embeds/protocolo Google: !3dLAT!4dLNG
    m = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), nombre: nombreDeUrl(url) };

    // 3) Coordenadas de viewport Google: !2dLNG!3dLAT
    m = url.match(/!2d(-?\d+\.?\d*)!3d(-?\d+\.?\d*)/);
    if (m) return { lat: Number(m[2]), lng: Number(m[1]), nombre: nombreDeUrl(url) };

    // 4) ?q=lat,lng
    m = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), nombre: nombreDeUrl(url) };

    // 5) Búsqueda de Google Maps sin coords: /maps/search/QUERY
    m = url.match(/\/maps\/search\/([^/?@]+)/);
    if (m) return { lat: null, lng: null, nombre: decod(m[1]).replace(/\+/g, ' ').trim() };

    // 6) Nombre de lugar sin coords: /maps/place/Nombre
    const nombre = nombreDeUrl(url);
    return nombre ? { lat: null, lng: null, nombre } : null;
}

// Sigue la cadena de redirecciones de un link corto (máx. 5 saltos) leyendo el
// header Location en cada paso; devuelve la URL final.
//
// HARDENING SSRF (auditoría V-3): cada salto se valida ANTES de la petición:
//   - solo HTTPS,
//   - solo hosts de Google Maps (goo.gl, google.com, googleusercontent.com, …),
//   - nunca IPs desnudas ni rangos privados/loopback/metadata (los hosts
//     desconocidos redirigirían al propio servidor o a la red interna).
// Si el siguiente salto no pasa la validación, se corta la cadena sin
// contactarlo y se devuelve el último destino válido.
const HOSTS_MAPS_PERMITIDOS = /(^|\.)(google\.com|google\.com\.ar|goo\.gl|g\.co|googleusercontent\.com|ggpht\.com|googleapis\.com)$/i;
const TIMEOUT_FETCH_MS = 4000;

function esSaltoSeguro(url) {
    let u;
    try {
        u = new URL(url);
    } catch {
        return false;
    }
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    // IPs desnudas (incluido 127.0.0.1, 169.254.169.254, rangos privados, ::1…):
    // un atacante no debe poder apuntar la cadena a una IP interna.
    if (!isNaN(host.replace(/\./g, '')) || host === 'localhost' || host.endsWith('.localhost')) {
        return false;
    }
    // Solo hosts de Google Maps; cualquier otro host corta la cadena sin
    // contactarse (protege contra redirects servidos por hosts comprometidos).
    return HOSTS_MAPS_PERMITIDOS.test(host);
}

async function resolverLinkCorto(url) {
    let destino = url;
    for (let i = 0; i < 5; i++) {
        if (!esSaltoSeguro(destino)) return destino;
        try {
            const res = await fetch(destino, {
                method: 'GET',
                redirect: 'manual',
                signal: AbortSignal.timeout(TIMEOUT_FETCH_MS),
                headers: { 'User-Agent': 'lemora-shop/1.0 (mapa de contacto)' }
            });
            if (res.status >= 300 && res.status < 400) {
                const loc = res.headers.get('location');
                if (!loc) return destino;
                destino = new URL(loc, destino).toString();
            } else {
                return destino;
            }
        } catch (error) {
            console.warn('⚠️ No se pudo resolver el link corto:', error.message);
            return url;
        }
    }
    return destino;
}

// Genera variantes cada vez más simples de una dirección para reintentar la
// geocodificación cuando el texto completo no da resultados.
//
// El caso que motivó esto: "Macacha Güemes 351, C1106BKG Cdad. Autónoma de
// Buenos Aires, Argentina" (una dirección real con código postal argentino)
// hacía que Nominatim devolviera 0 resultados, mientras que la misma calle sin
// el CP resolvía normal. Se intenta primero el texto tal cual está escrito y,
// si no resuelve, las variantes en orden: sin código postal → sin número de
// calle → recortes por coma.
function variantesDeTexto(texto) {
    const variantes = [texto];

    // Códigos postales: C1106BKG (CABA), 5000 (Córdoba), 1000… Nunca un caso
    // normal con "4 letras" tiene números, y esta variante sólo se prueba si el
    // texto completo falló.
    const sinCP = texto.replace(/\b[A-Za-z]?\d{4}[A-Za-z]{0,3}\b/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (sinCP !== texto) variantes.push(sinCP);

    // Número de calle, sólo cuando va al final de un tramo ("Calle 351," o
    // "…321"): así "Av. 9 de Julio" no se mutila (el 9 queda en el medio).
    const sinNumero = sinCP.replace(/\s+\d{1,6}(?=\s*[,;]|$)/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (sinNumero !== sinCP) variantes.push(sinNumero);

    // Recortes por coma sobre la versión sin CP: "calle, ciudad" y
    // "ciudad, provincia".
    const partes = sinCP.split(',').map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 2) {
        variantes.push(partes.slice(0, 2).join(', '));
        variantes.push(partes.slice(-2).join(', '));
    }

    // Sin hardcodeos por dirección: generar variantes genéricas útiles.
    // Quitar iniciales/términos ambiguos solo cuando aparecen como token suelto.
    const palabrasAmbiguas = ['cdad.', 'ciudad', 'autónoma', 'autonoma', 'de', 'la', 'provincia', 'prov.', 'república', 'republica', 'argentina', 'ar'];
    // Mejor: probar sin el último tramo si hay 3+ tramos separados por coma
    const partesNorm = sinCP.split(',').map((p) => p.trim()).filter(Boolean);
    if (partesNorm.length >= 3) {
        variantes.push(partesNorm.slice(0, 2).join(', '));
    }
    if (partesNorm.length >= 2) {
        // también probar el primero + último? no siempre ayuda; probar primero solo
        variantes.push(partesNorm[0]);
    }

    // Normaliza espacios/comas duplicadas en todas las variantes.
    return [...new Set(
        variantes
            .map((v) => v.replace(/\s{2,}/g, ' ').replace(/\s*,\s*/g, ', ').trim())
            .filter((v) => v && v.replace(/[,.\s]/g, '').length >= 3)
    )];
}

// Geocodifica un texto con Nominatim (OpenStreetMap). Cacheado y con respeto a
// su política de uso (mín. ~1 s entre llamadas). Con fallback progresivo: si el
// texto completo no resuelve, prueba las variantes más simples en orden.
async function geocodificar(texto) {
    const limpio = texto.replace(/\s+/g, ' ').trim();
    if (limpio.length < 3) return null;

    for (const variante of variantesDeTexto(limpio)) {
        const resultado = await geocodificarVariante(variante);
        if (resultado) return resultado;
    }
    return null;
}

async function geocodificarVariante(limpio) {
    const clave = limpio.toLowerCase();
    const cacheado = cache.get(clave);
    if (cacheado && Date.now() - cacheado.ts < CACHE_TTL_MS) return cacheado;

    const espera = 1100 - (Date.now() - ultimaGeocodificacion);
    if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
    ultimaGeocodificacion = Date.now();

    const url = 'https://nominatim.openstreetmap.org/search' +
        '?format=jsonv2&limit=1&accept-language=es&countrycodes=ar&q=' +
        encodeURIComponent(limpio);

    const res = await fetch(url, {
        headers: {
            // La política de uso de Nominatim pide un User-Agent que identifique
            // a la aplicación, no uno con el dominio de la tienda original: en
            // una plantilla reutilizable ese dominio no es el del cliente que
            // termina haciendo las consultas.
            'User-Agent': 'lemora-tienda/1.0 (geocodificacion del mapa de contacto)',
            'Accept': 'application/json'
        }
    });
    if (!res.ok) throw new Error('Nominatim respondió ' + res.status);

    const resultados = await res.json();
    if (!Array.isArray(resultados) || resultados.length === 0) return null;

    const r = resultados[0];
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!coordenadasValidas(lat, lng)) return null;

    const entrada = {
        lat,
        lng,
        nombre: String(r.name || r.display_name || '').trim(),
        fuente: 'texto',
        ts: Date.now()
    };
    cache.set(clave, entrada);
    return entrada;
}

// Resuelve el valor (texto o URL) a coordenadas + nombre legible.
async function resolver(valor) {
    const clave = valor.toLowerCase().replace(/\s+/g, ' ').trim();
    const cacheado = cache.get(clave);
    if (cacheado && Date.now() - cacheado.ts < CACHE_TTL_MS) return cacheado;

    let resultado = null;

    if (/^https?:\/\//i.test(valor)) {
        let url = valor;
        if (/maps\.app\.goo\.gl/i.test(url)) {
            url = await resolverLinkCorto(url);
        }
        const extraido = extraerDeUrl(url) || extraerDeUrl(valor);

        if (extraido) {
            if (coordenadasValidas(extraido.lat, extraido.lng)) {
                resultado = { lat: extraido.lat, lng: extraido.lng, nombre: extraido.nombre || '', fuente: 'url' };
            } else if (extraido.nombre) {
                // URL con nombre de lugar pero sin coordenadas → geocodificar el nombre.
                const geo = await geocodificar(extraido.nombre);
                if (geo) resultado = { lat: geo.lat, lng: geo.lng, nombre: extraido.nombre, fuente: 'url' };
            }
        }

        // URL sin coordenadas ni nombre parsable: intentar con el ?q= si existe.
        if (!resultado) {
            const q = valor.match(/[?&]q=([^&]+)/);
            if (q) {
                const geo = await geocodificar(decod(q[1]));
                if (geo) resultado = { lat: geo.lat, lng: geo.lng, nombre: geo.nombre, fuente: 'url' };
            }
        }
    }

    // Texto plano (o URL que no se pudo parsear) → geocodificación directa.
    if (!resultado) {
        const geo = await geocodificar(valor);
        if (geo) resultado = { lat: geo.lat, lng: geo.lng, nombre: geo.nombre, fuente: 'texto' };
    }

    if (resultado) {
        resultado.ts = Date.now();
        cache.set(clave, resultado);
    }
    return resultado;
}

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.method !== 'POST') {
        return response.status(405).json({ status: 'error', message: 'Método no permitido.' });
    }

    if (!origenPermitido(String(request.headers.origin || ''), request)) {
        return response.status(403).json({ status: 'error', message: 'Origen no permitido.' });
    }

    const valor = String((request.body && request.body.valor) || '').trim();
    if (!valor || valor.length > 500) {
        return response.status(400).json({ status: 'error', message: 'Indicá una dirección o URL.' });
    }

    try {
        const ubicacion = await resolver(valor);
        if (!ubicacion || !coordenadasValidas(ubicacion.lat, ubicacion.lng)) {
            return response.status(400).json({
                status: 'error',
                message: 'No se pudo ubicar el negocio con ese valor.'
            });
        }
        return response.status(200).json({
            status: 'success',
            lat: ubicacion.lat,
            lng: ubicacion.lng,
            nombre: ubicacion.nombre || '',
            fuente: ubicacion.fuente || 'texto'
        });
    } catch (error) {
        console.error('❌ Error resolviendo ubicación:', error.message);
        return response.status(500).json({ status: 'error', message: 'No se pudo resolver la ubicación.' });
    }
};