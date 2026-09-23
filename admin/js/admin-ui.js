// ============================================================================
// admin-ui.js — Helpers reutilizables del dashboard.
// ============================================================================

import { clienteAdmin } from './admin-supabase.js';
import { SUPABASE_CONFIG } from '../../js/env.generated.js';

// ---------- Selectores / DOM ----------
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ---------- Escapado (XSS) ----------
export function esc(texto) {
    return String(texto ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// Placeholder visual para previews del dashboard cuando todavía no hay imagen.
export function placeholderImagen(variante = '', etiqueta = 'Sin imagen') {
    const clases = ['admin-image-placeholder', variante].filter(Boolean).join(' ');
    return `<span class="${esc(clases)}" role="img" aria-label="${esc(etiqueta)}"><i class="fa-regular fa-image" aria-hidden="true"></i></span>`;
}

// Reemplaza un placeholder por la imagen elegida por el usuario.
export function mostrarPreviewImagen(elemento, url, alt = '') {
    if (!elemento) return;
    elemento.innerHTML = `<img class="admin-preview-image" src="${esc(url)}" alt="${esc(alt)}">`;
}

// ---------- Formato ----------
export function formatearPrecio(precio) {
    const n = Number(precio || 0);
    return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatearFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatearFechaHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fechaInput(iso) {
    // YYYY-MM-DD para <input type="date">
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toISOString().slice(0, 10);
}

// ---------- Toasts ----------
export function toast(mensaje, tipo = 'success') {
    const caja = document.getElementById('adminToast');
    if (!caja) { console.log(mensaje); return; }
    const div = document.createElement('div');
    div.className = `admin-toast-item ${tipo === 'error' ? 'error' : ''}`;
    div.textContent = mensaje;
    caja.appendChild(div);
    setTimeout(() => {
        div.classList.add('salida');
        setTimeout(() => div.remove(), 250);
    }, 3200);
}

// ---------- Confirmación de borrado ----------
// Diálogo de confirmación con UI propia del panel (sin ventanas nativas).
// Abre un modal con los mismos estilos que el resto del dashboard y devuelve
// Promise<boolean>: true con el botón de acción, false con Cancelar / ✕ /
// clic fuera / Escape.
export function confirmarDialogo(opciones) {
    const {
        titulo = '¿Confirmar acción?',
        mensaje = '',
        textoConfirmar = 'Confirmar',
        textoCancelar = 'Cancelar',
        peligro = false
    } = opciones || {};

    return new Promise((resolve) => {
        const existente = $('#adminModal');
        if (existente) existente.remove();

        let resuelto = false;
        const onKey = (e) => { if (e.key === 'Escape') terminar(false); };
        const terminar = (valor) => {
            if (resuelto) return;
            resuelto = true;
            document.removeEventListener('keydown', onKey);
            cerrarModal(); // salida animada del modal
            resolve(valor);
        };

        const overlay = document.createElement('div');
        overlay.id = 'adminModal';
        overlay.className = 'admin-modal';
        overlay.innerHTML = `
            <div class="admin-modal-backdrop" data-cerrar-confirm></div>
            <div class="admin-modal-panel admin-confirm-panel">
                <button type="button" class="admin-modal-close" data-cerrar-confirm aria-label="Cerrar">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <h2>${esc(titulo)}</h2>
                ${mensaje ? `<p class="admin-confirm-mensaje">${esc(mensaje)}</p>` : ''}
                <div class="admin-modal-acciones">
                    <button type="button" class="btn btn-outline" data-confirm-no>${esc(textoCancelar)}</button>
                    <button type="button" class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" data-confirm-si>${esc(textoConfirmar)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('admin-modal-abierto');
        document.addEventListener('keydown', onKey);

        overlay.addEventListener('click', (e) => {
            if (e.target.closest('[data-cerrar-confirm]')) terminar(false);
        });
        overlay.querySelector('[data-confirm-si]').addEventListener('click', () => terminar(true));
        overlay.querySelector('[data-confirm-no]').addEventListener('click', () => terminar(false));
    });
}

export async function confirmarBorrado(mensaje) {
    return confirmarDialogo({
        titulo: 'Confirmar eliminación',
        mensaje: mensaje || '¿Eliminar este elemento? Esta acción no se puede deshacer.',
        textoConfirmar: 'Eliminar',
        peligro: true
    });
}

// ---------- URL pública de una imagen ----------
// storage_path usa la convención "<bucket>/<ruta>"; external_url se usa tal cual.
export function urlPublica(src) {
    if (!src) return '';
    const valor = String(src).trim();
    if (/^(?:https?:|blob:|data:)/i.test(valor)) return valor;
    // Las rutas locales del repositorio no son storage paths de Supabase.
    if (/^(?:\.{0,2}\/|\/)/.test(valor) || valor.startsWith('img/')) return valor;
    const [bucket, ...resto] = valor.split('/');
    if (!SUPABASE_CONFIG.url || resto.length === 0) return valor;
    return `${SUPABASE_CONFIG.url}/storage/v1/object/public/${bucket}/${resto.join('/')}`;
}

// ---------- Estados de carga / vacíos ----------
export function estadoCargando(contenedor, texto = 'Cargando…') {
    contenedor.innerHTML = `<p class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${esc(texto)}</p>`;
}

export function estadoVacio(contenedor, titulo, detalle = '') {
    contenedor.innerHTML = `
        <div class="admin-empty">
            <i class="fa-solid fa-box-open"></i>
            <h3>${esc(titulo)}</h3>
            ${detalle ? `<p>${esc(detalle)}</p>` : ''}
        </div>
    `;
}

// ---------- Botón con estado de carga ----------
export function conCarga(boton, promesa) {
    const textoOriginal = boton.dataset.textoOriginal || boton.textContent;
    boton.dataset.textoOriginal = textoOriginal;
    boton.disabled = true;
    boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando…';
    return promesa
        .then((res) => {
            boton.disabled = false;
            boton.textContent = textoOriginal;
            return res;
        })
        .catch((error) => {
            boton.disabled = false;
            boton.textContent = textoOriginal;
            throw error;
        });
}

// ---------- Imágenes (Subir / validar / optimizar) ----------
export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_TAMANO_IMAGEN = 8 * 1024 * 1024; // 8 MB
export const LIMITES_IMAGEN = Object.freeze({
    producto: 1920,
    slider: 1920,
    bannerFondo: 1920,
    bannerLogo: 1024,
    avatar: 512,
    icono: 1024,
    branding: 1024,
    favicon: 256,
    openGraph: 1024
});

// Valida tipo/tamaño y devuelve siempre un File WebP redimensionado.
export async function validarYOptimizarImagen(archivo, opciones = {}) {
    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
        throw new Error('Formato no permitido. Usá JPG, PNG o WebP.');
    }
    if (archivo.size > MAX_TAMANO_IMAGEN) {
        throw new Error('La imagen supera el máximo de 8 MB.');
    }

    const maxLado = Number(opciones.maxLado || LIMITES_IMAGEN.producto);
    const calidad = Number(opciones.calidad ?? 0.82);
    if (!Number.isFinite(maxLado) || maxLado <= 0) {
        throw new Error('El límite de redimensión no es válido.');
    }
    if (!Number.isFinite(calidad) || calidad <= 0 || calidad > 1) {
        throw new Error('La calidad de imagen no es válida.');
    }

    let bitmap;
    try {
        bitmap = await createImageBitmap(archivo);
        const escala = Math.min(1, maxLado / bitmap.width, maxLado / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * escala));
        canvas.height = Math.max(1, Math.round(bitmap.height * escala));
        const contexto = canvas.getContext('2d');
        if (!contexto) throw new Error('No se pudo crear el contexto de imagen.');
        contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((resultado) => {
                if (resultado) resolve(resultado);
                else reject(new Error('El navegador no pudo generar WebP.'));
            }, 'image/webp', calidad);
        });

        return new File(
            [blob],
            archivo.name.replace(/\.[^.]+$/, '') + '.webp',
            { type: 'image/webp', lastModified: Date.now() }
        );
    } catch (error) {
        console.error('No se pudo optimizar la imagen:', error);
        throw new Error('No se pudo convertir la imagen a WebP. Probá con otro archivo.');
    } finally {
        bitmap?.close?.();
    }
}

function extensionDe(archivo) {
    const tipo = archivo.type;
    if (tipo === 'image/jpeg') return 'jpg';
    if (tipo === 'image/png') return 'png';
    return 'webp';
}

// Sube una imagen WebP ya optimizada a Storage y devuelve "<bucket>/<ruta>".
const BUCKETS_IMAGEN = new Set(['products', 'branding', 'slider', 'banners', 'reviews', 'iconos']);

export async function subirImagenAdmin(bucket, carpeta, archivo) {
    if (!BUCKETS_IMAGEN.has(bucket)) {
        throw new Error(`Bucket de imágenes no permitido: ${bucket}`);
    }
    if (!archivo || archivo.type !== 'image/webp') {
        throw new Error('La imagen debe estar optimizada a WebP antes de subirla.');
    }

    const sb = await clienteAdmin();
    const nombre = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionDe(archivo)}`;
    const path = `${carpeta}/${nombre}`;
    const { error } = await sb.storage.from(bucket).upload(path, archivo, {
        contentType: archivo.type,
        upsert: false
    });
    if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
    return `${bucket}/${path}`; // convención: bucket + ruta
}

// Elimina un objeto del Storage (storage_path "<bucket>/<ruta>").
export async function eliminarImagenAdmin(storagePath) {
    if (!storagePath) return;
    const [bucket, ...resto] = String(storagePath).split('/');
    if (!bucket || resto.length === 0) return;
    const sb = await clienteAdmin();
    const { error } = await sb.storage.from(bucket).remove([resto.join('/')]);
    if (error) console.warn('No se pudo eliminar el archivo de Storage:', error.message);
}

// ---------- Modales ----------
export function abrirModal(html) {
    const existente = $('#adminModal');
    if (existente) existente.remove();

    const overlay = document.createElement('div');
    overlay.id = 'adminModal';
    overlay.className = 'admin-modal';
    overlay.innerHTML = `
        <div class="admin-modal-backdrop" data-cerrar-modal></div>
        <div class="admin-modal-panel">
            <button type="button" class="admin-modal-close" data-cerrar-modal aria-label="Cerrar">
                <i class="fa-solid fa-xmark"></i>
            </button>
            ${html}
        </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add('admin-modal-abierto');

    overlay.addEventListener('click', (e) => {
        if (e.target.closest('[data-cerrar-modal]')) cerrarModal();
    });
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cerrarModal();
    });
    return overlay;
}

export function cerrarModal() {
    const overlay = $('#adminModal');
    if (!overlay) return;
    if (overlay.classList.contains('admin-modal-cerrando')) return;
    // Salida suave: anima y recién después quita el nodo.
    overlay.classList.add('admin-modal-cerrando');
    document.body.classList.remove('admin-modal-abierto');
    setTimeout(() => overlay.remove(), 160);
}