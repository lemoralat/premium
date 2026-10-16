// ============================================================================
// supabase.js — Capa de datos de la TIENDA PÚBLICA.
//
// Conecta el frontend estático actual (HTML/CSS/JS vanilla) con Supabase,
// manteniendo el CONTRATO EXACTO de datos que esperan los módulos existentes
// (js/utils.js, productos.js, producto-detalle.js, carrusel-hero.js, etc.).
//
// - Usa SOLO la anon key (pública). Nunca hay service_role en el navegador.
// - Si Supabase no está configurado o falla, devuelve { ok: false }; utils.js
//   decide qué mostrar (secciones vacías/ocultas, sin datos alternativos).
// - Caché en memoria con TTL para no repetir consultas idénticas.
// ============================================================================

import { SUPABASE_CONFIG } from './env.generated.js';

let cliente = null;
let promesaCliente = null;
let supabaseCargado = false;

// Cache en memoria (evita múltiples consultas idénticas entre módulos)
const cacheMemoria = new Map();
const TTL_POR_DEFECTO = 60_000; // 60s

function cachear(clave, datos, ttl = TTL_POR_DEFECTO) {
    cacheMemoria.set(clave, { datos, expira: Date.now() + ttl });
}

function leerCache(clave) {
    const entrada = cacheMemoria.get(clave);
    if (!entrada) return null;
    if (Date.now() > entrada.expira) {
        cacheMemoria.delete(clave);
        return null;
    }
    return entrada.datos;
}

// ---------------------------------------------------------------------------
// Refresco automático del catálogo (opción A): re-fetch liviano, sin WebSocket.
//
// Cuándo refresca (una sola red por disparo, compartida por todos los
// suscriptores de la página):
//   - Al volver a la pestaña (visibilitychange → visible).
//   - Al volver de otra página (pageshow con bfcache o back/forward).
//   - Cada 30 s con la página visible (sesiones largas sin tocar la pestaña).
// Solo re-renderiza si cambió la firma de datos (stock/precio/imágenes).
// Si Supabase está caído, no hace nada: siguen en pie los valores que ya
// había en la UI. No hay copia local de los datos (Supabase es la única fuente).
// ---------------------------------------------------------------------------
const INTERVALO_REFRESCO_CATALOGO = 30_000;
const suscriptoresCatalogo = new Set();

export function invalidarCacheProductos() {
    cacheMemoria.delete('productos');
}

// Firma compacta: resume lo que las páginas muestran. Cambia solo si cambió
// algo visible en pantalla (stock, precios, imagen/galería, destacado). En
// productos variables incluye el stock/precio/visibilidad de cada combinación
// (0059): el agregado del producto puede no cambiar aunque cambie una variante.
function firmaProducto(p) {
    const base = [p.id, p.stock, p.precio, p.precioAnterior, p.imagen, (p.galeria || []).join(','), p.destacado ? 1 : 0];
    if (p.tipo === 'variable' && Array.isArray(p.variantes)) {
        // La imagen de la variación (0061) entra en la firma: si el panel la
        // cambia, la ficha abierta se actualiza sola. `v.imagen` es la URL ya
        // resuelta del producto mapeado (no la ruta de Storage).
        base.push(p.variantes.map((v) => `${v.id}:${v.precio}:${v.stock}:${v.activo ? 1 : 0}:${v.imagen || ''}`).join(','));
    }
    return base.join('|');
}

function firmaCatalogo(datos) {
    return datos.map(firmaProducto).join(';');
}

// Fuerza un re-fetch sin usar el caché. Devuelve { ok, datos } de cargarProductos.
export async function refrescarCatalogo() {
    invalidarCacheProductos();
    return cargarProductos();
}

// Registra un re-render que corre con datos frescos solo si algo cambió.
export function suscribirRefrescoCatalogo(callback) {
    suscriptoresCatalogo.add(callback);
    return () => suscriptoresCatalogo.delete(callback);
}

