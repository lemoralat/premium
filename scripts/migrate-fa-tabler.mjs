// ============================================================================
// migrate-fa-tabler.mjs — Convierte las clases de Font Awesome a Tabler Icons.
//
// Uso:
//   node scripts/migrate-fa-tabler.mjs --check    (sólo informa, no escribe)
//   node scripts/migrate-fa-tabler.mjs            (reescribe los archivos)
//
// Reemplaza, en HTML, JS, CSS y Markdown:
//   fa-solid fa-truck      →  ti ti-truck
//   fa-regular fa-heart    →  ti ti-heart
//   fa-brands fa-google    →  ti ti-brand-google
//   fa-google              →  ti-brand-google        (clase suelta, p.ej. resenas.red)
//   fa-spin                →  ti-spin
//   .red-isologo.fa-facebook → .red-isologo.ti-brand-facebook   (selectores CSS)
//
// NO toca migrations/: esas migraciones ya están aplicadas y son el registro
// histórico. Los datos que tienen clases de FA en la BD los convierte la
// migración 0033, que también normaliza los defaults de columna.
//
// NO toca .md: un documento que describe *esta* migración tiene que seguir
// nombrando a Font Awesome, y un script que reescriba la prosa termina
// Lies about lo que ocurrió. Los .md se editan a mano.
//
// Tampoco toca el interior de los comentarios. Varios comentarios explican por
// qué una clase quedó como quedó (`fa-cc-amex` colapsó en `ti-credit-card`, el
// default que `0029` puso era `fa-google`, …): reescribirlos las haría mentir.
//
// El mapeo vive en scripts/tabler-mapping.mjs. Si algún día se agrega un
// ícono, se agrega ahí y se vuelve a correr este script.
// ============================================================================
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPA, NO_ES_ICONO, CLASE_SPIN } from './tabler-mapping.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

// Sin .md a propósito: la documentación se edita a mano (ver el loop de abajo).
const EXT = new Set(['.html', '.js', '.css', '.sql']);
const OMITIR_DIRS = new Set(['node_modules', '.git', '.vercel', 'assets']);
const OMITIR_ARCHIVOS = new Set([
    // El mapeo mismo ya está en Tabler: no lo reescribas.
    'tabler-mapping.mjs',
    // Generados: se regeneran, no se editan a mano.
    'env.generated.js'
]);

function recorrer(dir, acc = []) {
    for (const nombre of readdirSync(dir)) {
        if (OMITIR_DIRS.has(nombre)) continue;
        const p = resolve(dir, nombre);
        const st = statSync(p);
        if (st.isDirectory()) recorrer(p, acc);
        else if (EXT.has(extname(nombre)) && !OMITIR_ARCHIVOS.has(nombre)) acc.push(p);
    }
    return acc;
}

// Construye una alternancia de todos los nombres del mapa, del más largo al
// más corto, para que 'fa-truck' gane sobre 'fa-truck-2'.
//
// La frontera final es `(?![-\w])` y no `\b`: un guion NO es caracter de
// palabra, así que con `\b` el nombre 'fa-rotate' matcheaba el prefijo de
// 'fa-rotate-left' y dejaba un '-left' colgando. `(?![-\w])` exige que el
// nombre termine de verdad.
const nombres = Object.keys(MAPA).sort((a, b) => b.length - a.length);
const altClase = nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const RE_ICONO = new RegExp(`(?<![\\w-])(${altClase})(?![-\\w])`, 'g');

// Prefijos de familia: se consommen y desaparecen (Tabler no los usa).
const RE_PREF = /\bfa-(?:solid|regular|brands)\b\s*/g;
const RE_SPIN = /\bfa-spin\b/g;

/**
 * Convierte el texto de un archivo. Devuelve { texto, cambios }.
 *
 * Trabaja línea por línea saltando las que son sólo comentario, para no
 * reescribir la documentación que nombra a Font Awesome a propósito. El estado
 * del comentario de bloque se arrastra entre líneas porque puede abrir en una
 * línea y cerrar en otra.
 */
function convertir(texto) {
    let cambios = 0;
    let salida = '';

    let enComentario = false;
    for (const linea of texto.split('\n')) {
        if (esComentario(linea, enComentario)) {
            enComentario = sigueEnComentario(linea, enComentario);
            salida += linea + '\n';
            continue;
        }
        const r = convertirLinea(linea);
        cambios += r.cambios;
        salida += r.linea + '\n';
    }
    // El split('\n') agrega una línea de más al final si el texto terminaba en
    // salto de línea: se saca para no alterar el archivo.
    if (texto.endsWith('\n')) salida = salida.slice(0, -1);

    return { texto: salida, cambios };
}

