// ============================================================================
// exportar-datos.js — Exportación e importación de datos del panel en CSV.
//
// Exportación: PRODUCTOS y PEDIDOS, cada uno con su botón y su archivo.
// Importación: PRODUCTOS y PEDIDOS desde un CSV (mismas columnas que la
// exportación). Corre 100% del lado del cliente con la sesión admin
// autenticada (clienteAdmin); no se usa service_role ni se agregan endpoints.
// ============================================================================

import { clienteAdmin } from './admin-supabase.js';
import {
    guardarVariantesProducto,
    calcularPrecioStock,
    serializarAtributos,
    serializarVariantes,
    parsearAtributos,
    parsearVariantes
} from './variantes.js';

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

// ============================================================================
// Utilidades de importación CSV
// ============================================================================

// Limpia comillas residuales y espacios de una celda.
function limpiarCelda(valor) {
    return String(valor === undefined || valor === null ? '' : valor).replace(/^"|"$/g, '').trim();
}

// Detecta el separador mirando el encabezado: Excel es-AR usa ';', otras
// configuraciones usan ',' o tabulación.
function detectarSeparador(encabezado) {
    for (const c of [';', '\t', ',']) {
        if (encabezado.includes(c)) return c;
    }
    return SEP;
}

// Parser de una línea CSV con comillas dobles ("" = comilla literal).
function parsearLineaCSV(linea, sep) {
    const values = [];
    let inQuotes = false, current = '';
    for (let i = 0; i < linea.length; i++) {
        const ch = linea[i];
        if (ch === '"') {
            if (inQuotes && linea[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes;
        } else if (ch === sep && !inQuotes) {
            values.push(current);
            current = '';
        } else current += ch;
    }
    values.push(current);
    return values;
}

// Nombres de columna sin acentos, en minúscula y sin espacios: "Categoría" y
// "categoria" apuntan a la misma columna.
function normalizarEncabezados(encabezado, sep) {
    return parsearLineaCSV(encabezado, sep).map((x) => limpiarCelda(x).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

// "Sí" / "Si" / "SI" / "true" / "1" / "x" → true.
function esVerdadero(valor) {
    const v = limpiarCelda(valor).toLowerCase();
    return v === 'sí' || v === 'si' || v === 'true' || v === '1' || v === 'x';
}

// Horarios de un servicio ([{dia, desde, hasta}], migración 0053) a texto:
// "Lunes 09:00-18:00 | Sábado 10:00-14:00". Una fila sin horario (solo día)
// se exporta como "Lunes".
function serializarHorarios(horarios) {
    if (!Array.isArray(horarios)) return '';
    return horarios.map((h) => {
        const dia = String(h?.dia || '').trim();
        const desde = String(h?.desde || '').trim();
        const hasta = String(h?.hasta || '').trim();
        if (!dia) return '';
        return desde && hasta ? `${dia} ${desde}-${hasta}` : dia;
    }).filter(Boolean).join(' | ');
}

function normalizarHora(hora) {
    const [hh, mm] = String(hora).split(':');
    return `${String(Number(hh)).padStart(2, '0')}:${mm}`;
}

// "Lunes 09:00-18:00 | Sábado" → [{dia, desde, hasta}].
function parsearHorarios(texto) {
    return String(texto || '').split('|')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
            const m = x.match(/^(.+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
            if (!m) return { dia: x, desde: '', hasta: '' };
            return { dia: m[1].trim(), desde: normalizarHora(m[2]), hasta: normalizarHora(m[3]) };
        })
        .filter((h) => h.dia);
}

// Lista simple (características) separada por "|".
function parsearLista(texto) {
    return String(texto || '').split('|').map((x) => x.trim()).filter(Boolean);
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
// PRODUCTOS (.csv) — columnas: id, tipo, nombre, categoría, precio, precio
// anterior, stock, destacado, activo, descripción, atributos y variantes
// (productos variables, 0059), duración estimada y horarios (solo en modo
// turnos, 0053), características y fecha de creación. Orden: id asc.
//
// En un producto variable, precio y stock de la fila son el AGREGADO (mínimo y
// suma de las variantes); las combinaciones reales viajan en las columnas
// "atributos" y "variantes". El SKU no se exporta porque la base lo genera.
// ----------------------------------------------------------------------------
export async function exportarProductosCSV() {
    const sb = await clienteAdmin();
    const { data, error } = await sb.from('products').select(`
        id, nombre, descripcion_detallada, precio, precio_anterior, stock, activo,
        destacado, created_at, caracteristicas, tipo,
        servicio_duracion_min, servicio_horarios,
        categoria:categories(name),
        opciones:product_options(id, opcion, position, valores:product_option_values(id, valor, position)),
        variantes:product_variants(id, precio, precio_anterior, stock, activo, position, combinacion)
    `).order('id', { ascending: true });
    if (error) throw new Error(error.message);

    const encabezados = ['id', 'tipo', 'nombre', 'categoría', 'precio', 'precio_anterior', 'stock', 'destacado', 'activo', 'descripcion', 'atributos', 'variantes', 'duracion_estimada', 'horarios', 'caracteristicas', 'fecha_creacion'];
    const filas = data.map((p) => {
        const esVariable = p.tipo === 'variable';
        // Atributos y variaciones, ya ordenados como se generaron.
        const atributos = esVariable ? serializarAtributos(
            (p.opciones || [])
                .slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .map((o) => ({
                    opcion: o.opcion,
                    valores: (o.valores || []).slice()
                        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                        .map((v) => v.valor)
                }))
        ) : '';
        const variantes = esVariable ? serializarVariantes(
            (p.variantes || [])
                .slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .map((v) => ({
                    combinacion: Array.isArray(v.combinacion) ? v.combinacion.map(String) : [],
                    precio: v.precio,
                    precio_anterior: v.precio_anterior,
                    stock: v.stock,
                    activo: v.activo !== false
                }))
        ) : '';

        return [
            p.id,
            esVariable ? 'variable' : 'simple',
            p.nombre,
            p.categoria?.name || '',
            numero(p.precio),
            numero(p.precio_anterior),
            p.stock,
            siono(p.destacado),
            siono(p.activo),
            p.descripcion_detallada || '',
            atributos,
            variantes,
            Number(p.servicio_duracion_min) > 0 ? Number(p.servicio_duracion_min) : '',
            serializarHorarios(p.servicio_horarios),
            Array.isArray(p.caracteristicas) ? p.caracteristicas.join(' | ') : '',
            fechaISO(p.created_at)
        ];
    });

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
    const lineas = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const encabezado = lineas[0] || '';
    const rest = lineas.slice(1);
    const sep = detectarSeparador(encabezado);
    const cols = normalizarEncabezados(encabezado, sep);

    const map = {};
    ['id', 'tipo', 'nombre', 'categoria', 'precio', 'precio_anterior', 'stock', 'destacado', 'activo', 'descripcion', 'descripcion_detallada', 'atributos', 'variantes', 'duracion_estimada', 'horarios', 'caracteristicas'].forEach((k) => {
        const i = cols.indexOf(k);
        if (i >= 0) map[k] = i;
    });

    // Diagnóstico explícito: si falta la columna clave, se informa qué llegó
    // y qué se espera, en vez de "procesar" cero filas sin aviso.
    if (map.nombre === undefined) {
        throw new Error(`No se encontró la columna "nombre". Encabezado recibido: "${encabezado}". Columnas esperadas: id;tipo;nombre;categoría;precio;precio_anterior;stock;destacado;activo;descripcion;atributos;variantes;duracion_estimada;horarios;caracteristicas`);
    }

    // creadosConId: filas que traían un id que no existe y se crearon como
    // nuevos ítems (se informa en el resumen para que no sea sorpresa).
    let procesados = 0, creados = 0, actualizados = 0, errores = 0, primerError = '', creadosConId = 0;
    const filas = rest.map((l) => parsearLineaCSV(l, sep))
        .filter((c) => c.some((x) => limpiarCelda(x) !== ''));

    const categorias = {};
    const { data: cats } = await sb.from('categories').select('id, name');
    (cats||[]).forEach(c => categorias[String(c.name).toLowerCase()] = c.id);

    const modoWeb = await (async () => {
        const { data: s } = await sb.from('settings').select('modo_web').eq('id', 1).single();
        return s?.modo_web === 'turnos' ? 'turnos' : 'venta';
    })();

    // ¿La migración 0056 (products.modo) está aplicada? Si no lo está, se omite
    // la columna para que la importación no falle fila por fila.
    let tieneModo = true;
    {
        const { error } = await sb.from('products').select('modo').limit(1);
        if (error) tieneModo = false;
    }

    // ¿Existen productos variables (0059/0060)? Si no, no se tocan atributos
    // ni variaciones (archivos viejos o una BD sin migrar).
    let tieneVariantes = true;
    {
        const { error } = await sb.from('product_variants').select('id').limit(1);
        if (error) tieneVariantes = false;
    }

    // Tipo actual de cada producto existente (para detectar conversión).
    const tipoPorId = new Map();
    {
        const { data } = await sb.from('products').select('id, tipo');
        (data || []).forEach((p) => tipoPorId.set(String(p.id), p.tipo || 'simple'));
    }

    for (const v of filas) {
        procesados++;
        try {
            const nombre = limpiarCelda(v[map.nombre]);
            if (!nombre) { errores++; if (!primerError) primerError = 'Hay filas sin nombre.'; continue; }
            const descripcion_detallada = limpiarCelda(
                map.descripcion_detallada !== undefined ? v[map.descripcion_detallada] : v[map.descripcion]
            );
            const precio = Number(limpiarCelda(v[map.precio]).replace(',', '.')) || 0;
            const precioAnteriorBruto = limpiarCelda(v[map.precio_anterior]);
            const precio_anterior = precioAnteriorBruto !== '' ? (Number(precioAnteriorBruto.replace(',', '.')) || null) : null;
            // En modo turnos los servicios no manejan stock (espeja al panel).
            const stock = modoWeb === 'turnos' ? 0 : (Number(limpiarCelda(v[map.stock])) || 0);
            const destacado = map.destacado !== undefined ? esVerdadero(v[map.destacado]) : false;
            // Sin columna "activo" el ítem se crea visible (igual que la base).
            const activo = map.activo !== undefined ? esVerdadero(v[map.activo]) : true;
            const catName = limpiarCelda(v[map.categoria]);
            const category_id = catName ? (categorias[catName.toLowerCase()] || null) : null;
            const id = limpiarCelda(v[map.id]);

            // Productos variables (0059): el CSV trae "atributos" y "variantes".
            // En modo turnos no hay variables (los servicios son siempre simples).
            const tieneTipoCol = map.tipo !== undefined;
            const tipoTxt = tieneTipoCol ? limpiarCelda(v[map.tipo]).toLowerCase() : 'simple';
            const esVariable = modoWeb !== 'turnos' && tipoTxt === 'variable' && tieneVariantes;
            const tipoExistente = id ? (tipoPorId.get(id) || 'simple') : 'simple';
            // Limpia las variantes cuando un producto VARIABLE pasa a simple.
            const limpiaVariable = esVariable
                ? false
                : (tieneTipoCol && tieneVariantes && tipoExistente === 'variable');

            let atributos = [];
            let variaciones = [];
            if (esVariable) {
                atributos = parsearAtributos(map.atributos !== undefined ? limpiarCelda(v[map.atributos]) : '');
                variaciones = parsearVariantes(map.variantes !== undefined ? limpiarCelda(v[map.variantes]) : '');
                if (atributos.length === 0 || variaciones.length === 0) {
                    errores++; if (!primerError) primerError = `El producto "${nombre}" se marca como variable pero le faltan "atributos" o "variantes".`;
                    continue;
                }
            }

            const base = { nombre, descripcion_detallada, precio, precio_anterior, stock, destacado, activo, category_id };
            if (tieneModo) base.modo = modoWeb;
            if (tieneTipoCol) base.tipo = esVariable ? 'variable' : 'simple';
            if (esVariable) {
                // Precio y stock representativos salen de las combinaciones
                // (espeja el trigger de la 0059; los pisa a la fila del CSV).
                const agg = calcularPrecioStock(variaciones);
                base.precio = agg.precio;
                base.stock = agg.stock;
                base.precio_anterior = null;
            }
            // Campos de servicio y listas (0053): solo se escriben si el CSV trae
            // la columna, para no pisar duración/horarios/características al
            // importar un archivo que no las incluye.
            if (map.duracion_estimada !== undefined) {
                base.servicio_duracion_min = Number(limpiarCelda(v[map.duracion_estimada]).replace(',', '.')) || 0;
            }
            if (map.horarios !== undefined) {
                base.servicio_horarios = parsearHorarios(limpiarCelda(v[map.horarios]));
            }
            if (map.caracteristicas !== undefined) {
                base.caracteristicas = parsearLista(limpiarCelda(v[map.caracteristicas]));
            }

            let productoId = null;
            if (id) {
                // El id actualiza la fila existente. Si el id no existe (archivo
                // exportado de otra instalación, o fila cargada a mano con id
                // viejo), se CREA en su lugar: ninguna fila se descarta en silencio.
                const { data: actualizadas, error } = await sb.from('products').update(base).eq('id', Number(id)).select('id');
                if (error) { errores++; if (!primerError) primerError = error.message; continue; }
                if (actualizadas && actualizadas.length > 0) {
                    productoId = Number(actualizadas[0].id);
                    actualizados++;
                } else {
                    const { data: creado, error: errorInsert } = await sb.from('products').insert(base).select('id').single();
                    if (errorInsert) { errores++; if (!primerError) primerError = errorInsert.message; continue; }
                    productoId = creado.id;
                    creados++;
                    creadosConId++;
                }
            } else {
                const { data: creado, error } = await sb.from('products').insert(base).select('id').single();
                if (error) { errores++; if (!primerError) primerError = error.message; continue; }
                productoId = creado.id;
                creados++;
            }

            // Atributos y variaciones (lógica compartida con el panel).
            if (esVariable || limpiaVariable) {
                await guardarVariantesProducto(sb, productoId, {
                    tipo: esVariable ? 'variable' : 'simple',
                    tipoOriginal: tipoExistente,
                    atributos,
                    variaciones
                });
            }
        } catch (e) {
            errores++;
            if (!primerError) primerError = e.message;
        }
    }
    return { procesados, creados, actualizados, errores, creadosConId, mensaje: primerError };
}

export async function importarPedidosCSV(file) {
    const sb = await clienteAdmin();
    const text = await file.text();
    const lineas = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const encabezado = lineas[0] || '';
    const rest = lineas.slice(1);
    const sep = detectarSeparador(encabezado);
    const cols = normalizarEncabezados(encabezado, sep);
    const map = {};
    ['numero', 'fecha', 'estado', 'nombre', 'email', 'telefono', 'direccion', 'ciudad', 'provincia', 'codigoPostal', 'notas', 'subtotal', 'descuento', 'porcentaje', 'cupon', 'total'].forEach((k) => {
        const i = cols.indexOf(k);
        if (i >= 0) map[k] = i;
    });

    if (map.numero === undefined) {
        throw new Error(`No se encontró la columna "numero". Encabezado recibido: "${encabezado}". Columnas esperadas: numero;fecha;estado;nombre;email;telefono;...`);
    }

    let procesados = 0, creados = 0, actualizados = 0, errores = 0, primerError = '';
    const filas = rest.map((l) => parsearLineaCSV(l, sep))
        .filter((c) => c.some((x) => limpiarCelda(x) !== ''));

    for (const v of filas) {
        procesados++;
        try {
            const numero = limpiarCelda(v[map.numero]);
            if (!numero) { errores++; if (!primerError) primerError = 'Hay filas sin número de pedido.'; continue; }
            const estado = limpiarCelda(v[map.estado]) || 'pendiente';
            const cliente = {
                nombre: limpiarCelda(v[map.nombre]),
                email: limpiarCelda(v[map.email]),
                telefono: limpiarCelda(v[map.telefono]),
                direccion: limpiarCelda(v[map.direccion]),
                ciudad: limpiarCelda(v[map.ciudad]),
                provincia: limpiarCelda(v[map.provincia]),
                codigoPostal: limpiarCelda(v[map.codigoPostal]),
                notas: limpiarCelda(v[map.notas])
            };
            const subtotal = Number(limpiarCelda(v[map.subtotal]).replace(',', '.')) || 0;
            const descuento = Number(limpiarCelda(v[map.descuento]).replace(',', '.')) || 0;
            const porcentaje = Number(limpiarCelda(v[map.porcentaje]).replace(',', '.')) || 0;
            const cupon = limpiarCelda(v[map.cupon]);
            const total = Number(limpiarCelda(v[map.total]).replace(',', '.')) || 0;
            const fecha = limpiarCelda(v[map.fecha]);
            const payload = { numero, cliente, subtotal, descuento, porcentaje, cupon, total, estado };
            if (fecha) payload.created_at = fecha;

            const { data: exists, error: errorBuscar } = await sb.from('orders').select('numero').eq('numero', numero).maybeSingle();
            if (errorBuscar) { errores++; if (!primerError) primerError = errorBuscar.message; continue; }
            if (exists) {
                const { error } = await sb.from('orders').update(payload).eq('numero', numero);
                if (error) { errores++; if (!primerError) primerError = error.message; continue; }
                actualizados++;
            } else {
                const { error } = await sb.from('orders').insert(payload);
                if (error) { errores++; if (!primerError) primerError = error.message; continue; }
                creados++;
            }
        } catch (e) {
            errores++;
            if (!primerError) primerError = e.message;
        }
    }
    return { procesados, creados, actualizados, errores, mensaje: primerError };
}