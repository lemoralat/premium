// ============================================================================
// api/pedido.js — Función serverless de Vercel para registrar pedidos.
//
// REEMPLAZA el comportamiento anterior (proxy a Google Apps Script) por una
// escritura directa en Supabase:
//   - Usa la SERVICE ROLE key SOLO del lado servidor (variable de entorno).
//   - Delega toda la sincronización/business logic a la función RPC
//     `insertar_pedido` (transacción única: valida stock, recalcula montos con
//     precios de la BD, aplica descuento/cupón, descuenta stock e inserta).
//   - El frontend NO cambió: sigue POSTeando a /api/pedido y esperando
//     { status: 'success' } o { status: 'error', message }.
//
// Variables de entorno requeridas en Vercel:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Orígenes que pueden POSTear a /api/pedido. Ampliables con la variable de
// entorno ALLOWED_ORIGINS (separados por coma). «*» admite subdominios
// (ej. https://*.vercel.app cubre las previews). Si no viene header Origin
// (curl, server-to-server) se permite: no hay cookies de sesión que robar.
function origenPermitido(origin) {
    if (!origin) return true;
    const permitidos = (process.env.ALLOWED_ORIGINS || [
        'https://supabase.lemora.lat',
        'https://*.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001'
    ].join(',')).split(',').map((s) => s.trim()).filter(Boolean);
    return permitidos.some((patron) => {
        if (patron.includes('*')) {
            return origin.startsWith(patron.replace(/\*/g, ''));
        }
        return origin === patron;
    });
}

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.method !== 'POST') {
        return response.status(405).json({ status: 'error', message: 'Método no permitido.' });
    }

    // CSRF/abuso ligero: solo aceptamos POSTs desde orígenes conocidos de la tienda.
    if (!origenPermitido(String(request.headers.origin || ''))) {
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
    if (!body || typeof body !== 'object' || !body.cliente || !Array.isArray(body.productos) || body.productos.length === 0) {
        return response.status(400).json({ status: 'error', message: 'Estructura de pedido inválida.' });
    }

    // Límites razonables de payload (anti-abuso, V-3): el RPC valida el resto.
    if (body.productos.length > 50) {
        return response.status(400).json({ status: 'error', message: 'Demasiados productos en el pedido.' });
    }
    const clienteNombre = typeof body.cliente?.nombre === 'string' ? body.cliente.nombre.trim() : '';
    const clienteEmail = typeof body.cliente?.email === 'string' ? body.cliente.email.trim() : '';
    if (!clienteNombre || !clienteEmail || clienteNombre.length > 200 || clienteEmail.length > 254) {
        return response.status(400).json({ status: 'error', message: 'Datos del cliente inválidos.' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    try {
        const items = body.productos.map((item) => ({
            product_id: Number(item.id),
            quantity: Number(item.quantity),
            variante_texto: typeof item.varianteTexto === 'string' ? String(item.varianteTexto).slice(0, 300) : ''
        }));

        if (items.some(i => !Number.isInteger(i.product_id) || !Number.isInteger(i.quantity) || i.quantity <= 0)) {
            return response.status(400).json({ status: 'error', message: 'Datos de productos inválidos.' });
        }

        const payload = {
            p_cliente: body.cliente,
            p_items: items,
            p_cupon: (body.cupon && body.cupon !== 'NINGUNO') ? String(body.cupon) : null,
            p_token: (typeof body.token === 'string' && UUID_REGEX.test(body.token)) ? body.token : null
        };

        const { data, error } = await supabase.rpc('insertar_pedido', payload);

        if (error) throw new Error(error.message);
        if (!data || data.status !== 'success') {
            throw new Error(data?.message || 'El backend rechazó el pedido.');
        }

        return response.status(200).json(data);
    } catch (error) {
        const detalle = String(error.message || '');
        // Solo exponemos mensajes de la RPC que controlamos nosotros; el resto
        // (errores de BD, etc.) se devuelve genérico pero se loguea completo.
        const amistoso = /(stock insuficiente|cantidad inválida|producto|inactivo|estructura de pedido inválida|demasiados pedidos|intentá de nuevo)/i.test(detalle)
            ? detalle
            : 'No se pudo registrar el pedido.';
        const conflicto = /(stock insuficiente|cantidad inválida|producto|inactivo|estructura de pedido inválida)/i.test(detalle);
        const limiteTasa = /demasiados pedidos|intentá de nuevo/i.test(detalle);
        console.error('❌ Error registrando pedido en Supabase:', detalle);
        return response.status(limiteTasa ? 429 : (conflicto ? 409 : 500)).json({ status: 'error', message: amistoso });
    }
};