let refrescando = false;
let firmaGlobal = (() => {
    const cacheado = leerCache('productos');
    return Array.isArray(cacheado) ? firmaCatalogo(cacheado) : null;
})();

async function dispararRefresco() {
    if (suscriptoresCatalogo.size === 0 || refrescando || document.visibilityState === 'hidden') return;
    refrescando = true;
    try {
        const resultado = await refrescarCatalogo();
        if (!resultado.ok || !Array.isArray(resultado.datos)) return;
        const firma = firmaCatalogo(resultado.datos);
        if (firmaGlobal === null) {
            // Primera vez: solo sembrar la firma base (los datos ya están cargados).
            firmaGlobal = firma;
            return;
        }
        if (firma === firmaGlobal) return;
        firmaGlobal = firma;
        for (const cb of suscriptoresCatalogo) {
            try { cb(resultado.datos); } catch (error) { console.warn('Suscriptor de refresco falló:', error); }
        }
    } finally {
        refrescando = false;
    }
}

// Disparadores únicos a nivel de módulo: una sola red por evento/tick.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') dispararRefresco();
});
window.addEventListener('pageshow', (event) => {
    const tipo = performance.getEntriesByType('navigation')[0]?.type;
    if (event.persisted || tipo === 'back_forward') dispararRefresco();
});
setInterval(dispararRefresco, INTERVALO_REFRESCO_CATALOGO);

// Inicializa el cliente solo si hay configuración (import dinámico del CDN:
// no se descarga el SDK si el proyecto no está configurado todavía).
export function obtenerClienteSupabase() {
    if (supabaseCargado) return Promise.resolve(cliente);
    if (promesaCliente) return promesaCliente;

    if (!SUPABASE_CONFIG || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.publishableKey) {
        supabaseCargado = true;
        return Promise.resolve(null);
    }

    promesaCliente = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm')
        .then((mod) => {
            cliente = mod.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
                auth: { persistSession: false, autoRefreshToken: false }
            });
            return cliente;
        })
        .catch((error) => {
            console.warn('⚠️ No se pudo cargar @supabase/supabase-js:', error);
            return null;
        })
        .finally(() => { supabaseCargado = true; });

    return promesaCliente;
}

// ============================================================================
// Utilidades de imágenes
// ============================================================================

// storage_path usa la convención "<bucket>/<ruta>". Deriva la URL pública
// (por ejemplo "products/3/foto.webp" → .../object/public/products/3/foto.webp).
//
// OJO: antes esta función aceptaba `external_url` como segunda fuente, que era
// el puente de la migración desde Google Drive. La columna se eliminó en la
// migración 0043: hoy toda imagen sale de Supabase Storage, subida desde el
// panel. Si algún día vuelve a hacer falta una URL externa, que sea una
// decisión consciente y no un resto del modelo de Drive.
export function urlImagen({ storage_path = null } = {}) {
    if (storage_path) {
        const [bucket, ...resto] = String(storage_path).split('/');
        if (cliente && resto.length > 0) {
            const { data } = cliente.storage.from(bucket).getPublicUrl(resto.join('/'));
            if (data && data.publicUrl) return data.publicUrl;
        }
        return storage_path; // último recurso (debería estar correcto ya)
    }
    return '';
}

// Formatear fecha ISO (YYYY-MM-DD) al formato de la tienda (DD/MM/YYYY)
function fechaLocal(dato) {
    if (!dato) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(dato)) {
        const [a, m, d] = dato.slice(0, 10).split('-');
        return `${d}/${m}/${a}`;
    }
    return String(dato);
}

