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

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');

    if (request.method !== 'POST') {
        return response.status(405).json({ status: 'error', message: 'Método no permitido.' });
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

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    try {
        const items = body.productos.map((item) => ({
            product_id: Number(item.id),
            quantity: Number(item.quantity),
            variante_texto: typeof item.varianteTexto === 'string' ? String(item.varianteTexto) : ''
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
        const mensaje = String(error.message || 'No se pudo registrar el pedido.');
        // Errores de negocio esperados: stock insuficiente, producto inactivo, cantidades.
        const conflicto = /stock insuficiente|cantidad inválida|producto/i.test(mensaje);
        console.error('❌ Error registrando pedido en Supabase:', mensaje);
        return response.status(conflicto ? 409 : 500).json({ status: 'error', message: mensaje });
    }
};