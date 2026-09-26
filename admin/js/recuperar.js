// recuperar.js — Completa el flujo de recuperación de contraseña.
// El enlace del correo llega a recuperar.html con #access_token + #refresh_token
// (tipo recovery). Seteamos la sesión y permitimos actualizar la contraseña.

import { clienteAdmin } from './admin-supabase.js';

const errorBox = document.getElementById('recuperarError');
const submitBtn = document.querySelector('#recuperarForm button[type="submit"]');
const passwordInput = document.getElementById('newPassword');
const confirmInput = document.getElementById('confirmPassword');

function mostrarError(mensaje) {
    errorBox.textContent = mensaje;
    errorBox.hidden = false;
}

function ocultarError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
}

async function iniciar() {
    try {
        const sb = await clienteAdmin();

        // Los parámetros de recovery llegan en el hash de la URL.
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        const tipo = hash.get('type');

        if (accessToken && refreshToken) {
            const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (error) throw new Error('El enlace de recuperación no es válido o expiró.');
            if (tipo === 'recovery') {
                // Limpiar el hash para que no queden credenciales en la URL.
                history.replaceState(null, '', window.location.pathname);
            }
        } else {
            const { data } = await sb.auth.getSession();
            if (!data.session) {
                window.location.href = '/admin/login';
                return;
            }
        }
    } catch (error) {
        mostrarError(error.message || 'No se pudo validar el enlace.');
        return;
    }
}

await iniciar();

document.getElementById('recuperarForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    ocultarError();

    const password = passwordInput.value;
    const confirmacion = confirmInput.value;

    if (password.length < 6) {
        mostrarError('La contraseña debe tener al menos 6 caracteres.');
        return;
    }
    if (password !== confirmacion) {
        mostrarError('Las contraseñas no coinciden.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';

    try {
        const sb = await clienteAdmin();
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;

        // Cerrar sesión restante y volver al login con mensaje.
        await sb.auth.signOut();
        window.location.href = '/admin/login';
    } catch (error) {
        mostrarError(error.message || 'No se pudo actualizar la contraseña.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar nueva contraseña';
    }
});