// ============================================================================
// FAVORITOS: podar los que ya no existen en el catálogo
// ============================================================================
// Los favoritos viven SÓLO en localStorage: no hay tabla de ellos en la base,
// así que borrar un producto desde el panel no los toca. El ID queda para
// siempre, el contador del header sigue marcando un favorito que no se puede
// ver ni desmarcar (no hay nada renderizado contra lo que desmarcarlo), y la
// única forma de sacarlo era Clear Site Data. Esto reconcilia la lista contra
// el catálogo en cada carga.
//
// Va acá y no en favoritos.js porque cargarProductos() es el único punto por el
// que pasa una carga EXITOSA del catálogo en todas las páginas: template.js lo
// pide siempre (js/template.js, para el buscador del header) y refrescarCatalogo()
// vuelve por acá, así que también se arregla solo con la pestaña abierta y el
// producto borrado desde el panel en otra.
//
// EL GUARD ES LO IMPORTANTE: un catálogo vacío NO es evidencia de que los
// favoritos estén viejos, y podar contra él vaciaría la lista de todos los
// clientes sin que puedan recuperarla. El catálogo vacío llega por dos motivos:
//   · `.eq('activo', true)` + la policy "Productos: lectura pública activos"
//     (using (activo = true)): desactivar todos los productos —por
//     mantenimiento o por error— devuelve [] de forma legítima. Que la tienda
//     esté vacía no es motivo para tirarle la lista al usuario.
//   · (el camino `ok: false` no llega hasta acá, es sólo defensa de segundo
//     nivel).
// Por eso sólo se poda cuando hay productos vivos contra los que comparar.
//
// Los IDs se comparan como números a propósito: el catálogo hace `id:
// Number(p.id)` y el onclick inline del botón de favorito interpola el número
// como literal JS, así que en localStorage siempre hay números. Un Set con
// tipos cruzados ("5" contra 5) borraría favoritos válidos.
function podarFavoritosInvalidos(catalogo) {
    if (!Array.isArray(catalogo) || catalogo.length === 0) return catalogo;

    const vivos = new Set(catalogo.map(p => p.id));
    try {
        const guardados = JSON.parse(localStorage.getItem('favorites'));
        if (!Array.isArray(guardados) || guardados.length === 0) return catalogo;

        // El Set deduplica además de filtrar: un mismo ID repetido haría que el
        // contador sume dos por un producto marcado una vez, y que haya que
        // desmarcarlo dos veces para sacarlo. Hoy el toggle no puede duplicar
        // (sólo hace push si indexOf da -1), pero como esta línea ya está
        // reescribiendo el array, sale gratis y deja el contador del header igual
        // a la lista por definición.
        const limpios = [...new Set(guardados.filter(id => vivos.has(id)))];
        // No escribir si no cambió nada: cargarProductos corre en cada página y en
        // cada refresco del catálogo, y escribir siempre dispararía el contador.
        if (limpios.length === guardados.length) return catalogo;

        localStorage.setItem('favorites', JSON.stringify(limpios));
    } catch (error) {
        // Sin localStorage (navegador privado) o JSON corrupto: los favoritos son
        // un extra y no pueden romper la carga del catálogo.
        return catalogo;
    }

    if (typeof window.actualizarContadorFavoritosGlobal === 'function') {
        window.actualizarContadorFavoritosGlobal();
    }
    return catalogo;
}

// ============================================================================
// PRODUCTOS
// ============================================================================
export async function cargarProductos() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('productos');
    if (cacheado) return { ok: true, datos: podarFavoritosInvalidos(cacheado) };

    try {
        // Un solo query con las relaciones anidadas (categoría, variantes, imágenes)
        const { data: filas, error } = await sb
            .from('products')
            .select(`
                id, nombre, descripcion_detallada, precio, precio_anterior,
                stock, caracteristicas, activo, destacado, tipo,
                created_at,
                servicio_duracion_min, servicio_horarios,
                categoria:categories(id, name, slug),
                opciones:product_options(id, opcion, position, valores:product_option_values(id, valor, position)),
                variantes:product_variants(id, precio, precio_anterior, stock, activo, position, combinacion, imagen_storage_path),
                imagenes:product_images(id, storage_path, es_principal, position)
            `)
            .eq('activo', true)
            .order('id', { ascending: true });

        if (error) throw error;

        const productos = (filas || []).map(mapaProducto);
        cachear('productos', productos);
        return { ok: true, datos: podarFavoritosInvalidos(productos) };
    } catch (error) {
        // OJO: este mensaje decía "usando fallback JSON", pero los js/*.json
        // se borraron con la migración a Supabase (commit 260c29d). No hay
        // fallback: obtenerProductos() avisa al visitante y devuelve catálogo
        // vacío. Si estás depurando esto, el problema es Supabase: la URL o la
        // anon key de js/env.generated.js, la CSP (connect-src), o la red.
        console.warn('⚠️ Supabase: no se pudieron cargar los productos. Se avisa al visitante y el catálogo queda vacío.', error);
        return { ok: false, error };
    }
}

