// configuracion.js — Configuración global de la tienda (tabla settings, fila única).

import { $, esc, toast, conCarga, estadoCargando } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { renderizarGestor as renderizarGestorPreguntas } from './preguntas-frecuentes.js';

// Defaults del popup de salida (replican el contenido que la tienda mostraba
// antes de que fuese configurable). Se usan si la columna aún no existe (la
// migración 0013 todavía no aplicada) o si el admin la deja vacía.
const DEFAULT_POPUP = {
    titulo: '¿Te vas tan pronto?',
    descripcion: 'Antes de irte: envíos a todo el país y ofertas en la tienda. ¿Quieres echar un vistazo?',
    cta: 'Ver productos',
    ctaUrl: 'index.html#tienda',
    activo: true
};

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
                        <label for="cfgAddress">Ubicación del negocio</label>
                        <input type="text" id="cfgAddress" value="${esc(s.address || '')}" placeholder="Dirección como texto o URL de Google Maps">
                        <span class="hint">¿Tu negocio tiene una ubicación física? Indicá la dirección o agregá la URL de Google Maps.</span>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>Redes y WhatsApp</h2>
            <p class="card-sub">Redes sociales que se muestran en la barra superior del header (dejá vacía la que no uses) y canal de WhatsApp para contacto y checkout (número + mensaje).</p>
            <form class="admin-form" id="configFormRedes">
                <div class="admin-form-grid">
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
                        <label for="cfgOtra">Otra</label>
                        <input type="url" id="cfgOtra" value="${esc(s.social_otra || '')}" placeholder="https://tu-sitio-o-red.com">
                    </div>
                    <div class="admin-field">
                        <label for="cfgWhatsapp">Número de WhatsApp (código país + número)</label>
                        <input type="text" id="cfgWhatsapp" value="${esc(s.whatsapp_number || '')}" placeholder="ej: 543515957014">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgWhatsappMsg">Mensaje por defecto</label>
                        <input type="text" id="cfgWhatsappMsg" value="${esc(s.whatsapp_default_message || '')}">
                        <span class="hint">Se precompleta en el enlace de WhatsApp de contacto y de cada pedido.</span>
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

        <div class="admin-card">
            <h2>Popup de salida</h2>
            <p class="card-sub">Ventana que aparece al intentar abandonar la tienda. Se puede personalizar o desactivar.</p>
            <form class="admin-form" id="configFormPopup">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgPopupTitulo">Título</label>
                        <input type="text" id="cfgPopupTitulo" value="${esc(s.popup_titulo ?? DEFAULT_POPUP.titulo)}">
                    </div>
                    <div class="admin-field">
                        <label for="cfgPopupCta">Texto del botón</label>
                        <input type="text" id="cfgPopupCta" value="${esc(s.popup_cta ?? DEFAULT_POPUP.cta)}">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgPopupDescripcion">Descripción</label>
                        <textarea id="cfgPopupDescripcion" rows="3">${esc(s.popup_descripcion ?? DEFAULT_POPUP.descripcion)}</textarea>
                    </div>
                    <div class="admin-field full">
                        <label for="cfgPopupCtaUrl">Destino del botón</label>
                        <input type="text" id="cfgPopupCtaUrl" value="${esc(s.popup_cta_url ?? DEFAULT_POPUP.ctaUrl)}" placeholder="ej: index.html#tienda o https://…">
                        <span class="hint">Página interna (ej. index.html#tienda) o URL externa completa.</span>
                    </div>
                    <div class="admin-field full">
                        <label class="admin-check">
                            <input type="checkbox" id="cfgPopupActivo" ${s.popup_activo === false ? '' : 'checked'}>
                            Popup activo (se muestra al intentar salir de la tienda)
                        </label>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>Preguntas frecuentes</h2>
            <p class="card-sub">Preguntas y respuestas que se muestran en la página de ayuda (faq.html). Mientras no haya preguntas activas, la tienda mantiene el contenido estático actual.</p>
            <div id="gestorPreguntasFrecuentes"></div>
        </div>
    `;

    const camposGenerales = () => ({
        site_name: $('#cfgSiteName').value.trim(),
        email_contact: $('#cfgEmail').value.trim(),
        address: $('#cfgAddress').value.trim()
    });

    const camposRedes = () => ({
        social_instagram: $('#cfgInstagram').value.trim(),
        social_facebook: $('#cfgFacebook').value.trim(),
        social_tiktok: $('#cfgTiktok').value.trim(),
        social_youtube: $('#cfgYoutube').value.trim(),
        social_x: $('#cfgX').value.trim(),
        social_pinterest: $('#cfgPinterest').value.trim(),
        social_linkedin: $('#cfgLinkedin').value.trim(),
        social_otra: $('#cfgOtra').value.trim(),
        whatsapp_number: $('#cfgWhatsapp').value.trim(),
        whatsapp_default_message: $('#cfgWhatsappMsg').value.trim()
    });

    const camposTransferencia = () => ({
        transfer_alias: $('#cfgAlias').value.trim(),
        transfer_entity: $('#cfgEntidad').value.trim(),
        transfer_holder: $('#cfgTitular').value.trim()
    });

    const camposPopup = () => ({
        popup_titulo: $('#cfgPopupTitulo').value.trim() || DEFAULT_POPUP.titulo,
        popup_descripcion: $('#cfgPopupDescripcion').value.trim() || DEFAULT_POPUP.descripcion,
        popup_cta: $('#cfgPopupCta').value.trim() || DEFAULT_POPUP.cta,
        popup_cta_url: $('#cfgPopupCtaUrl').value.trim() || DEFAULT_POPUP.ctaUrl,
        popup_activo: $('#cfgPopupActivo').checked
    });

    const vincular = (formId, obtenerCampos) => {
        $(formId).addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitBtn = event.submitter || $(formId).querySelector('[type="submit"]');
            const payload = obtenerCampos();
            conCarga(submitBtn, guardarConfig(payload))
                .then(() => toast('Configuración guardada.'))
                .catch((error) => toast(error.message, 'error'));
        });
    };

    vincular('#configFormGeneral', camposGenerales);
    vincular('#configFormRedes', camposRedes);
    vincular('#configFormTransferencia', camposTransferencia);
    vincular('#configFormPopup', camposPopup);

    // Gestor de preguntas frecuentes (widget que se re-renderiza a sí mismo).
    renderizarGestorPreguntas($('#gestorPreguntasFrecuentes'))
        .catch((error) => toast(error.message, 'error'));
}

async function guardarConfig(payload) {
    const sb = await clienteAdmin();
    const { error } = await sb.from('settings').update(payload).eq('id', 1);
    if (error) throw new Error(error.message);
}