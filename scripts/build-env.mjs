// ============================================================================
// build-env.mjs — Genera js/env.generated.js a partir de variables de entorno.
//
// Uso:
//   cp .env.example .env.local   (completar valores)
//   npm run build:env            (o `npm run build`)
//
// En Vercel el build corre igual: toma process.env directamente.
// No guarda secretos: solo la URL del proyecto y la anon key (pública).
// ============================================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirJs = resolve(raiz, 'js');
mkdirSync(dirJs, { recursive: true });

const url  = (process.env.SUPABASE_URL || '').trim();
const anon = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

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
    console.warn('⚠️  Supabase sin configurar. La tienda usará el fallback a los JSON locales.');
}