// Categoría asignada a los productos que no tienen ninguna (category_id null).
//
// Antes se devolvía la cadena vacía, y como el home arma las secciones con
// [...new Set(productos.map(p => p.categoria))].filter(Boolean) (productos-categorias.js)
// — igual que el submenú del header (template.js) — la vacía se filtraba y el
// producto no se renderizaba en NINGUNA parte: el home quedaba sin tarjetas.
// Normalizar acá hace que el producto caiga en su propia sección ("Sin
// categoría") y que el submenú muestre la entrada, sin casos especiales aguas abajo.
export const CATEGORIA_SIN_ASIGNAR = 'Sin categoría';

// Fila de "products" (con joins) → objeto con el contrato del frontend
function mapaProducto(p) {
    const imagenes = Array.isArray(p.imagenes) ? p.imagenes : [];
    // Orden estable por posición (el panel las numera 0..n-1).
    const ordenadas = [...imagenes].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const principal = ordenadas.find(i => i.es_principal) || ordenadas[0] || null;
    // Contrato del frontend: galeria[0] es la imagen principal.
    const galeria = principal
        ? [principal, ...ordenadas.filter(i => i.id !== principal.id)]
        : ordenadas;

    const tipo = p.tipo === 'variable' ? 'variable' : 'simple';

    // Atributos (grupos de opción + valores) — reutilizan product_options.
    const opciones = Array.isArray(p.opciones) ? p.opciones : [];
    const atributos = [...opciones]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(o => ({
            id: o.id,
            opcion: o.opcion,
            position: o.position ?? 0,
            valores: [...(Array.isArray(o.valores) ? o.valores : [])]
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .map(v => ({ id: v.id, valor: v.valor }))
        }));

    // Combinaciones del producto variable (0059): cada una con su precio/stock.
    // Desde 0061 cada variación puede tener su propia imagen: en la ficha, al
    // elegirla, la galería cambia sola a esa foto (js/producto-detalle.js).
    const variantes = tipo === 'variable'
        ? [...(Array.isArray(p.variantes) ? p.variantes : [])]
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map(v => ({
                id: Number(v.id),
                precio: Number(v.precio),
                precioAnterior: v.precio_anterior != null ? Number(v.precio_anterior) : null,
                stock: Number(v.stock),
                activo: v.activo !== false,
                combinacion: Array.isArray(v.combinacion) ? v.combinacion.map(String) : [],
                imagen: urlImagen({ storage_path: v.imagen_storage_path }) || ''
            }))
        : [];

    // Atributos "cosméticos" del sistema anterior (productos históricos en
    // 'simple'): se conservan para no romper su selector ni el texto de variante
    // que viaja en el pedido. No afectan precio ni stock.
    const opcionesLegacy = tipo !== 'variable' && atributos.length > 0
        ? atributos.map(a => ({ opcion: a.opcion, valores: a.valores.map(v => v.valor) }))
        : null;

    const imagenUrl = principal ? urlImagen(principal) : '';
    const galeriaUrls = galeria.map(urlImagen).filter(Boolean);

    return {
        id: Number(p.id),
        nombre: p.nombre,
        descripcionDetallada: p.descripcion_detallada || '',
        precio: Number(p.precio),
        precioAnterior: p.precio_anterior != null ? Number(p.precio_anterior) : null,
        // Sin categoría (o con nombre vacío) → etiqueta explícita, nunca ''.
        categoria: p.categoria?.name?.trim() || CATEGORIA_SIN_ASIGNAR,
        // Slug real de la categoría (para enlazar a su página individual). Vacío
        // en el pseudo-grupo "Sin categoría" (productos sin categoría asignada).
        categoriaSlug: p.categoria?.slug || '',
        createdAt: p.created_at || null,
        tipo,
        atributos,
        variantes,
        opcionesLegacy,
        stock: Number(p.stock),
        caracteristicas: Array.isArray(p.caracteristicas) ? p.caracteristicas : [],
        destacado: Boolean(p.destacado),
        // Modo turnos (0053): duración estimada (min) y horarios por día de la
        // semana (jsonb). Vacíos en una tienda de venta o sin agenda declarada.
        servicioDuracionMin: Math.max(0, Math.floor(Number(p.servicio_duracion_min) || 0)),
        servicioHorarios: Array.isArray(p.servicio_horarios) ? p.servicio_horarios : [],
        imagen: imagenUrl || '',
        galeria: galeriaUrls.length > 0 ? galeriaUrls : (imagenUrl ? [imagenUrl] : [])
    };
}

