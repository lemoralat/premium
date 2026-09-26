// configuracion.js — Configuración global de la tienda (tabla settings, fila única).

import { $, esc, toast, conCarga, estadoCargando } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { renderizarGestor as renderizarGestorPreguntas } from './preguntas-frecuentes.js';
import { exportarProductosCSV, exportarPedidosCSV, descargarCSV } from './exportar-datos.js';

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
                    <div class="admin-field full">
                        <label for="cfgSiteDescription">Descripción del negocio</label>
                        <textarea id="cfgSiteDescription" rows="3" maxlength="160" placeholder="Ej: Venta de productos por encargo, con envíos a todo el país.">${esc(s.site_description ?? '')}</textarea>
                        <span class="hint">Es el meta description del sitio: el texto que muestran Google y los previews al compartir un link. Google corta alrededor de los 160 caracteres, así que conviene que la idea entre ahí. Vacío = se conserva el texto genérico.</span>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>WhatsApp</h2>
            <p class="card-sub">Canal de contacto y de checkout. El número es el destinatario de todos los enlaces de WhatsApp de la tienda; sin número no se muestra ninguno.</p>
            <form class="admin-form" id="configFormWhatsapp">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgWhatsapp">Número de WhatsApp (código país + número)</label>
                        <input type="text" id="cfgWhatsapp" value="${esc(s.whatsapp_number || '')}" placeholder="ej: 5491122334455">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgWhatsappMsg">Mensaje por defecto</label>
                        <input type="text" id="cfgWhatsappMsg" value="${esc(s.whatsapp_default_message || '')}" placeholder="Hola, quería consultar ">
                        <span class="hint">Se precompleta en el botón flotante, en el header y en el pie de página. Ojo: el formulario de contacto y el pedido arman su propio mensaje, así que este texto no aparece ahí.</span>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>Redes sociales</h2>
            <p class="card-sub">Se muestran en la barra superior del header. Dejá vacía la que no uses.</p>
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
                        <input type="text" id="cfgAlias" value="${esc(s.transfer_alias || '')}" placeholder="ej: mi.alias.o.cbu">
                    </div>
                    <div class="admin-field">
                        <label for="cfgEntidad">Entidad bancaria</label>
                        <input type="text" id="cfgEntidad" value="${esc(s.transfer_entity || '')}" placeholder="ej: Banco de ejemplo">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgTitular">Titular</label>
                        <input type="text" id="cfgTitular" value="${esc(s.transfer_holder || '')}" placeholder="Nombre y apellido del titular">
                        <span class="hint">Si el Alias CBU queda vacío, la página de agradecimiento oculta el bloque de transferencia: sirve para cobrar por otro medio.</span>
                    </div>
                    <div class="admin-field full">
                        <label for="cfgGraciasTitulo">Título del cuadro de próximos pasos</label>
                        <input type="text" id="cfgGraciasTitulo" value="${esc(s.gracias_titulo ?? '')}" placeholder="Próximos Pasos">
                        <span class="hint">Título del cuadro informativo de gracias.html. Vacío = sin título.</span>
                    </div>
                    <div class="admin-field full">
                        <label for="cfgGraciasTexto">Texto del cuadro de próximos pasos</label>
                        <textarea id="cfgGraciasTexto" rows="3" placeholder="Te confirmaremos por WhatsApp cuando recibamos tu transferencia bancaria.">${esc(s.gracias_texto ?? '')}</textarea>
                        <span class="hint">Se admite sólo texto; los saltos de línea se respetan. Vacío = el cuadro no se muestra.</span>
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
                        <input type="text" id="cfgPopupTitulo" value="${esc(s.popup_titulo && s.popup_titulo !== DEFAULT_POPUP.titulo ? s.popup_titulo : '')}" placeholder="${esc(DEFAULT_POPUP.titulo)}">
                    </div>
                    <div class="admin-field">
                        <label for="cfgPopupCta">Texto del botón</label>
                        <input type="text" id="cfgPopupCta" value="${esc(s.popup_cta && s.popup_cta !== DEFAULT_POPUP.cta ? s.popup_cta : '')}" placeholder="${esc(DEFAULT_POPUP.cta)}">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgPopupDescripcion">Descripción</label>
                        <textarea id="cfgPopupDescripcion" rows="3" placeholder="${esc(DEFAULT_POPUP.descripcion)}">${esc(s.popup_descripcion && s.popup_descripcion !== DEFAULT_POPUP.descripcion ? s.popup_descripcion : '')}</textarea>
                    </div>
                    <div class="admin-field full">
                        <label for="cfgPopupCtaUrl">Destino del botón</label>
                        <input type="text" id="cfgPopupCtaUrl" value="${esc(s.popup_cta_url && s.popup_cta_url !== DEFAULT_POPUP.ctaUrl ? s.popup_cta_url : '')}" placeholder="${esc(DEFAULT_POPUP.ctaUrl)}">
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

        <div class="admin-card">
            <h2>Exportar datos</h2>
            <p class="card-sub">Descargá tus datos en CSV (abren directo en Excel y Google Sheets). Cada export baja por separado.</p>
            <div class="admin-form-grid">
                <div class="admin-field">
                    <button type="button" class="btn btn-outline" id="btnExportarProductos">
                        <i class="fa-solid fa-box"></i> Exportar productos (.csv)
                    </button>
                    <span class="hint">Catálogo: precios, stock, categoría, destacado y estado.</span>
                </div>
                <div class="admin-field">
                    <button type="button" class="btn btn-outline" id="btnExportarPedidos">
                        <i class="fa-solid fa-cart-shopping"></i> Exportar pedidos (.csv)
                    </button>
                    <span class="hint">Pedidos con datos del cliente, totales e ítems.</span>
                </div>
            </div>
        </div>
    `;

    const camposGenerales = () => ({
        site_name: $('#cfgSiteName').value.trim(),
        email_contact: $('#cfgEmail').value.trim(),
        address: $('#cfgAddress').value.trim(),
        site_description: $('#cfgSiteDescription').value.trim()
    });

    const camposRedes = () => ({
        social_instagram: $('#cfgInstagram').value.trim(),
        social_facebook: $('#cfgFacebook').value.trim(),
        social_tiktok: $('#cfgTiktok').value.trim(),
        social_youtube: $('#cfgYoutube').value.trim(),
        social_x: $('#cfgX').value.trim(),
        social_pinterest: $('#cfgPinterest').value.trim(),
        social_linkedin: $('#cfgLinkedin').value.trim(),
        social_otra: $('#cfgOtra').value.trim()
    });

    // Su propia ficha, aparte de las redes sociales: el número de WhatsApp es
    // el canal de contacto y de checkout de la tienda, no una red más.
    const camposWhatsapp = () => ({
        whatsapp_number: $('#cfgWhatsapp').value.trim(),
        whatsapp_default_message: $('#cfgWhatsappMsg').value.trim()
    });

    const camposTransferencia = () => ({
        transfer_alias: $('#cfgAlias').value.trim(),
        transfer_entity: $('#cfgEntidad').value.trim(),
        transfer_holder: $('#cfgTitular').value.trim(),
        gracias_titulo: $('#cfgGraciasTitulo').value.trim(),
        gracias_texto: $('#cfgGraciasTexto').value.trim()
    });

    // Columnas de migraciones que todavía pueden no estar aplicadas (0032 y
    // 0033). Un UPDATE con una columna inexistente revienta el guardado ENTERO:
    // sin este filtro, guardar "Datos generales" antes de aplicar 0033 haría
    // fallar también el nombre y el correo, que sí funcionan.
    //
    // Se detectan por la fila leída —si la columna no está, la clave no viene—
    // y se sacan del payload. Mientras falten, el sitio usa el texto por
    // defecto, así que la página sigue bien.
    const columnasOpcionales = [
        {
            columnas: ['gracias_titulo', 'gracias_texto'],
            aviso: 'Falta aplicar la migración 0032: el cuadro de próximos pasos todavía no se puede guardar.'
        },
        {
            columnas: ['site_description'],
            aviso: 'Falta aplicar la migración 0033: la descripción del negocio todavía no se puede guardar.'
        }
    ].map(({ columnas, aviso }) => ({
        aviso,
        // Columnas cuya migración NO está aplicada: si la clave no viene en la
        // fila leída, es que la columna todavía no existe en la base.
        ausentes: columnas.filter((c) => s[c] === undefined)
    }));

    const sinColumnasAusentes = (payload) => {
        const ausentes = columnasOpcionales.flatMap((c) => c.ausentes);
        if (!ausentes.length) return payload;
        const limpio = { ...payload };
        ausentes.forEach((c) => delete limpio[c]);
        return limpio;
    };
    columnasOpcionales.forEach((c) => {
        if (c.ausentes.length) toast(c.aviso, 'error');
    });

    const camposPopup = () => ({
        popup_titulo: $('#cfgPopupTitulo').value.trim() || DEFAULT_POPUP.titulo,
        popup_descripcion: $('#cfgPopupDescripcion').value.trim() || DEFAULT_POPUP.descripcion,
        popup_cta: $('#cfgPopupCta').value.trim() || DEFAULT_POPUP.cta,
        popup_cta_url: $('#cfgPopupCtaUrl').value.trim() || DEFAULT_POPUP.ctaUrl,
        popup_activo: $('#cfgPopupActivo').checked
    });

    // Apariencia del panel (dark mode): se maneja desde el switch del topbar
    // (admin-app.js → settings.admin_tema), ya no desde Configuración.

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

    vincular('#configFormGeneral', () => sinColumnasAusentes(camposGenerales()));
    vincular('#configFormRedes', camposRedes);
    vincular('#configFormWhatsapp', camposWhatsapp);
    vincular('#configFormTransferencia', () => sinColumnasAusentes(camposTransferencia()));
    vincular('#configFormPopup', camposPopup);

    // Exportar datos (CSV): productos y pedidos, cada uno con su archivo.
    // Las exportaciones se lanzan SOLO con el click del botón: se pasa la
    // referencia de la función (sin llamarla) y se ejecuta dentro del handler.
    const exportar = (boton, promesaFn, mensajeVacio, mensajeOk) => {
        boton.addEventListener('click', () => {
            conCarga(boton, promesaFn())
                .then((res) => {
                    if (res.filas === 0) {
                        toast(mensajeVacio);
                        return;
                    }
                    descargarCSV(res);
                    toast(mensajeOk(res.filas));
                })
                .catch((error) => toast(error.message, 'error'));
        });
    };
    exportar(
        $('#btnExportarProductos'),
        exportarProductosCSV,
        'No hay productos para exportar.',
        (n) => `Productos exportados: ${n} filas.`
    );
    exportar(
        $('#btnExportarPedidos'),
        exportarPedidosCSV,
        'No hay pedidos para exportar.',
        (n) => `Pedidos exportados: ${n} filas.`
    );

    // Gestor de preguntas frecuentes (widget que se re-renderiza a sí mismo).
    renderizarGestorPreguntas($('#gestorPreguntasFrecuentes'))
        .catch((error) => toast(error.message, 'error'));
}

async function guardarConfig(payload) {
    const sb = await clienteAdmin();
    const { error } = await sb.from('settings').update(payload).eq('id', 1);
    if (error) throw new Error(error.message);
}