/** ¿Esta línea es (o sigue siendo) un comentario? */
function esComentario(linea, enBloque) {
    const t = linea.trim();
    if (enBloque) return true;
    return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--');
}

/** ¿El comentario de bloque sigue abierto al terminar esta línea? */
function sigueEnComentario(linea, enBloque) {
    let abierto = enBloque;
    for (const [abre, cierra] of [['/*', '*/'], ['<!--', '-->']]) {
        let i = linea.indexOf(abre);
        while (i !== -1) {
            if (linea.indexOf(cierra, i + abre.length) === -1) abierto = true;
            i = linea.indexOf(abre, i + abre.length);
        }
    }
    // Una línea que abre y cierra en la misma posición no deja nada abierto.
    if (!abierto) return false;
    const ult = Math.max(linea.lastIndexOf('*/'), linea.lastIndexOf('-->'));
    const ultimoAbre = Math.max(linea.lastIndexOf('/*'), linea.lastIndexOf('<!--'));
    return ultimoAbre > ult;
}

/** Aplica las conversiones a una línea de código. */
function convertirLinea(entrada) {
    let cambios = 0;
    let salida = entrada;

    // 1) Prefijo de familia + clase de icono, con cualquier cantidad de espacio
    //    entre ellos: 'fa-solid fa-truck', "fa-solid\n   fa-truck", etc.
    const familiaIcono = new RegExp(
        `\\bfa-(?:solid|regular|brands)\\b[\\s'"\`]+(${altClase})(?![-\\w])`, 'g'
    );
    salida = salida.replace(familiaIcono, (_m, icono) => {
        cambios++;
        return `ti ${MAPA[icono]}`;
    });

    // 2) .fa-spinner.fa-spin dentro de una clase: ya cubierto por (1) para el
    //    icono; acá sólo se renombra la utilidad de animación.
    salida = salida.replace(RE_SPIN, () => { cambios++; return CLASE_SPIN; });

    // 3) Prefijo de familia seguido de una expresión dinámica: el nombre del
    //    ícono no está escrito, así que (1) no lo agarra. Acá el prefijo no se
    //    borra: se cambia por la clase base de Tabler, que es lo que hace
    //    falta. Sin esto quedaba class=" ${icono}", sin base ni glifo.
    salida = salida.replace(
        /\bfa-(?:solid|regular|brands)\b(?=[ \t]*\$\{)/g,
        () => { cambios++; return 'ti'; }
    );

    // 4) Prefijos de familia sueltos que quedaron (p.ej. un ternario que sólo
    //    devuelve 'fa-solid'): se eliminan. El ternario en sí se arregla a mano.
    const prefSueltos = salida.match(/\bfa-(?:solid|regular|brands)\b/g) || [];
    if (prefSueltos.length) {
        salida = salida.replace(/\bfa-(?:solid|regular|brands)\b/g, () => { cambios++; return ''; });
    }

    // 5) Clase de icono suelta (sin familia), típicamente una variable de
    //    string como el default de resenas.red o un data-attribute.
    salida = salida.replace(RE_ICONO, (m) => { cambios++; return MAPA[m]; });

    // 6) Limpieza: espacios dobles que quedaron al borrar prefijos, y clases
    //    de estilo de FA que no tienen equivalente (fa-fw, fa-2xs, ...).
    salida = salida.replace(/\bfa-(?:fw|\dx|2xs|xs|sm|lg|xl)\b/g, () => { cambios++; return ''; });
    salida = salida.replace(/class="[ \t]{2,}/g, () => { cambios++; return 'class="'; });

    return { linea: salida, cambios };
}

const archivos = recorrer(raiz);
let totalArchivos = 0, totalCambios = 0;
const detalle = [];

for (const abs of archivos) {
    const rel = relative(raiz, abs);
    // Las migraciones ya aplicadas quedan como registro histórico.
    if (rel.startsWith('migrations' + '/')) continue;
    // La documentación describe esta migración: tiene que seguir nombrando a
    // Font Awesome, o el documento pasa a mentir sobre lo que ocurrió.
    if (extname(rel) === '.md') continue;
    const antes = readFileSync(abs, 'utf8');
    const { texto, cambios } = convertir(antes);
    if (!cambios) continue;
    totalArchivos++;
    totalCambios += cambios;
    detalle.push(`  ${String(cambios).padStart(4)}  ${rel}`);
    if (!checkOnly && texto !== antes) writeFileSync(abs, texto, 'utf8');
}

detalle.sort((a, b) => b.localeCompare(a, 'es'));
console.log(detalle.join('\n'));
console.log('');
console.log(checkOnly
    ? `[check] ${totalCambios} cambios en ${totalArchivos} archivos (NO se escribió nada)`
    : `${totalCambios} cambios en ${totalArchivos} archivos`);