// ============================================================================
// CATEGORÍAS
// ============================================================================
// Categorías activas, para la página individual de cada una
// (categoria.html?slug=…). La RLS solo expone las activas (0001). La imagen es
// el banner opcional (categories.imagen_path, 0062; vacío ⇒ el banner usa el
// color de marca).
export async function cargarCategorias() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('categorias');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        const { data, error } = await sb
            .from('categories')
            .select('id, name, slug, imagen_path')
            .eq('active', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const categorias = (data || []).map((c) => ({
            id: c.id,
            // Trim para que el nombre coincida exactamente con el que expone
            // mapaProducto (p.categoria?.name?.trim()), que es la clave de agrupación.
            name: (c.name || '').trim(),
            slug: (c.slug || '').trim(),
            imagen: urlImagen({ storage_path: c.imagen_path }) || ''
        }));

        cachear('categorias', categorias);
        return { ok: true, datos: categorias };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar las categorías. La página de categoría no puede renderizarse.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// CUPONES
// ============================================================================
export async function cargarCupones() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('cupones');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        const { data, error } = await sb
            .from('coupons')
            .select('codigo, porcentaje, expira')
            .eq('activo', true)
            .gte('expira', new Date().toISOString().slice(0, 10))
            .order('id', { ascending: true });

        if (error) throw error;
        cachear('cupones', data || []);
        return { ok: true, datos: data || [] };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar los cupones. Se conserva el valor previo de CONFIG_CUPONES (sin cupones en la primera carga).', error);
        return { ok: false, error };
    }
}

// ============================================================================
// RESEÑAS
// ============================================================================
export async function cargarResenas() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('resenas');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        const { data, error } = await sb
            .from('reviews')
            .select('id, nombre, valoracion, resena, fecha, storage_path, red')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const resenas = (data || []).map(r => ({
            fecha: fechaLocal(r.fecha),
            nombre: r.nombre,
            valoracion: Number(r.valoracion),
            resena: r.resena || '',
            imagen: urlImagen(r) || '',
            red: r.red || 'fa-google'
        }));

        cachear('resenas', resenas);
        return { ok: true, datos: resenas };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar las reseñas. El carrusel se oculta.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// CARRUSEL (hero)
// ============================================================================
export async function cargarCarrusel() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('carrusel');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        // `select('*')` en vez de columnas fijas: la columna `mostrar_en`
        // (migración 0019: mostrar elemento en móvil/desktop/ambos) puede no
        // existir todavía; con una lista fija el query fallaría y toda la
        // portada se quedaría sin carrusel. Con '*' las columnas ausentes
        // simplemente no llegan y `mostrarEn` queda en 'ambos'.
        const { data, error } = await sb
            .from('sliders')
            .select('*')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const items = (data || []).map(s => ({
            titulo: s.titulo || '',
            textoSoporte: s.texto_soporte || '',
            imagen: urlImagen(s) || '',
            link: s.link || '',
            target: s.target === 'externo' ? 'externo' : 'interno',
            mostrarEn: s.mostrar_en || 'ambos'
        }));

        cachear('carrusel', items);
        return { ok: true, datos: items };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudo cargar el carrusel. La sección del hero se oculta.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// BANNERS
