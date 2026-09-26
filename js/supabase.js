// ============================================================================
// supabase.js — Capa de datos de la TIENDA PÚBLICA.
//
// Conecta el frontend estático actual (HTML/CSS/JS vanilla) con Supabase,
// manteniendo el CONTRATO EXACTO de datos que esperan los módulos existentes
// (js/utils.js, productos.js, producto-detalle.js, hero-slider.js, etc.).
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
// Si Supabase está caído, no hace nada (el fallback JSON sigue intacto).
// ---------------------------------------------------------------------------
const INTERVALO_REFRESCO_CATALOGO = 30_000;
const suscriptoresCatalogo = new Set();

export function invalidarCacheProductos() {
    cacheMemoria.delete('productos');
}

// Firma compacta: resume lo que las páginas muestran. Cambia solo si cambió
// algo visible en pantalla (stock, precios, imagen/galería, destacado).
function firmaProducto(p) {
    return [p.id, p.stock, p.precio, p.precioAnterior, p.imagen, (p.galeria || []).join(','), p.destacado ? 1 : 0].join('|');
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
// Si solo hay external_url (migración desde Drive), la devuelve tal cual.
export function urlImagen({ storage_path = null, external_url = null } = {}) {
    if (storage_path) {
        const [bucket, ...resto] = String(storage_path).split('/');
        if (cliente && resto.length > 0) {
            const { data } = cliente.storage.from(bucket).getPublicUrl(resto.join('/'));
            if (data && data.publicUrl) return data.publicUrl;
        }
        return storage_path; // último recurso (debería estar correcto ya)
    }
    return String(external_url || '');
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
                id, nombre, descripcion, descripcion_detallada, precio, precio_anterior,
                stock, caracteristicas, activo, destacado,
                categoria:categories(id, name),
                opciones:product_options(id, opcion, position, valores:product_option_values(id, valor, position)),
                imagenes:product_images(id, storage_path, external_url, es_principal, position)
            `)
            .eq('activo', true)
            .order('id', { ascending: true });

        if (error) throw error;

        const productos = (filas || []).map(mapaProducto);
        cachear('productos', productos);
        return { ok: true, datos: podarFavoritosInvalidos(productos) };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar productos, usando fallback JSON.', error);
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

    const opciones = Array.isArray(p.opciones) ? p.opciones : [];
    const variantes = opciones.length > 0
        ? opciones.map(o => ({
            opcion: o.opcion,
            valores: (Array.isArray(o.valores) ? o.valores : []).map(v => v.valor)
        }))
        : null;

    const imagenUrl = principal ? urlImagen(principal) : '';
    const galeriaUrls = galeria.map(urlImagen).filter(Boolean);

    return {
        id: Number(p.id),
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        descripcionDetallada: p.descripcion_detallada || '',
        precio: Number(p.precio),
        precioAnterior: p.precio_anterior != null ? Number(p.precio_anterior) : null,
        // Sin categoría (o con nombre vacío) → etiqueta explícita, nunca ''.
        categoria: p.categoria?.name?.trim() || CATEGORIA_SIN_ASIGNAR,
        variantes,
        stock: Number(p.stock),
        caracteristicas: Array.isArray(p.caracteristicas) ? p.caracteristicas : [],
        destacado: Boolean(p.destacado),
        carpetaImagenes: '', // ya no aplica: el Storage maneja las rutas
        imagen: imagenUrl || '',
        galeria: galeriaUrls.length > 0 ? galeriaUrls : (imagenUrl ? [imagenUrl] : [])
    };
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
        console.warn('⚠️ Supabase: no se pudieron cargar cupones, usando fallback JSON.', error);
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
            .select('id, nombre, valoracion, resena, fecha, storage_path, external_url, red')
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
        console.warn('⚠️ Supabase: no se pudieron cargar reseñas, usando fallback JSON.', error);
        return { ok: false, error };
    }
}

// ============================================================================
// SLIDER (hero)
// ============================================================================
export async function cargarSlider() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('slider');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        // `select('*')` en vez de columnas fijas: la columna `mostrar_en`
        // (migración 0019: mostrar slide en móvil/desktop/ambos) puede no
        // existir todavía; con una lista fija el query fallaría y toda la
        // portada volvería al JSON local. Con '*' las columnas ausentes
        // simplemente no llegan y `mostrarEn` queda en 'ambos'.
        const { data, error } = await sb
            .from('sliders')
            .select('*')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const slides = (data || []).map(s => ({
            titulo: s.titulo || '',
            textoSoporte: s.texto_soporte || '',
            imagen: urlImagen(s) || '',
            link: s.link || '',
            target: s.target === 'externo' ? 'externo' : 'interno',
            mostrarEn: s.mostrar_en || 'ambos'
        }));

        cachear('slider', slides);
        return { ok: true, datos: slides };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudo cargar el slider, usando fallback JSON.', error);
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
            .select('id, imagen_path, imagen_url, logo_path, logo_url, badge, titulo, boton, link, target, en_carrito')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const banners = (data || []).map(b => ({
            imagen: urlImagen({ storage_path: b.imagen_path, external_url: b.imagen_url }) || '',
            logo: urlImagen({ storage_path: b.logo_path, external_url: b.logo_url }),
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
        console.warn('⚠️ Supabase: no se pudieron cargar banners, usando fallback JSON.', error);
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
            .select('id, titulo, descripcion, storage_path, external_url, icono')
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
        console.warn('⚠️ Supabase: no se pudieron cargar los iconos del pie, usando fallback JSON.', error);
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