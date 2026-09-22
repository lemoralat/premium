// ============================================================================
// auth.js — Sesión y protección del dashboard (Supabase Auth).
// ============================================================================

import { clienteAdmin } from './admin-supabase.js';

// Devuelve la sesión activa o null.
export async function sesionActual() {
    try {
        const sb = await clienteAdmin();
        const { data } = await sb.auth.getSession();
        return data?.session || null;
    } catch (error) {
        console.error('No se pudo obtener la sesión:', error);
        return null;
    }
}

// Redirige a login.html si no hay sesión activa o el usuario no es admin.
// Devuelve la sesión si existe Y el usuario está en `public.admins`.
// (La verificación real la hace la BD vía las policies; esto es solo UX.)
export async function protegerAdmin() {
    const sesion = await sesionActual();
    if (!sesion) {
        window.location.href = 'login.html';
        return null;
    }
    try {
        const sb = await clienteAdmin();
        const { data, error } = await sb.rpc('es_admin');
        if (error || !data) {
            await sb.auth.signOut().catch(() => {});
            window.location.href = 'login.html?denegado=1';
            return null;
        }
    } catch (e) {
        console.error('No se pudo verificar el rol de administrador:', e);
        window.location.href = 'login.html?denegado=1';
        return null;
    }
    return sesion;
}

// Cierra la sesión y vuelve a login.html.
export async function cerrarSesionAdmin() {
    try {
        const sb = await clienteAdmin();
        await sb.auth.signOut();
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    } finally {
        window.location.href = 'login.html';
    }
}