// ============================================================================
export async function cargarBanners() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('banners');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        const { data, error } = await sb
            .from('banners')
            .select('id, imagen_path, logo_path, badge, titulo, boton, link, target, en_carrito')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const banners = (data || []).map(b => ({
            imagen: urlImagen({ storage_path: b.imagen_path }) || '',
            logo: urlImagen({ storage_path: b.logo_path }),
            badge: b.badge || '',
            titulo: b.titulo || '',
            boton: b.boton || '',
            link: b.link || '',
            target: b.target === 'externo' ? 'externo' : 'interno',
            // El del carrito se elige en el panel, no por posición (migración 0030).
            en_carrito: b.en_carrito === true
        }));

        cachear('banners', banners);
        return { ok: true, datos: banners };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar los banners. La portada queda sin banners.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// ICONOS DEL PIE (sección iconos-pie del home)
// ============================================================================
export async function cargarIconosPie() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('iconos-pie');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        const { data, error } = await sb
            .from('iconos_pie')
            .select('id, titulo, descripcion, storage_path, icono')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const iconos = (data || []).map(i => ({
            titulo: i.titulo || '',
            descripcion: i.descripcion || '',
            imagen: urlImagen(i) || '',
            icono: i.icono || ''
        }));

        cachear('iconos-pie', iconos);
        return { ok: true, datos: iconos };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar los iconos del pie. La sección se oculta.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// PREGUNTAS FRECUENTES (página faq.html)
