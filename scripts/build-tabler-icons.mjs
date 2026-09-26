// ============================================================================
// build-tabler-icons.mjs — Genera el subconjunto propio de Tabler Icons.
//
// Uso:
//   npm run build:iconos
//
// ¿Por qué un subconjunto y no el webfont completo?
//   @tabler/icons-webfont pesa 504 KB (fuente) + 212 KB (CSS) porque trae los
//   5.200 íconos del set. Este proyecto usa unos 200. Font Awesome, que se
//   usaba antes, pesaba 156 KB y encima venía de un CDN con dos round-trips
//   encadenados. Acá se baja una sola fuente propia, sin CDN, con los íconos
//   que el código realmente referencia: baja a ~20 KB y no puede fallar por
//   red.
//
// Qué hace:
//   1. Escanea el repo y junta todas las clases `ti-*` que se usan.
//   2. Se baja (y cachea) el CSS y la TTF originales de @tabler/icons-webfont.
//   3. Verifica que cada clase usada exista en el set original: si falta una,
//      aborta con error en vez de generar una fuente que no la tiene.
//   4. Recorta la TTF a esos glifos y la guarda como woff2.
//   5. Escribe assets/tabler/tabler-icons.css con la regla base .ti, una regla
//      :before por ícono y la utilidad .ti-spin.
//
// Para agregar un ícono: se usa la clase en el código y se corre este script.
// La fuente y el CSS quedan versionados, así que el sitio no depende de
// ninguna descarga externa en runtime.
// ============================================================================
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirSalida = resolve(raiz, 'assets/tabler');
const cache = resolve(raiz, 'node_modules/.cache/tabler');

// Debe coincidir con el @package.json del set: si sube, hay que re-revisar los
// nombres (Tabler renombra y aliasea íconos entre versiones).
const VERSION = '3.48.0';
const BASE = `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@${VERSION}/dist`;

const FUENTE_CSS = resolve(cache, 'tabler-icons.css');
const FUENTE_TTF = resolve(cache, 'tabler-icons.ttf');

/** Clases `ti-*` que son utilidades del proyecto, no íconos del set. */
const NO_ES_ICONO = new Set(['ti-spin']);

// ---------------------------------------------------------------------------
// 1. Escanear el repo
// ---------------------------------------------------------------------------
const EXT = new Set(['.html', '.js', '.css', '.md']);
const OMITIR_DIRS = new Set(['node_modules', '.git', '.vercel', 'assets', 'scripts']);
const OMITIR_ARCHIVOS = new Set(['env.generated.js', 'tabler-icons.css']);

function recorrer(dir, acc = []) {
    for (const nombre of readdirSync(dir)) {
        if (OMITIR_DIRS.has(nombre)) continue;
        const p = resolve(dir, nombre);
        if (statSync(p).isDirectory()) recorrer(p, acc);
        else if (EXT.has(extname(nombre)) && !OMITIR_ARCHIVOS.has(nombre)) acc.push(p);
    }
    return acc;
}

const usadas = new Set();
for (const abs of recorrer(raiz)) {
    const texto = readFileSync(abs, 'utf8');
    // Nombre de clase completo, sin cortar por otra letra o guion: así no se
    // capturan prefijos de identificadores más largos ni sufijos sueltos.
    for (const m of texto.matchAll(/(?<![\w-])(ti-[a-z0-9]+(?:-[a-z0-9]+)*)(?![\w-])/g)) {
        if (!NO_ES_ICONO.has(m[1])) usadas.add(m[1]);
    }
}

if (usadas.size === 0) {
    console.error('No se encontró ninguna clase ti-* en el repo. ¿Corrió el codemod?');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Bajar (y cachear) el set original
// ---------------------------------------------------------------------------
mkdirSync(cache, { recursive: true });
mkdirSync(dirSalida, { recursive: true });

async function bajar(url, destino) {
    if (existsSync(destino)) return;
    process.stdout.write(`  bajando ${url.split('/').pop()} ... `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} al bajar ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(destino, buf);
    console.log(`${(buf.length / 1024).toFixed(0)} KB`);
}

await bajar(`${BASE}/fonts/tabler-icons.ttf`, FUENTE_TTF);
await bajar(`${BASE}/tabler-icons.min.css`, FUENTE_CSS);

// ---------------------------------------------------------------------------
// 3. Mapa clase -> glifo, y validación
// ---------------------------------------------------------------------------
const cssOriginal = readFileSync(FUENTE_CSS, 'utf8');
const mapa = new Map();
for (const m of cssOriginal.matchAll(/\.(ti-[a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"/g)) {
    mapa.set(m[1], parseInt(m[2], 16));
}

const faltantes = [...usadas].filter((c) => !mapa.has(c)).sort();
if (faltantes.length) {
    console.error(`\nERROR: ${faltantes.length} clase(s) ti-* no existen en Tabler ${VERSION}:`);
    for (const c of faltantes) console.error(`  ${c}`);
    console.error('\nRevisá scripts/tabler-mapping.mjs: el destino cambió de nombre upstream.');
    process.exit(1);
}

const codepoints = [...new Set([...usadas].map((c) => mapa.get(c)))];
const usados = [...usadas].sort();

// ---------------------------------------------------------------------------
// 4. Recortar la fuente
// ---------------------------------------------------------------------------
process.stdout.write(`  recortando ${usados.length} glifos ... `);
// subset-font recorta por texto, no por codepoint: se reconstruye el string
// desde los codepoints del mapa para pasarlos tal cual.
const texto = String.fromCodePoint(...codepoints);
const woff2 = await subsetFont(readFileSync(FUENTE_TTF), texto, { targetFormat: 'woff2' });
writeFileSync(resolve(dirSalida, 'tabler-icons.woff2'), woff2);
console.log(`${(woff2.length / 1024).toFixed(1)} KB`);

// ---------------------------------------------------------------------------
// 5. Escribir el CSS
// ---------------------------------------------------------------------------
const regla = (nombre) => `.${nombre}:before { content: "\\${mapa.get(nombre).toString(16)}"; }`;

const css = `/*!
 * Tabler Icons ${VERSION} — subconjunto propio de este proyecto.
 * Generado por scripts/build-tabler-icons.mjs — NO EDITAR A MANO.
 * ${usados.length} de ~5.200 íconos del set. Licencia MIT (tabler.io).
 * Para agregar un ícono: usá la clase en el código y corré
 *   npm run build:iconos
 */
@font-face {
    font-family: "tabler-icons";
    font-style: normal;
    font-weight: 400;
    font-display: block;
    src: url("./tabler-icons.woff2") format("woff2");
}

.ti {
    font-family: "tabler-icons" !important;
    speak: none;
    font-style: normal;
    font-weight: normal;
    font-variant: normal;
    text-transform: none;
    line-height: 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

/* Reemplaza a .fa-spin de Font Awesome (Tabler no trae la utilidad).
   Se usa en los estados de carga: <i class="ti ti-loader-2 ti-spin"></i> */
.ti-spin {
    animation: ti-spin 1s linear infinite;
}

@keyframes ti-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
    .ti-spin { animation: none; }
}

${usados.map(regla).join('\n')}
`;

writeFileSync(resolve(dirSalida, 'tabler-icons.css'), css, 'utf8');

// ---------------------------------------------------------------------------
console.log(`\n  ${usados.length} íconos  |  woff2 ${(woff2.length / 1024).toFixed(1)} KB  |  css ${(css.length / 1024).toFixed(1)} KB`);
console.log(`  escrito en assets/tabler/`);
