// ============================================================================
// exportar-datos.js — Exportación e importación de datos del panel en CSV.
//
// Exportación: PRODUCTOS y PEDIDOS, cada uno con su botón y su archivo.
// Importación: PRODUCTOS y PEDIDOS desde un CSV (mismas columnas que la
// exportación). Corre 100% del lado del cliente con la sesión admin
// autenticada (clienteAdmin); no se usa service_role ni se agregan endpoints.
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
        id, nombre, descripcion_detallada, precio, precio_anterior, stock, activo,
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
        p.descripcion_detallada || '',
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
export async function importarProductosCSV(file) {
    const sb = await clienteAdmin();
    const text = await file.text();
    const [encabezado, ...rest] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const cols = encabezado.split(SEP).map((x) => x.replace(/^"|"$/g, '').trim().toLowerCase());

    const map = {};
    ['id', 'nombre', 'categoria', 'precio', 'precio_anterior', 'stock', 'destacado', 'activo', 'descripcion', 'descripcion_detallada'].forEach((k) => {
        const i = cols.indexOf(k);
        if (i >= 0) map[k] = i;
    });

    let procesados = 0, creados = 0, actualizados = 0, errores = 0;
    const filas = rest.map((l) => {
        const values = [];
        let inQuotes = false, current = '';
        for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (ch === '"') {
                if (inQuotes && l[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes;
            } else if (ch === SEP && !inQuotes) {
                values.push(current);
                current = '';
            } else current += ch;
        }
        values.push(current);
        return values;
    });

    const categorias = {};
    const { data: cats } = await sb.from('categories').select('id, name');
    (cats||[]).forEach(c => categorias[String(c.name).toLowerCase()] = c.id);

    const modoWeb = await (async () => {
        const { data: s } = await sb.from('settings').select('modo_web').eq('id', 1).single();
        return s?.modo_web === 'turnos' ? 'turnos' : 'venta';
    })();

    for (const v of filas) {
        procesados++;
        try {
            const nombre = (v[map.nombre]||'').replace(/^"|"$/g, '');
            if (!nombre.trim()) { errores++; continue; }
            const descripcionDetallada = (v[map.descripcion_detallada]||v[map.descripcion]||'').replace(/^"|"$/g, '');
            const precio = Number(String(v[map.precio]||'').replace(',', '.')) || 0;
            const precio_anterior = v[map.precio_anterior] !== undefined && v[map.precio_anterior] !== '' ? (Number(String(v[map.precio_anterior]||'').replace(',', '.'))||null) : null;
            const stock = Number(v[map.stock]||0) || 0;
            const destacado = (String(v[map.destacado]||'').toLowerCase() === 'sí' || String(v[map.destacado]||'').toLowerCase() === 'si' || String(v[map.destacado]||'') === 'true');
            const activo = (String(v[map.activo]||'').toLowerCase() === 'sí' || String(v[map.activo]||'').toLowerCase() === 'si' || String(v[map.activo]||'') === 'true');
            const catName = (v[map.categoria]||'').replace(/^"|"$/g, '');
            const category_id = catName ? (categorias[String(catName).toLowerCase()] || null) : null;
            const id = map.id !== undefined && v[map.id] ? v[map.id] : undefined;

            const base = { nombre, descripcion_detallada, precio, precio_anterior, stock, destacado, activo, category_id, modo: modoWeb };

            if (id && id.trim()) {
                const { error } = await sb.from('products').update(base).eq('id', Number(id));
                if (error) { errores++; continue; }
                actualizados++;
            } else {
                const { error } = await sb.from('products').insert(base);
                if (error) { errores++; continue; }
                creados++;
            }
        } catch (e) {
            errores++;
        }
    }
    return { procesados, creados, actualizados, errores };
}

export async function importarPedidosCSV(file) {
    const sb = await clienteAdmin();
    const text = await file.text();
    const [encabezado, ...rest] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const cols = encabezado.split(SEP).map((x) => x.replace(/^"|"$/g, '').trim().toLowerCase());
    const map = {};
    ['numero', 'fecha', 'estado', 'nombre', 'email', 'telefono', 'direccion', 'ciudad', 'provincia', 'codigoPostal', 'notas', 'subtotal', 'descuento', 'porcentaje', 'cupon', 'total'].forEach((k) => {
        const i = cols.indexOf(k);
        if (i >= 0) map[k] = i;
    });

    let procesados = 0, creados = 0, actualizados = 0, errores = 0;
    const filas = rest.map((l) => {
        const values = [];
        let inQuotes = false, current = '';
        for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (ch === '"') {
                if (inQuotes && l[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes;
            } else if (ch === SEP && !inQuotes) {
                values.push(current);
                current = '';
            } else current += ch;
        }
        values.push(current);
        return values;
    });

    for (const v of filas) {
        procesados++;
        try {
            const numero = (v[map.numero]||'').replace(/^"|"$/g, '').trim();
            if (!numero) { errores++; continue; }
            const estado = (v[map.estado]||'pendiente').replace(/^"|"$/g, '').trim();
            const cliente = {
                nombre: (v[map.nombre]||'').replace(/^"|"$/g, ''),
                email: (v[map.email]||'').replace(/^"|"$/g, ''),
                telefono: (v[map.telefono]||'').replace(/^"|"$/g, ''),
                direccion: (v[map.direccion]||'').replace(/^"|"$/g, ''),
                ciudad: (v[map.ciudad]||'').replace(/^"|"$/g, ''),
                provincia: (v[map.provincia]||'').replace(/^"|"$/g, ''),
                codigoPostal: (v[map.codigoPostal]||'').replace(/^"|"$/g, ''),
                notas: (v[map.notas]||'').replace(/^"|"$/g, '')
            };
            const subtotal = Number(String(v[map.subtotal]||'').replace(',', '.')) || 0;
            const descuento = Number(String(v[map.descuento]||'').replace(',', '.')) || 0;
            const porcentaje = Number(String(v[map.porcentaje]||'').replace(',', '.')) || 0;
            const cupon = (v[map.cupon]||'').replace(/^"|"$/g, '');
            const total = Number(String(v[map.total]||'').replace(',', '.')) || 0;
            const fecha = (v[map.fecha]||'').replace(/^"|"$/g, '');
            const payload = { numero, cliente, subtotal, descuento, porcentaje, cupon, total, estado };
            if (fecha) payload.created_at = fecha;

            const { data: exists } = await sb.from('orders').select('numero').eq('numero', numero).maybeSingle();
            if (exists) {
                const { error } = await sb.from('orders').update(payload).eq('numero', numero);
                if (error) { errores++; continue; }
                actualizados++;
            } else {
                const { error } = await sb.from('orders').insert(payload);
                if (error) { errores++; continue; }
                creados++;
            }
        } catch (e) {
            errores++;
        }
    }
    return { procesados, creados, actualizados, errores };
}