// Proxy serverless de Vercel para pedidos.
// Mantiene la WEB_API_KEY del backend de Apps Script fuera del frontend:
// se lee desde la variable de entorno WEB_API_KEY configurada en Vercel.
// El frontend solo conoce /api/pedido (misma origin).

const GOOGLE_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbw4Z7_WaH7BBOwx4i_stMskzBx5h3yYs3TnzO3l4cUNHO8FB8Qv2-ryhMRLK-BVwEzV/exec';

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');

    if (request.method !== 'POST') {
        return response.status(405).json({ status: 'error', message: 'Método no permitido.' });
    }

    const apiKey = process.env.WEB_API_KEY;
    if (!apiKey) {
        console.error('WEB_API_KEY no configurada en las variables de entorno de Vercel.');
        return response.status(500).json({ status: 'error', message: 'El servidor no está configurado correctamente.' });
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || !body.cliente || !Array.isArray(body.productos) || body.productos.length === 0) {
        return response.status(400).json({ status: 'error', message: 'Estructura de pedido inválida.' });
    }

    const pedido = { ...body, apiKey };

    try {
        const upstream = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedido)
        });

        const texto = await upstream.text();
        let resultado;
        try {
            resultado = JSON.parse(texto);
        } catch {
            resultado = { status: 'error', message: 'Respuesta inválida del backend de pedidos.' };
        }

        return response.status(upstream.ok ? 200 : 502).json(resultado);
    } catch (error) {
        console.error('Error contactando Google Apps Script:', error);
        return response.status(502).json({ status: 'error', message: 'No se pudo contactar el backend de pedidos.' });
    }
};