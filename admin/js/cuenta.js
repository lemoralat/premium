// cuenta.js — Mi cuenta: datos del perfil, cambio de contraseña y cierre de sesión.

import { $, esc, toast, conCarga, estadoCargando } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { cerrarSesionAdmin } from './auth.js';

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        window.location.href = '/admin/login.html';
        return;
    }

    const email = session.user.email || '';
    const perfil = await (async () => {
        const { data } = await sb.from('profiles').select('full_name').eq('id', session.user.id).single();
        return data || null;
    })();

    contenedor.innerHTML = `
        <div class="admin-card">
            <h2>Tu cuenta de administrador</h2>
            <p class="card-sub">Acceso con Supabase Auth (correo + contraseña)</p>
            <div class="admin-form-grid">
                <div class="admin-field">
                    <label>Correo electrónico</label>
                    <input type="text" value="${esc(email)}" disabled>
                </div>
                <div class="admin-field">
                    <label>Nombre (opcional)</label>
                    <input type="text" id="ctaNombre" data-cambios value="${esc(perfil?.full_name || '')}" placeholder="Tu nombre">
                </div>
                <div class="admin-field">
                    <label>Rol</label>
                    <input type="text" value="Administrador" disabled>
                </div>
                <div class="admin-field" style="justify-content:flex-end;">
                    <button type="button" class="btn btn-primary" id="btnGuardarNombre">
                        <i class="fa-solid fa-floppy-disk"></i> Guardar nombre
                    </button>
                </div>
            </div>
        </div>

        <div class="admin-card">
            <h2>Cambiar contraseña</h2>
            <p class="card-sub">La contraseña se usa para entrar al panel.</p>
            <form class="admin-form" id="cambiarPassForm" style="max-width:460px;">
                <div class="admin-field">
                    <label for="ctaPassActual">Contraseña actual</label>
                    <input type="password" id="ctaPassActual" autocomplete="current-password" required minlength="6">
                </div>
                <div class="admin-field">
                    <label for="ctaPassNueva">Contraseña nueva</label>
                    <input type="password" id="ctaPassNueva" autocomplete="new-password" required minlength="6">
                </div>
                <div class="admin-field">
                    <label for="ctaPassRepetir">Repetir contraseña nueva</label>
                    <input type="password" id="ctaPassRepetir" autocomplete="new-password" required minlength="6">
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Actualizar contraseña</button>
                </div>
            </form>
        </div>

        <div class="admin-card" style="border-color:#fecaca;">
            <h2 style="color:var(--danger);">Zona de riesgo</h2>
            <p class="card-sub">Cerrá tu sesión cuando termines de trabajar en el panel.</p>
            <button type="button" class="btn btn-danger" id="btnCerrarSesion">
                <i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión
            </button>
        </div>
    `;

    $('#btnGuardarNombre').addEventListener('click', async () => {
        const fullName = $('#ctaNombre').value.trim();
        try {
            const sb = await clienteAdmin();
            const { error } = await sb.from('profiles').update({ full_name: fullName }).eq('id', session.user.id);
            if (error) throw error;
            toast('Nombre actualizado.');
        } catch (error) {
            toast(error.message, 'error');
        }
    });

    $('#cambiarPassForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter;
        const actual = $('#ctaPassActual').value;
        const nueva = $('#ctaPassNueva').value;
        const repetir = $('#ctaPassRepetir').value;

        if (nueva !== repetir) {
            toast('Las contraseñas nuevas no coinciden.', 'error');
            return;
        }
        if (nueva.length < 6) {
            toast('La contraseña nueva debe tener al menos 6 caracteres.', 'error');
            return;
        }

        conCarga(submitBtn, cambiarPassword(actual, nueva))
            .then(() => {
                $('#cambiarPassForm').reset();
                toast('Contraseña actualizada correctamente.');
            })
            .catch((error) => toast(error.message, 'error'));
    });

    $('#btnCerrarSesion').addEventListener('click', () => cerrarSesionAdmin());
}

async function cambiarPassword(actual, nueva) {
    try {
        const sb = await clienteAdmin();
        // Verificar la contraseña actual re-autenticando.
        const { data: { user } } = await sb.auth.getUser();
        const email = user?.email;
        if (!email) throw new Error('No se pudo verificar tu sesión.');

        const { error: signError } = await sb.auth.signInWithPassword({ email, password: actual });
        if (signError) throw new Error('La contraseña actual es incorrecta.');

        const { error: updateError } = await sb.auth.updateUser({ password: nueva });
        if (updateError) throw updateError;
    } catch (error) {
        throw new Error(error.message || 'No se pudo cambiar la contraseña.');
    }
}