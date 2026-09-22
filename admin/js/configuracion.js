// configuracion.js — Configuración global de la tienda (tabla settings, fila única).

import { $, esc, toast, conCarga, estadoCargando } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('settings').select('*').eq('id', 1).single();
    if (error) throw error;
    const s = data;

    contenedor.innerHTML = `
        <div class="admin-card">
            <h2>Datos generales</h2>
            <p class="card-sub">Identidad y contacto de la tienda</p>
            <form class="admin-form" id="configFormGeneral">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgSiteName">Nombre de la tienda</label>
                        <input type="text" id="cfgSiteName" value="${esc(s.site_name || '')}">
                        <span class="hint">Se muestra en el footer y metas.</span>
                    </div>
                    <div class="admin-field">
                        <label for="cfgEmail">Correo de contacto</label>
                        <input type="email" id="cfgEmail" value="${esc(s.email_contact || '')}">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgAddress">Dirección / Zona</label>
                        <input type="text" id="cfgAddress" value="${esc(s.address || '')}" placeholder="ej: Ciudad de Córdoba, Argentina">
                    </div>
                    <div class="admin-field full">
                        <label>Redes sociales del header</label>
                        <span class="hint">Se muestran en la barra superior del header. Dejá vacía la que no uses.</span>
                    </div>
                    <div class="admin-field">
                        <label for="cfgInstagram">Instagram</label>
                        <input type="url" id="cfgInstagram" value="${esc(s.social_instagram || '')}" placeholder="https://instagram.com/tucuenta">
                    </div>
                    <div class="admin-field">
                        <label for="cfgFacebook">Facebook</label>
                        <input type="url" id="cfgFacebook" value="${esc(s.social_facebook || '')}" placeholder="https://facebook.com/tucuenta">
                    </div>
                    <div class="admin-field">
                        <label for="cfgTiktok">TikTok</label>
                        <input type="url" id="cfgTiktok" value="${esc(s.social_tiktok || '')}" placeholder="https://tiktok.com/@tucuenta">
                    </div>
                    <div class="admin-field">
                        <label for="cfgYoutube">YouTube</label>
                        <input type="url" id="cfgYoutube" value="${esc(s.social_youtube || '')}" placeholder="https://youtube.com/@tucanal">
                    </div>
                    <div class="admin-field">
                        <label for="cfgX">X (Twitter)</label>
                        <input type="url" id="cfgX" value="${esc(s.social_x || '')}" placeholder="https://x.com/tucuenta">
                    </div>
                    <div class="admin-field">
                        <label for="cfgPinterest">Pinterest</label>
                        <input type="url" id="cfgPinterest" value="${esc(s.social_pinterest || '')}" placeholder="https://pinterest.com/tucuenta">
                    </div>
                    <div class="admin-field">
                        <label for="cfgLinkedin">LinkedIn</label>
                        <input type="url" id="cfgLinkedin" value="${esc(s.social_linkedin || '')}" placeholder="https://linkedin.com/in/tucuenta">
                    </div>
                    <div class="admin-field">
                        <label for="cfgWhatsappRed">WhatsApp</label>
                        <input type="url" id="cfgWhatsappRed" value="${esc(s.social_whatsapp || '')}" placeholder="https://wa.me/54XXXXXXXXXX">
                    </div>
                    <div class="admin-field">
                        <label for="cfgOtra">Otra</label>
                        <input type="url" id="cfgOtra" value="${esc(s.social_otra || '')}" placeholder="https://tu-sitio-o-red.com">
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>WhatsApp y descuentos</h2>
            <p class="card-sub">El checkout usa WhatsApp; los descuentos se recalculan en el servidor con estos valores.</p>
            <form class="admin-form" id="configFormComercio">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgWhatsapp">Número de WhatsApp (código país + número)</label>
                        <input type="text" id="cfgWhatsapp" value="${esc(s.whatsapp_number || '')}" placeholder="ej: 543515957014">
                    </div>
                    <div class="admin-field">
                        <label for="cfgWhatsappMsg">Mensaje por defecto</label>
                        <input type="text" id="cfgWhatsappMsg" value="${esc(s.whatsapp_default_message || '')}">
                    </div>
                    <div class="admin-field">
                        <label for="cfgUmbral">Umbral para descuento automático ($)</label>
                        <input type="number" id="cfgUmbral" min="0" step="1000" value="${esc(s.discount_threshold || '')}">
                        <span class="hint">Compras desde este monto obtienen descuento.</span>
                    </div>
                    <div class="admin-field">
                        <label for="cfgPorcentaje">Porcentaje de descuento automático (%)</label>
                        <input type="number" id="cfgPorcentaje" min="1" max="100" step="1" value="${esc(s.discount_percent || '')}">
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>Datos para la transferencia (gracias.html)</h2>
            <p class="card-sub">Se muestran al cliente después de confirmar el pedido.</p>
            <form class="admin-form" id="configFormTransferencia">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgAlias">Alias CBU</label>
                        <input type="text" id="cfgAlias" value="${esc(s.transfer_alias || '')}" placeholder="ej: hola.mundo.2023">
                    </div>
                    <div class="admin-field">
                        <label for="cfgEntidad">Entidad bancaria</label>
                        <input type="text" id="cfgEntidad" value="${esc(s.transfer_entity || '')}" placeholder="ej: Mercado Pago">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgTitular">Titular</label>
                        <input type="text" id="cfgTitular" value="${esc(s.transfer_holder || '')}" placeholder="Nombre y apellido del titular">
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>
    `;

    const campos = () => ({
        site_name: $('#cfgSiteName').value.trim(),
        email_contact: $('#cfgEmail').value.trim(),
        address: $('#cfgAddress').value.trim(),
        social_facebook: $('#cfgFacebook').value.trim(),
        social_instagram: $('#cfgInstagram').value.trim(),
        social_tiktok: $('#cfgTiktok').value.trim(),
        social_youtube: $('#cfgYoutube').value.trim(),
        social_x: $('#cfgX').value.trim(),
        social_pinterest: $('#cfgPinterest').value.trim(),
        social_linkedin: $('#cfgLinkedin').value.trim(),
        social_whatsapp: $('#cfgWhatsappRed').value.trim(),
        social_otra: $('#cfgOtra').value.trim(),
        whatsapp_number: $('#cfgWhatsapp').value.trim(),
        whatsapp_default_message: $('#cfgWhatsappMsg').value.trim(),
        discount_threshold: parseFloat($('#cfgUmbral').value) || 0,
        discount_percent: parseFloat($('#cfgPorcentaje').value) || 0,
        transfer_alias: $('#cfgAlias').value.trim(),
        transfer_entity: $('#cfgEntidad').value.trim(),
        transfer_holder: $('#cfgTitular').value.trim()
    });

    const vincular = (formId) => {
        $(formId).addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitBtn = event.submitter || $(formId).querySelector('[type="submit"]');
            conCarga(submitBtn, guardarConfig(campos()))
                .then(() => toast('Configuración guardada.'))
                .catch((error) => toast(error.message, 'error'));
        });
    };

    vincular('#configFormGeneral');
    vincular('#configFormComercio');
    vincular('#configFormTransferencia');
}

async function guardarConfig(payload) {
    const sb = await clienteAdmin();
    const { error } = await sb.from('settings').update(payload).eq('id', 1);
    if (error) throw new Error(error.message);
}