// ============================================================================
// variantes.js — Lógica compartida de productos variables (0059/0060).
//
// Única fuente de la sincronización de atributos y variaciones contra la base:
// la usan el formulario de productos (productos.js) y la importación CSV
// (exportar-datos.js). No importa nada: recibe el cliente Supabase (sb) ya
// autenticado, así no hay dependencias cruzadas.
//
// El SKU NO se maneja acá: lo genera la base automáticamente (migración 0060)
// cuando la variante queda sin SKU. Al no mandarlo, una variante existente
// conserva el suyo y una nueva lo recibe solo.
// ============================================================================

// Clave canónica de una combinación: los valores, en el orden de los atributos.
export function claveCombinacion(valores) {
    return (valores || []).map((v) => String(v)).join(' \u0001 ');
}

// ¿La combinación tiene la forma esperada? (lista de valores no vacíos)
export function combinacionValida(valores) {
    return Array.isArray(valores) && valores.length > 0 && valores.every((v) => String(v).trim() !== '');
}

// Precio (mínimo de las activas) y stock (suma de las activas) representativos
// del producto. Si no hay activas, usa todas. Espeja el trigger de la 0059.
export function calcularPrecioStock(variaciones) {
    const lista = Array.isArray(variaciones) ? variaciones : [];
    const activas = lista.filter((v) => v.activo !== false);
    const base = activas.length ? activas : lista;
    if (base.length === 0) return { precio: 0, stock: 0 };
    return {
        precio: Math.min(...base.map((v) => Number(v.precio) || 0)),
        stock: base.reduce((n, v) => n + (Number(v.stock) || 0), 0)
    };
}

// ---------------------------------------------------------------------------
// Sincronización contra la base
// ---------------------------------------------------------------------------

// Reemplaza los atributos (product_options + product_option_values). Nada los
// referencia por id, así que el reemplazo completo es seguro.
export async function reemplazarAtributos(sb, productoId, atributos) {
    await sb.from('product_options').delete().eq('product_id', productoId);
    let posOpt = 0;
    for (const a of atributos) {
        const { data: optData, error: optError } = await sb.from('product_options')
            .insert({ product_id: productoId, opcion: a.opcion, position: posOpt })
            .select('id').single();
        if (optError) throw new Error(optError.message);
        let posVal = 0;
        for (const valor of a.valores) {
            const { error: valError } = await sb.from('product_option_values')
                .insert({ product_option_id: optData.id, valor, position: posVal });
            if (valError) throw new Error(valError.message);
            posVal++;
        }
        posOpt++;
    }
}

// Sincroniza las variaciones por combinación: las que ya existían se ACTUALIZAN
// (conservan su id, así los pedidos viejos no pierden su variant_id) y solo se
// borran las que desaparecieron.
//
// Devuelve `{ ids, eliminadas }`:
//   · ids:       el id de cada variación, en el MISMO orden que `variaciones`.
//                Lo usa el formulario para asociar la foto elegida en cada fila
//                con su variante ya guardada (0061).
//   · eliminadas: [{ id, imagen_storage_path }] de las que se borraron, para
//                que quien llama pueda limpiar sus archivos de Storage.
export async function sincronizarVariaciones(sb, productoId, variaciones) {
    const { data: existentes, error: errExistentes } = await sb.from('product_variants')
        .select('id, combinacion, imagen_storage_path').eq('product_id', productoId);
    if (errExistentes) throw new Error(errExistentes.message);

    const idPorCombinacion = new Map(
        (existentes || []).map((v) => [
            claveCombinacion(Array.isArray(v.combinacion) ? v.combinacion.map(String) : []),
            v.id
        ])
    );

    const idsConservados = new Set();
    // ids de cada combinación, en el MISMO orden que `variaciones`: el llamador
    // los usa para saber a qué variante corresponde la foto de cada fila.
    const ids = [];
    // 23505 = violación de único: por combinación repetida (o un SKU a mano que
    // ya esté en uso). Se explica con las etiquetas del combo, no el error crudo.
    const errorAmigable = (error, valores) => {
        if (error && error.code === '23505') {
            const txt = error.message || '';
            if (/sku/i.test(txt)) return new Error(`El SKU generado para «${(valores || []).join(' · ')}» ya está en uso por otra variante.`);
            return new Error(`La combinación «${(valores || []).join(' · ')}» está repetida en el producto.`);
        }
        return new Error(error ? error.message : 'No se pudo guardar la variación.');
    };

    let posVar = 0;
    for (const v of variaciones) {
        // Sin sku a propósito: lo completa la base (0060) si falta.
        const fila = {
            product_id: productoId,
            precio: v.precio,
            precio_anterior: v.precio_anterior,
            stock: v.stock,
            activo: v.activo !== false,
            position: posVar,
            combinacion: v.combinacion
        };
        const clave = claveCombinacion(v.combinacion);
        if (idPorCombinacion.has(clave)) {
            const idVar = idPorCombinacion.get(clave);
            idsConservados.add(idVar);
            ids.push(idVar);
            const { error } = await sb.from('product_variants').update(fila).eq('id', idVar);
            if (error) throw errorAmigable(error, v.combinacion);
        } else {
            const { data, error } = await sb.from('product_variants').insert(fila).select('id').single();
            if (error) throw errorAmigable(error, v.combinacion);
            idsConservados.add(data.id);
            ids.push(data.id);
        }
        posVar++;
    }

    const eliminadas = (existentes || [])
        .filter((v) => !idsConservados.has(v.id))
        .map((v) => ({ id: v.id, imagen_storage_path: v.imagen_storage_path || null }));
    if (eliminadas.length) {
        await sb.from('product_variants').delete().in('id', eliminadas.map((v) => v.id));
    }

    return { ids, eliminadas };
}

