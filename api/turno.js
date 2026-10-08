// ============================================================================
// api/turno.js — Función serverless de Vercel para registrar solicitudes de
// turno (modo turnos, Configuración → Tipo de web).
//
// Misma arquitectura que api/pedido.js:
//   - Usa la SERVICE ROLE key SOLO del lado servidor (variable de entorno).
//   - Delega toda la lógica a la RPC `insertar_turno` (transacción única:
//     valida nombre/teléfono/email/fecha, normaliza los ítems del carrito,
//     genera el número TRN-#### e inserta).
//   - El frontend POSTea a /api/turno y espera { status: 'success' } o
//     { status: 'error', message }. La respuesta trae `numero`/`fecha`/`hora`/
//     `items`/`total` (migración 0053): el frontend arma el mensaje de WhatsApp
//     con eso (fuente de verdad de la base), no con el formulario del cliente.
//   - Honeypot y límites de payload igual que pedido (anti-bot / anti-abuso).
//
// Variables de entorno requeridas en Vercel:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Política de orígenes compartida: ver api/_lib/origenes.js. No copiar la
// lista de permitidos en más handlers.
const { origenPermitido } = require('./_lib/origenes.js');

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.method !== 'POST') {
        return response.status(405).json({ status: 'error', message: 'Método no permitido.' });
    }

    // CSRF/abuso ligero: solo aceptamos POSTs desde orígenes conocidos de la tienda.
    if (!origenPermitido(String(request.headers.origin || ''), request)) {
        return response.status(403).json({ status: 'error', message: 'Origen no permitido.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Vercel.');
        return response.status(500).json({
            status: 'error',
            message: 'El servidor no está configurado correctamente.'
        });
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || !body.cliente || typeof body.fecha !== 'string') {
        return response.status(400).json({ status: 'error', message: 'Estructura de solicitud inválida.' });
    }

    // Anti-bot (honeypot): el campo oculto `website` NO debe venir con texto.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
        return response.status(400).json({ status: 'error', message: 'Estructura de solicitud inválida.' });
    }

    // Límites razonables de payload (anti-abuso): el RPC valida el resto.
    const cliente = body.cliente;
    const nombre = typeof cliente?.nombre === 'string' ? cliente.nombre.trim() : '';
    const telefono = typeof cliente?.telefono === 'string' ? cliente.telefono.trim() : '';
    const email = typeof cliente?.email === 'string' ? cliente.email.trim() : '';

    if (!nombre || !telefono || nombre.length > 200 || telefono.length > 30 || email.length > 254) {
        return response.status(400).json({ status: 'error', message: 'Datos del cliente inválidos.' });
    }

    const fecha = String(body.fecha).trim();
    const hora = typeof body.hora === 'string' ? body.hora.trim() : '';
    const notas = typeof body.notas === 'string' ? body.notas.trim() : '';
    if (!fecha || fecha.length > 60 || hora.length > 30 || notas.length > 2000) {
        return response.status(400).json({ status: 'error', message: 'Datos de la solicitud inválidos.' });
    }

    // Servicio de origen: se normaliza a id + nombre (nada del cuerpo libre).
    let producto = null;
    if (body.producto && typeof body.producto === 'object') {
        const id = typeof body.producto.id === 'string' ? body.producto.id : String(body.producto.id);
        const pNombre = typeof body.producto.nombre === 'string' ? body.producto.nombre.trim() : '';
        if (id && pNombre) {
            producto = { id: id.slice(0, 100), nombre: pNombre.slice(0, 200) };
        }
    }

    // Ítems del carrito (0053): la solicitud de turno se registra con los
    // servicios que el cliente agregó al carrito. Se normalizan acá con el
    // mismo contrato que insertar_turno (id + nombre obligatorios, el resto
    // con límites); la RPC vuelve a validar y recalcula los totales.
    let items = null;
    if (body.items !== undefined && body.items !== null) {
        if (!Array.isArray(body.items) || body.items.length > 100) {
            return response.status(400).json({ status: 'error', message: 'Estructura de solicitud inválida.' });
        }
        items = body.items
            .map((it) => {
                if (!it || typeof it !== 'object') return null;
                const id = typeof it.id === 'string' ? it.id : String(it.id ?? '');
                const iNombre = typeof it.nombre === 'string' ? it.nombre.trim() : '';
                if (!id || !iNombre) return null;
                return {
                    id: id.slice(0, 100),
                    nombre: iNombre.slice(0, 200),
                    variante_texto: (typeof it.variante_texto === 'string' ? it.variante_texto : '').slice(0, 250),
                    cantidad: Number.isInteger(it.cantidad) && it.cantidad >= 1 ? Math.min(it.cantidad, 999) : 1,
                    precio_unitario: typeof it.precio_unitario === 'number' && Number.isFinite(it.precio_unitario)
                        ? Math.max(0, it.precio_unitario)
                        : 0
                };
            })
            .filter(Boolean);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    try {
        const payload = {
            p_cliente: { nombre, telefono, email },
            p_fecha: fecha,
            p_hora: hora,
            p_producto: producto,
            p_items: items,
            p_notas: notas || null,
            p_token: (typeof body.token === 'string' && UUID_REGEX.test(body.token)) ? body.token : null
        };

        const { data, error } = await supabase.rpc('insertar_turno', payload);

        if (error) throw new Error(error.message);
        if (!data || data.status !== 'success') {
            throw new Error(data?.message || 'El backend rechazó la solicitud.');
        }

        return response.status(200).json(data);
    } catch (error) {
        const detalle = String(error.message || '');
        // Solo exponemos mensajes de la RPC que controlamos nosotros; el resto
        // (errores de BD, etc.) se devuelve genérico pero se loguea completo.
        const amistoso = /(estructura de solicitud inválida|nombre es obligatorio|teléfono|email|demasiadas solicitudes|intentá de nuevo)/i.test(detalle)
            ? detalle
            : 'No se pudo registrar la solicitud.';
        const conflicto = /(estructura de solicitud inválida|nombre es obligatorio|teléfono|email)/i.test(detalle);
        const limiteTasa = /demasiadas solicitudes|intentá de nuevo/i.test(detalle);
        console.error('❌ Error registrando solicitud de turno en Supabase:', detalle);
        return response.status(limiteTasa ? 429 : (conflicto ? 409 : 500)).json({ status: 'error', message: amistoso });
    }
};