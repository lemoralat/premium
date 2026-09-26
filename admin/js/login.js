// login.js — Inicio de sesión del panel (Supabase Auth, email + contraseña)
// y envío de correo de recuperación de contraseña.

import { clienteAdmin } from './admin-supabase.js';

const emailInput = document.getElementById('loginEmail');
const passwordInput = document.getElementById('loginPassword');
const errorBox = document.getElementById('loginError');
const submitBtn = document.querySelector('#loginForm button[type="submit"]');

function mostrarError(mensaje) {
    errorBox.textContent = mensaje;
    errorBox.hidden = false;
}

// Si la sesión existía pero el usuario no está en la tabla `admins` (o el
// panel está en actualización), el login explica por qué volvió acá.
const params = new URLSearchParams(window.location.search);
if (params.get('denegado') === '1') {
    errorBox.className = '';
    mostrarError('Tu usuario no tiene permisos de administrador. Verificá que esté en la tabla public.admins.');
}

function limpiarError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
}

// Si ya hay una sesión activa, saltar directo al panel.
try {
    const sb = await clienteAdmin();
    const { data } = await sb.auth.getSession();
    if (data.session) {
        window.location.replace('/admin/');
    }
} catch (error) {
    console.error(error);
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    limpiarError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        mostrarError('Completá tu correo y contraseña.');
        return;
    }

    submitBtn.disabled = true;
    const textoOriginal = submitBtn.textContent;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ingresando…';

    try {
        const sb = await clienteAdmin();
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        document.getElementById('loginForm').reset();
        window.location.href = '/admin/';
    } catch (error) {
        mostrarError(mensajeLogin(error));
        submitBtn.disabled = false;
        submitBtn.textContent = textoOriginal;
    }
});

async function enviarRecuperacion() {
    limpiarError();
    const email = emailInput.value.trim();
    if (!email) {
        mostrarError('Escribí el correo con el que iniciaste sesión para enviarte el enlace.');
        return;
    }

    const btn = document.getElementById('btnRecuperar');
    btn.textContent = 'Enviando…';
    btn.style.pointerEvents = 'none';

    try {
        const sb = await clienteAdmin();
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/admin/recuperar`
        });
        if (error) throw error;
        errorBox.className = 'admin-success-text';
        errorBox.textContent = 'Te enviamos un enlace de recuperación por correo.';
        errorBox.hidden = false;
    } catch (error) {
        mostrarError('No pudimos enviar el enlace. Revisá que el correo sea correcto.');
        console.error(error);
    } finally {
        btn.textContent = '¿Olvidaste tu contraseña?';
        btn.style.pointerEvents = 'auto';
    }
}

document.getElementById('btnRecuperar').addEventListener('click', (event) => {
    event.preventDefault();
    enviarRecuperacion();
});

function mensajeLogin(error) {
    const mensaje = String(error?.message || '');
    if (/invalid login credentials/i.test(mensaje)) {
        return 'Correo o contraseña incorrectos.';
    }
    if (/email not confirmed/i.test(mensaje)) {
        return 'Tu correo todavía no fue confirmado. Revisá tu bandeja de entrada.';
    }
    if (/rate limit/i.test(mensaje)) {
        return 'Demasiados intentos. Esperá unos minutos y volvé a intentar.';
    }
    return mensaje || 'No se pudo iniciar sesión. Intentá de nuevo.';
}