// Aplica el estado de variantes del producto según su tipo:
//   · variable: reescribe atributos y sincroniza las combinaciones.
//   · simple: si ANTES era variable (se convirtió), limpia atributos y
//     variaciones. Si siempre fue simple, NO toca las product_options
//     históricas (productos con opciones del sistema viejo): ningún producto
//     simple existente pierde datos.
//
// Devuelve { ids, eliminadas }: `ids` viene en el MISMO orden que `variaciones`
// (así el panel sabe a qué variante pertenece la foto de cada fila) y
// `eliminadas` son las variantes borradas (con su imagen, para poder limpiar el
// archivo de Storage sin dejar huérfanos).
export async function guardarVariantesProducto(sb, productoId, { tipo, tipoOriginal = 'simple', atributos = [], variaciones = [] }) {
    if (tipo === 'variable') {
        await reemplazarAtributos(sb, productoId, atributos);
        return await sincronizarVariaciones(sb, productoId, variaciones);
    }

    if (tipoOriginal === 'variable') {
        // Se leen antes de borrar: después ya no hay a quién preguntarle qué
        // imágenes quedaron huérfanas.
        const { data: existentes, error } = await sb.from('product_variants')
            .select('id, imagen_storage_path').eq('product_id', productoId);
        if (error) throw new Error(error.message);
        await sb.from('product_variants').delete().eq('product_id', productoId);
        await sb.from('product_options').delete().eq('product_id', productoId);
        return {
            ids: [],
            eliminadas: (existentes || []).map((v) => ({ id: v.id, imagen_storage_path: v.imagen_storage_path || null }))
        };
    }

    return { ids: [], eliminadas: [] };
}

// ---------------------------------------------------------------------------
// (De)serialización para el CSV
//   atributos: "Color: Rojo, Azul | Talle: S, M, L"
//   variantes: "Rojo / S~1500~~5~Sí || Azul / M~1600~1800~3~No"
//              campos: precio ~ precio_anterior ~ stock ~ activo
//   (los valores de la combinación van en el orden de los atributos)
// ---------------------------------------------------------------------------
const SEP_VARIANTES = ' || ';
const SEP_CAMPOS = '~';
const SEP_VALORES = ' / ';

export function serializarAtributos(atributos) {
    return (atributos || [])
        .map((a) => `${a.opcion}: ${(a.valores || []).join(', ')}`)
        .join(' | ');
}

export function parsearAtributos(texto) {
    return String(texto || '').split('|')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
            const idx = x.indexOf(':');
            const opcion = (idx >= 0 ? x.slice(0, idx) : x).trim();
            const valores = (idx >= 0 ? x.slice(idx + 1) : '')
                .split(',').map((y) => y.trim()).filter(Boolean);
            return { opcion, valores };
        })
        .filter((a) => a.opcion && a.valores.length > 0);
}

export function serializarVariantes(variaciones) {
    return (variaciones || []).map((v) => {
        const combos = (v.combinacion || []).map((x) => String(x)).join(SEP_VALORES);
        const activo = v.activo === false || String(v.activo).toLowerCase() === 'no' ? 'No' : 'Sí';
        const pa = v.precio_anterior === null || v.precio_anterior === undefined ? '' : v.precio_anterior;
        return [combos, v.precio, pa, v.stock, activo].join(SEP_CAMPOS);
    }).join(SEP_VARIANTES);
}

export function parsearVariantes(texto) {
    return String(texto || '').split('||')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
            const partes = x.split('~');
            const combinacion = String(partes[0] || '')
                .split('/').map((y) => y.trim()).filter((y) => y !== '');
            const num = (t, def) => {
                const s = t === undefined ? '' : String(t).trim();
                return s === '' ? def : (Number(s.replace(',', '.')) || 0);
            };
            const paTxt = partes[2] === undefined ? '' : String(partes[2]).trim();
            return {
                combinacion,
                precio: num(partes[1], 0),
                precio_anterior: paTxt === '' ? null : (Number(paTxt.replace(',', '.')) || 0),
                stock: num(partes[3], 0),
                activo: partes[4] === undefined ? true : !/^no$/i.test(String(partes[4]).trim())
            };
        })
        .filter((v) => v.combinacion.length > 0);
}