// ============================================================================
export async function cargarPreguntasFrecuentes() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('preguntas-frecuentes');
    if (cacheado) return { ok: true, datos: cacheado.datos, total: cacheado.total };

    try {
        // Consulta paralela: las preguntas activas (visibles) y el TOTAL de
        // filas vía la RPC security definer (migración 0015). La tienda usa el
        // total para distinguir "tabla vacía" (fallback estático) de "todas
        // ocultas" (ocultar la sección), algo que la RLS no permite por SELECT.
        const [seleccion, conteo] = await Promise.all([
            sb
                .from('preguntas_frecuentes')
                .select('id, icono, pregunta, respuesta')
                .eq('activo', true)
                .order('position', { ascending: true }),
            sb.rpc('contar_preguntas_frecuentes')
        ]);

        if (seleccion.error) throw seleccion.error;

        const preguntas = (seleccion.data || []).map(p => ({
            id: p.id,
            icono: p.icono || '',
            pregunta: p.pregunta || '',
            respuesta: p.respuesta || ''
        }));

        // Si el RPC falla (migración 0015 sin aplicar) se degrada a
        // "total = visibles": equivale al comportamiento anterior y no rompe el
        // render, solo pierde la distinción vacía/todas-ocultas.
        const total = (conteo.error ? preguntas.length : (conteo.data ?? preguntas.length));

        const resultado = { datos: preguntas, total };
        cachear('preguntas-frecuentes', resultado);
        return { ok: true, ...resultado };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar las preguntas frecuentes, usando contenido estático.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// MARQUEE PROMOCIONAL (barra superior, sección "Diseño" del panel)
// ============================================================================
export async function cargarMarquee() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('marquee');
    if (cacheado) return { ok: true, datos: cacheado.datos };

    try {
        const { data, error } = await sb
            .from('marquee_items')
            .select('texto')
            .eq('activo', true)
            .order('position', { ascending: true });
        if (error || !data) return { ok: false, error };

        const textos = data.map((m) => String(m.texto || '').trim()).filter(Boolean);
        cachear('marquee', { datos: textos });
        return { ok: true, datos: textos };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudo cargar el marquee promocional, quedará oculto.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// TURNOS OCUPADOS (modo turnos, 0054)
// ============================================================================
// Horarios que ya están tomados (turno Confirmado/Realizado) para que la
// solicitud de turno no los ofrezca. La RLS no deja leer `turnos` a la anon
// key, así que la tienda consulta la RPC pública turnos_ocupados (security
// definer), que solo expone fecha/hora/duración — nunca datos del cliente.
export async function cargarTurnosOcupados(desde = '', hasta = '') {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const clave = `turnos-ocupados:${desde}:${hasta}`;
    const cacheado = leerCache(clave);
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        const { data, error } = await sb.rpc('turnos_ocupados', {
            p_desde: desde,
            p_hasta: hasta
        });
        if (error) throw error;

        const ocupados = Array.isArray(data)
            ? data.map((o) => ({
                fecha: String(o?.fecha || ''),
                hora: String(o?.hora || ''),
                duracion: Math.max(0, Math.floor(Number(o?.duracion) || 0))
            }))
            : [];

        // TTL corto (30 s): si el admin confirma un turno en el panel, el
        // horario deja de ofrecerse con la próxima apertura del formulario.
        cachear(clave, ocupados, 30_000);
        return { ok: true, datos: ocupados };
    } catch (error) {
        // Degradación controlada: se ofrecen todos los horarios de la agenda;
        // insertar_turno (0054) igual rechaza los ocupados al registrar.
        console.warn('⚠️ Supabase: no se pudieron cargar los turnos ocupados; la agenda se ofrece sin filtro de ocupación.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// CONFIGURACIÓN GLOBAL (settings de fila única)
// ============================================================================
export async function cargarConfiguracion() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('config');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        const { data, error } = await sb
            .from('settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (error || !data) return { ok: false, error };

        cachear('config', data, 300_000); // 5 min
        return { ok: true, datos: data };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudo cargar la configuración, usando valores por defecto.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// SESIÓN DEL PANEL (¿el visitante actual es el administrador?)
// ============================================================================
// La tienda pública es anónima (obtenerClienteSupabase usa persistSession:false),
// así que NO ve la sesión del panel. La cookie que el panel espeja es HttpOnly y
// Path=/admin: el front no puede leerla ni enviarla. La vía disponible es la
// sesión que el propio SDK de Supabase persiste en localStorage (mismo origen):
// este cliente aparte la lee y la valida con el RPC es_admin() — la misma
// verificación que hace admin/js/auth.js. Sin sesión, sin ser admin o sin
// Supabase configurado/caído => false (se trata como visitante).
let clienteAuth = null;
let promesaAuth = null;

function obtenerClienteAuth() {
    if (clienteAuth) return Promise.resolve(clienteAuth);
    if (promesaAuth) return promesaAuth;

    if (!SUPABASE_CONFIG || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.publishableKey) {
        return Promise.resolve(null);
    }

    // Mismo SDK (el navegador ya lo tiene cacheado por obtenerClienteSupabase);
    // persistSession:true para LEER la sesión del panel, sin auto-refresco para
    // no pisar el ciclo de token del panel.
    promesaAuth = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm')
        .then((mod) => {
            clienteAuth = mod.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
                auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
            });
            return clienteAuth;
        })
        .catch(() => null);

    return promesaAuth;
}

// ¿El visitante actual es un administrador con sesión activa?
export async function esAdminActual() {
    try {
        const sb = await obtenerClienteAuth();
        if (!sb) return false;

        const { data } = await sb.auth.getSession();
        if (!data || !data.session) return false;

        // es_admin() está concedido a `authenticated` (0049): con el JWT adjunto
        // devuelve si auth.uid() figura en public.admins.
        const { data: esAdmin, error } = await sb.rpc('es_admin');
        return error ? false : esAdmin === true;
    } catch (error) {
        console.warn('No se pudo verificar la sesión del panel:', error);
        return false;
    }
}