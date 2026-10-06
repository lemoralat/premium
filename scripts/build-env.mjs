// ============================================================================
// build-env.mjs — Genera js/env.generated.js + inyecta el dominio del cliente.
//
// Uso:
//   cp .env.example .env.local   (completar valores)
//   npm run build:env            (o `npm run build`)
//
// En Vercel el build corre igual: toma process.env directamente.
// No guarda secretos: solo la URL del proyecto y la anon key (pública).
//
// Además de generar env.generated.js, este script resuelve el MODELO
// MULTI-CLIENTE (un solo repo sirve a todas las tiendas):
//
//   1. Los 8 HTML raíz y robots.txt están commiteados con el placeholder
//      `TU-DOMINIO.com`. El build lo reemplaza por el dominio real del
//      cliente (variable SITIO_URL) antes de desplegar.
//   2. Genera sitemap.xml con ese mismo dominio.
//
// Sin SITIO_URL los archivos conservan el placeholder (modo plantilla), así
// que clonar el repo y desplegar sin configurar es un fallo visible y NO
// mezcla tiendas: nunca hay un dominio "por defecto" hardcodeado.
// ============================================================================
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirJs = resolve(raiz, 'js');
mkdirSync(dirJs, { recursive: true });

const url  = (process.env.SUPABASE_URL || '').trim();
const anon = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const sitio = (process.env.SITIO_URL || '').trim();

const contenido = `// ============================================================================
// Generado por scripts/build-env.mjs — NO EDITAR A MANO.
// Contiene SOLO valores públicos (URL del proyecto y anon key).
// Regenerar con: npm run build:env
// ============================================================================
export const SUPABASE_CONFIG = ${JSON.stringify({
    url,
    publishableKey: anon,
}, null, 2)};
`;

const destino = resolve(dirJs, 'env.generated.js');
writeFileSync(destino, contenido);

if (url && anon) {
    console.log(`✅ env.generated.js generado con Supabase: ${url}`);
} else {
    // OJO: este script SOBREESCRIBE el archivo siempre. Como la tienda ya no
    // tiene fallback a JSON locales (Supabase es la única fuente de datos),
    // correr el build sin estas variables deja env.generated.js con strings
    // vacíos y la tienda deja de funcionar. En Vercel no pasa (el build corre
    // con las variables del proyecto), pero en local hay que exportarlas antes.
    console.warn('⚠️  Supabase sin configurar: env.generated.js quedó con valores vacíos y la tienda no va a funcionar. Exportá SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY antes de correr el build.');
}

// ----------------------------------------------------------------------------
// DOMINIO DEL CLIENTE (SITIO_URL) → placeholder TU-DOMINIO.com
// ----------------------------------------------------------------------------
// Acepta "tienda.cliente.com" o "https://tienda.cliente.com" (con o sin barra
// final); se normaliza al host, porque el HTML ya escribe el esquema
// ("https://TU-DOMINIO.com/...").
const host = sitio
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

// Archivos que llevan el placeholder. Si mañana se agrega una página, entra
// sola en esta lista (no hay que tocar nada más).
const ARCHIVOS_CON_DOMINIO = [
    'index.html',
    '404.html',
    'carrito.html',
    'contacto.html',
    'gracias.html',
    'faq.html',
    'favoritos.html',
    'producto.html',
    'robots.txt'
];

// Reemplaza TU-DOMINIO.com → host en los archivos. Devuelve cuántos cambió.
function inyectarDominio() {
    let modificados = 0;
    for (const nombre of ARCHIVOS_CON_DOMINIO) {
        const ruta = resolve(raiz, nombre);
        let texto;
        try {
            texto = readFileSync(ruta, 'utf-8');
        } catch {
            continue; // archivo que no existe (p. ej. robots.txt quitado)
        }
        if (!texto.includes('TU-DOMINIO.com')) continue; // ya inyectado (idempotente)
        writeFileSync(ruta, texto.split('TU-DOMINIO.com').join(host));
        modificados++;
    }
    return modificados;
}

// Genera sitemap.xml con el dominio del cliente. Usa las rutas limpias de
// vercel.json (cleanUrls: true → /carrito, no /carrito.html). No incluye las
// páginas transitorias (gracias.html es post-compra; 404.html no existe).
function generarSitemap() {
    const rutas = ['/', '/producto', '/carrito', '/favoritos', '/contacto', '/faq'];
    const urls = rutas
        .map((r) => `  <url><loc>https://${host}${r}</loc></url>`)
        .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    writeFileSync(resolve(raiz, 'sitemap.xml'), xml);
}

if (host) {
    const modificados = inyectarDominio();
    generarSitemap();
    console.log(`✅ Dominio ${host} inyectado en ${modificados} archivo(s) + sitemap.xml generado.`);
} else {
    // Modo plantilla: se dejan los placeholders para que cada cliente los
    // resuelva en SU build. Un build sin SITIO_URL es un error de config del
    // deploy, no un caso válido: el placeholder queda a la vista para que
    // nadie lo confunda con un dominio real.
    console.warn('⚠️  SITIO_URL no configurada: los HTML/robots conservan TU-DOMINIO.com y no se generó sitemap.xml. Definila por cliente en Vercel.');
}