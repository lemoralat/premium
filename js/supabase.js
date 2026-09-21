// ============================================================================
// supabase.js — Capa de datos de la TIENDA PÚBLICA.
//
// Conecta el frontend estático actual (HTML/CSS/JS vanilla) con Supabase,
// manteniendo el CONTRATO EXACTO de datos que esperan los módulos existentes
// (js/utils.js, productos.js, producto-detalle.js, hero-slider.js, etc.).
//
// - Usa SOLO la anon key (pública). Nunca hay service_role en el navegador.
// - Si Supabase no está configurado o falla, devuelve { ok: false } para que
//   utils.js caiga al mecanismo JSON actual (modo dual controlado).
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

// Inicializa el cliente solo si hay configuración (import dinámico del CDN:
// no se descarga el SDK si el proyecto no está configurado todavía).
export function obtenerClienteSupabase() {
    if (supabaseCargado) return Promise.resolve(cliente);
    if (promesaCliente) return promesaCliente;

    if (!SUPABASE_CONFIG || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.publishableKey) {
        supabaseCargado = true;
        return Promise.resolve(null);
    }

    promesaCliente = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
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
// PRODUCTOS
// ============================================================================
export async function cargarProductos() {
    const sb = await obtenerClienteSupabase();
    if (!sb) return { ok: false };

    const cacheado = leerCache('productos');
    if (cacheado) return { ok: true, datos: cacheado };

    try {
        // Un solo query con las relaciones anidadas (categoría, variantes, imágenes)
        const { data: filas, error } = await sb
            .from('products')
            .select(`
                id, nombre, descripcion, descripcion_detallada, precio, precio_anterior,
                stock, caracteristicas, activo,
                categoria:categories(id, name),
                opciones:product_options(id, opcion, position, valores:product_option_values(id, valor, position)),
                imagenes:product_images(id, storage_path, external_url, es_principal, position)
            `)
            .eq('activo', true)
            .order('id', { ascending: true });

        if (error) throw error;

        const productos = (filas || []).map(mapaProducto);
        cachear('productos', productos);
        return { ok: true, datos: productos };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar productos, usando fallback JSON.', error);
        return { ok: false, error };
    }
}

// Fila de "products" (con joins) → objeto con el contrato de js/productos.json
function mapaProducto(p) {
    const imagenes = Array.isArray(p.imagenes) ? p.imagenes : [];
    const principal = imagenes.find(i => i.es_principal) || imagenes[0] || null;
    const galeria = imagenes.filter(i => principal && i.id !== principal.id);

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
        categoria: p.categoria ? p.categoria.name : '',
        variantes,
        stock: Number(p.stock),
        caracteristicas: Array.isArray(p.caracteristicas) ? p.caracteristicas : [],
        carpetaImagenes: '', // ya no aplica: el Storage maneja las rutas
        imagen: imagenUrl || 'img/productos/placeholder.png',
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
            .select('id, nombre, valoracion, resena, fecha, storage_path, external_url')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const resenas = (data || []).map(r => ({
            fecha: fechaLocal(r.fecha),
            nombre: r.nombre,
            valoracion: Number(r.valoracion),
            resena: r.resena || '',
            imagen: urlImagen(r) || ''
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
        const { data, error } = await sb
            .from('sliders')
            .select('id, titulo, texto_soporte, storage_path, external_url, link, target')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const slides = (data || []).map(s => ({
            titulo: s.titulo || '',
            textoSoporte: s.texto_soporte || '',
            imagen: urlImagen(s) || 'img/sliders/slider1.jpg',
            link: s.link || '',
            target: s.target === 'externo' ? 'externo' : 'interno'
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
            .select('id, imagen_path, imagen_url, logo_path, logo_url, badge, titulo, boton, link, target')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const banners = (data || []).map(b => ({
            imagen: urlImagen({ storage_path: b.imagen_path, external_url: b.imagen_url }) || 'img/banners/banner1.jpg',
            logo: urlImagen({ storage_path: b.logo_path, external_url: b.logo_url }),
            badge: b.badge || '',
            titulo: b.titulo || '',
            boton: b.boton || '',
            link: b.link || '',
            target: b.target === 'externo' ? 'externo' : 'interno'
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
            .select('id, titulo, descripcion, storage_path, external_url')
            .eq('activo', true)
            .order('position', { ascending: true });

        if (error) throw error;

        const iconos = (data || []).map(i => ({
            titulo: i.titulo || '',
            descripcion: i.descripcion || '',
            imagen: urlImagen(i) || ''
        }));

        cachear('iconos-pie', iconos);
        return { ok: true, datos: iconos };
    } catch (error) {
        console.warn('⚠️ Supabase: no se pudieron cargar los iconos del pie, usando fallback JSON.', error);
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