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
export function confirmarBorrado(mensaje) {
    return window.confirm(mensaje || '¿Eliminar este elemento? Esta acción no se puede deshacer.');
}

// ---------- URL pública de una imagen ----------
// storage_path usa la convención "<bucket>/<ruta>"; external_url se usa tal cual.
export function urlPublica(src) {
    if (!src) return '';
    if (/^https?:\/\//i.test(String(src))) return String(src);
    const [bucket, ...resto] = String(src).split('/');
    if (!SUPABASE_CONFIG.url || resto.length === 0) return String(src);
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

// Valida tipo y tamaño. Si es posible, reescala a máx 1920px y convierte a WebP.
export async function validarYOptimizarImagen(archivo) {
    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
        throw new Error('Formato no permitido. Usá JPG, PNG o WebP.');
    }
    if (archivo.size > MAX_TAMANO_IMAGEN) {
        throw new Error('La imagen supera el máximo de 8 MB.');
    }

    try {
        const bitmap = await createImageBitmap(archivo);
        const maxLado = 1920;
        const escala = Math.min(1, maxLado / bitmap.width, maxLado / bitmap.height);
        if (escala >= 1) {
            bitmap.close();
            return archivo;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * escala));
        canvas.height = Math.max(1, Math.round(bitmap.height * escala));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.82));
        if (blob) {
            return new File([blob], archivo.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
        }
        return archivo;
    } catch {
        return archivo; // createImageBitmap no disponible: se sube el original validado
    }
}

function extensionDe(archivo) {
    const tipo = archivo.type;
    if (tipo === 'image/jpeg') return 'jpg';
    if (tipo === 'image/png') return 'png';
    return 'webp';
}

// Sube la imagen a Storage y devuelve el storage_path "<bucket>/<ruta>".
export async function subirImagenAdmin(bucket, carpeta, archivo) {
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
    if (overlay) overlay.remove();
    document.body.classList.remove('admin-modal-abierto');
}