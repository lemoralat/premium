// ============================================================================
// admin-supabase.js — Cliente Supabase del DASHBOARD (autenticado).
//
// Usa la anon key (pública) + Supabase Auth. La service_role key nunca se
// carga en el navegador: queda exclusivamente en api/pedido.js (Vercel).
// La sesión del admin se persiste (persistSession: true).
// ============================================================================

import { SUPABASE_CONFIG } from '../../js/env.generated.js';

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
            return cliente;
        })();
    }
    return promesa;
}