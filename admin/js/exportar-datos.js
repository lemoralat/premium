// ============================================================================
// exportar-datos.js — Exportación de datos del panel en CSV.
//
// Solo dos datasets, cada uno con su botón y su archivo: PRODUCTOS y PEDIDOS.
// Corre 100% del lado del cliente con la sesión admin autenticada
// (clienteAdmin); no se usa service_role ni se agregan endpoints.
// ============================================================================

import { clienteAdmin } from './admin-supabase.js';

// Separador de campo: ';' para que el archivo abra directo en Excel con
// configuración regional es-AR (el separador de lista argentino es ';').
// RFC-4180 usaría ','; cambiarlo es de una línea.
const SEP = ';';

// BOM (U+FEFF) al inicio para que Excel reconozca UTF-8 (tildes, ñ, …).
const BOM = '\uFEFF';

// Blindaje contra CSV injection (Excel formula injection): solo importa la
// PRIMERA letra de la celda. Si arranca con "=", "+", "-" o "@", Excel/Sheets la
// interpreta como fórmula (ej: =HYPERLINK(...), @SUM(...), -cmd|'/C calc'!A0).
// Se la prefija con "'" para que se muestre como texto plano y no se ejecute.
// Excepción segura: "-" seguido de dígito/punto es un número negativo real
// (ej: -123), que Excel NO trata como fórmula → se deja intacto.
const INICIO_INYECCION_CSV = /^[=+@]|^-(?![\d.])/;
function blindarCelda(texto) {
    return INICIO_INYECCION_CSV.test(texto) ? `'${texto}` : texto;
}

function escaparCelda(valor) {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    const blindado = blindarCelda(texto);
    if (/[";\n\r]/.test(blindado)) {
        return '"' + blindado.replace(/"/g, '""') + '"';
    }
    return blindado;
}

function filaCSV(valores) {
    return valores.map(escaparCelda).join(SEP);
}

function fechaHoy() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function fechaISO(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString().slice(0, 10);
}

function siono(v) {
    return v ? 'Sí' : 'No';
}

function numero(v) {
    return v === null || v === undefined ? '' : Number(v);
}

// ----------------------------------------------------------------------------
// Descarga del archivo ya armado ({ nombre, contenido, filas }).
// ----------------------------------------------------------------------------
export function descargarCSV({ nombre, contenido }) {
    const blob = new Blob([BOM + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ----------------------------------------------------------------------------
// PRODUCTOS (.csv) — columnas: id, nombre, categoría, precio, precio anterior,
// stock, destacado, activo, descripción y fecha de creación. Orden: id asc.
// ----------------------------------------------------------------------------
export async function exportarProductosCSV() {
    const sb = await clienteAdmin();
    const { data, error } = await sb.from('products').select(`
        id, nombre, descripcion, precio, precio_anterior, stock, activo,
        destacado, created_at,
        categoria:categories(name)
    `).order('id', { ascending: true });
    if (error) throw new Error(error.message);

    const encabezados = ['id', 'nombre', 'categoría', 'precio', 'precio_anterior', 'stock', 'destacado', 'activo', 'descripcion', 'fecha_creacion'];
    const filas = data.map((p) => [
        p.id,
        p.nombre,
        p.categoria?.name || '',
        numero(p.precio),
        numero(p.precio_anterior),
        p.stock,
        siono(p.destacado),
        siono(p.activo),
        p.descripcion || '',
        fechaISO(p.created_at)
    ]);

    return {
        nombre: `productos_${fechaHoy()}.csv`,
        contenido: [encabezados, ...filas].map(filaCSV).join('\r\n') + '\r\n',
        filas: data.length
    };
}

// ----------------------------------------------------------------------------
// PEDIDOS (.csv) — datos del cliente (snapshot jsonb aplanado), totales,
// cupón/descuento, estado y un resumen inline de los ítems. Orden: más nuevos
// primero.
// ----------------------------------------------------------------------------
export async function exportarPedidosCSV() {
    const sb = await clienteAdmin();
    const { data, error } = await sb.from('orders').select(`
        numero, cliente, subtotal, descuento, porcentaje, cupon, total, estado,
        created_at,
        items:order_items(nombre, variante_texto, quantity, precio_unitario)
    `).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    const encabezados = [
        'numero', 'fecha', 'estado', 'nombre', 'email', 'telefono', 'direccion',
        'ciudad', 'provincia', 'codigoPostal', 'notas', 'subtotal', 'descuento',
        'porcentaje', 'cupon', 'total', 'items'
    ];
    const filas = data.map((o) => {
        const c = o.cliente || {};
        const itemsTexto = (o.items || []).map((it) => {
            const base = it.variante_texto ? `${it.nombre} (${it.variante_texto})` : it.nombre;
            return `${base} x${it.quantity} ($${numero(it.precio_unitario)})`;
        }).join(' | ');
        return [
            o.numero,
            fechaISO(o.created_at),
            o.estado,
            c.nombre || '',
            c.email || '',
            c.telefono || '',
            c.direccion || '',
            c.ciudad || '',
            c.provincia || '',
            c.codigoPostal || '',
            c.notas || '',
            numero(o.subtotal),
            numero(o.descuento),
            numero(o.porcentaje),
            o.cupon || '',
            numero(o.total),
            itemsTexto
        ];
    });

    return {
        nombre: `pedidos_${fechaHoy()}.csv`,
        contenido: [encabezados, ...filas].map(filaCSV).join('\r\n') + '\r\n',
        filas: data.length
    };
}