// configuracion.js — Configuración global de la tienda (tabla settings, fila única).

import { $, esc, toast, conCarga, estadoCargando, confirmarDialogo } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { renderizarGestor as renderizarGestorPreguntas } from './preguntas-frecuentes.js';
import { exportarProductosCSV, exportarPedidosCSV, descargarCSV } from './exportar-datos.js';

// Defaults del popup de salida (replican el contenido que la tienda mostraba
// antes de que fuese configurable). Se usan si la columna aún no existe (la
// migración 0013 todavía no aplicada) o si el admin la deja vacía. Desde la
// 0055 el popup arranca DESACTIVADO: `activo` solo se enciende explícitamente.
const DEFAULT_POPUP = {
    titulo: '¿Te vas tan pronto?',
    descripcion: 'Antes de irte, descubrí nuestras ofertas y servicios. ¿Querés echar un vistazo?',
    cta: 'Ver productos',
    ctaUrl: '/#tienda',
    activo: false
};

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('settings').select('*').eq('id', 1).single();
    if (error) throw error;
    const s = data;
    // Modo de la tienda: ajusta las etiquetas del panel (Productos → Servicios).
    const esTurnos = s.modo_web === 'turnos';

    contenedor.innerHTML = `
        <div class="admin-card">
            <h2>Datos generales</h2>
            <p class="card-sub">Información básica y datos de contacto de tu negocio</p>
            <form class="admin-form" id="configFormGeneral">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgSiteName">Nombre de la tienda</label>
                        <input type="text" id="cfgSiteName" value="${esc(s.site_name || '')}">
                        <span class="hint">Este nombre se muestra en la parte inferior de tu tienda.</span>
                    </div>
                    <div class="admin-field">
                        <label for="cfgEmail">Correo de contacto</label>
                        <input type="email" id="cfgEmail" value="${esc(s.email_contact || '')}">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgAddress">Ubicación del negocio</label>
                        <input type="text" id="cfgAddress" value="${esc(s.address || '')}" placeholder="Pegá el enlace de Google Maps o Apple Maps de tu negocio">
                        <span class="hint">Pegá el enlace a la ubicación de tu negocio para mostrar el mapa en la página de contacto.</span>
                    </div>
                    <div class="admin-field full">
                        <label for="cfgSiteDescription">Descripción del negocio</label>
                        <textarea id="cfgSiteDescription" rows="3" maxlength="160" placeholder="${esTurnos ? 'Ej: Reservá tu turno y te confirmamos al instante.' : 'Ej: Venta de productos por encargo, con envíos a todo el país.'}">${esc(s.site_description ?? '')}</textarea>
                        <span class="hint">Esta descripción puede aparecer en Google y cuando compartan el enlace de tu tienda. Escribí un resumen breve de tu negocio. Si lo dejás vacío, se usará una descripción predeterminada.</span>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>Tipo de sitio web</h2>
            <p class="card-sub">Elegí cómo querés que funcione tu sitio: como una tienda para vender productos o como una página para recibir solicitudes de turnos.</p>
            <form class="admin-form" id="configFormTipoWeb">
                <div class="admin-form-grid">
                    <div class="admin-field full">
                        <label for="cfgModoWeb">Modelo del sitio</label>
                        <select id="cfgModoWeb">
                            <option value="venta" ${s.modo_web !== 'turnos' ? 'selected' : ''}>Venta de productos</option>
                            <option value="turnos" ${s.modo_web === 'turnos' ? 'selected' : ''}>Solicitud de turnos</option>
                        </select>
                        <span class="hint">Venta de productos: tus clientes podrán elegir productos, agregarlos al carrito y realizar pedidos. Podrás configurar descuentos, compras mínimas y datos de envío. Solicitud de turnos: tus clientes podrán completar un formulario para solicitar turnos. Podrás gestionar las solicitudes desde la sección "Turnos".</span>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>WhatsApp</h2>
            <p class="card-sub">Configurá el número de WhatsApp de tu negocio para que tus clientes puedan contactarte desde los botones de tu tienda. Si no ingresás un número, los botones de WhatsApp no se mostrarán.</p>
            <form class="admin-form" id="configFormWhatsapp">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgWhatsapp">Número de WhatsApp (con código país)</label>
                        <input type="text" id="cfgWhatsapp" value="${esc(s.whatsapp_number || '')}" placeholder="ej: 5491122334455">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgWhatsappMsg">Mensaje predeterminado</label>
                        <input type="text" id="cfgWhatsappMsg" value="${esc(s.whatsapp_default_message || '')}" placeholder="Hola, quería consultar ">
                        <span class="hint">Este mensaje aparecerá automáticamente cuando alguien te contacte desde los botones de WhatsApp de tu tienda. No se utiliza en los mensajes del formulario de contacto ni en los pedidos.</span>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>Redes sociales</h2>
            <p class="card-sub">Agregá los enlaces a las redes sociales de tu negocio para que tus clientes puedan encontrarte. Dejá vacíos los campos de las redes que no uses.</p>
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
            <h2>Datos para transferencias bancarias</h2>
            <p class="card-sub">Estos datos se mostrarán a tus clientes después de realizar un pedido.</p>
            <form class="admin-form" id="configFormTransferencia">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgAlias">Alias CBU</label>
                        <input type="text" id="cfgAlias" value="${esc(s.transfer_alias || '')}" placeholder="ej: mi.alias.o.cbu">
                    </div>
                    <div class="admin-field">
                        <label for="cfgEntidad">Banco</label>
                        <input type="text" id="cfgEntidad" value="${esc(s.transfer_entity || '')}" placeholder="ej: Banco de ejemplo">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgTitular">Titular de la cuenta</label>
                        <input type="text" id="cfgTitular" value="${esc(s.transfer_holder || '')}" placeholder="Nombre y apellido del titular de la cuenta">
                        <span class="hint">Si dejás vacío el campo de Alias o CBU, no se mostrarán los datos bancarios. Podés hacerlo si cobrás por otro medio.</span>
                    </div>
                    <div class="admin-field full">
                        <label for="cfgGraciasTitulo">Título del mensaje para tus clientes</label>
                        <input type="text" id="cfgGraciasTitulo" value="${esc(s.gracias_titulo ?? '')}" placeholder="Próximos Pasos">
                        <span class="hint">Es el título del mensaje que verán tus clientes después de realizar un pedido. Si lo dejás vacío, no se mostrará ningún título.</span>
                    </div>
                    <div class="admin-field full">
                        <label for="cfgGraciasTexto">Mensaje para tus clientes</label>
                        <textarea id="cfgGraciasTexto" rows="3" placeholder="Te confirmaremos por WhatsApp cuando recibamos tu transferencia bancaria.">${esc(s.gracias_texto ?? '')}</textarea>
                        <span class="hint">Escribí las indicaciones que querés mostrar a tus clientes después de realizar un pedido. Podés separar el texto en varias líneas. Si lo dejás vacío, el mensaje no se mostrará.</span>
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>

        <div class="admin-card">
            <h2>Ventana de salida</h2>
            <p class="card-sub">Personalizá el mensaje que aparece cuando alguien está por salir de tu tienda o desactivá esta opción si no querés mostrarlo.</p>
            <form class="admin-form" id="configFormPopup">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgPopupTitulo">Título</label>
                        <input type="text" id="cfgPopupTitulo" value="${esc(s.popup_titulo && s.popup_titulo !== DEFAULT_POPUP.titulo ? s.popup_titulo : '')}" placeholder="${esc(DEFAULT_POPUP.titulo)}">
                    </div>
                    <div class="admin-field">
                        <label for="cfgPopupCta">Texto del botón</label>
                        <input type="text" id="cfgPopupCta" value="${esc(s.popup_cta && s.popup_cta !== DEFAULT_POPUP.cta ? s.popup_cta : '')}" placeholder="${esc(esTurnos ? 'Ver servicios' : DEFAULT_POPUP.cta)}">
                    </div>
                    <div class="admin-field full">
                        <label for="cfgPopupDescripcion">Mensaje</label>
                        <textarea id="cfgPopupDescripcion" rows="3" placeholder="${esc(DEFAULT_POPUP.descripcion)}">${esc(s.popup_descripcion && s.popup_descripcion !== DEFAULT_POPUP.descripcion ? s.popup_descripcion : '')}</textarea>
                    </div>
                    <div class="admin-field full">
                        <label for="cfgPopupCtaUrl">Enlace del botón</label>
                        <input type="text" id="cfgPopupCtaUrl" value="${esc(s.popup_cta_url && s.popup_cta_url !== DEFAULT_POPUP.ctaUrl ? s.popup_cta_url : '')}" placeholder="${esc(DEFAULT_POPUP.ctaUrl)}">
                        <span class="hint">Indicá a qué página querés llevar a tus clientes cuando hagan clic en el botón. Puede ser una página de tu tienda o un sitio externo.</span>
                    </div>
                    <div class="admin-field full">
                        <label class="admin-check">
                            <input type="checkbox" id="cfgPopupActivo" ${s.popup_activo === true ? 'checked' : ''}>
                            Activar ventana de salida (se mostrará cuando alguien esté por salir de la tienda)
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
            <p class="card-sub">Agregá preguntas y respuestas para ayudar a tus clientes a resolver sus dudas. Se mostrarán en la sección de preguntas frecuentes de tu tienda.</p>
            <div id="gestorPreguntasFrecuentes"></div>
        </div>

        <div class="admin-card">
            <h2>Exportar datos</h2>
            <p class="card-sub">Descargá la información de tu tienda en archivos que podés abrir con Excel o Google Sheets. Cada tipo de información se descarga por separado.</p>
            <div class="admin-form-grid">
                <div class="admin-field">
                    <button type="button" class="btn btn-outline" id="btnExportarProductos">
                        <i class="fa-solid fa-box"></i> Exportar ${esTurnos ? 'servicios' : 'productos'} (.csv)
                    </button>
                    <span class="hint">Incluye los precios, las existencias, las categorías y el estado de tus servicios.</span>
                </div>
                <div class="admin-field">
                    <button type="button" class="btn btn-outline" id="btnExportarPedidos">
                        <i class="fa-solid fa-cart-shopping"></i> Exportar pedidos (.csv)
                    </button>
                    <span class="hint">Incluye los datos de tus clientes, los importes y los detalles de cada pedido.</span>
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

    const camposTipoWeb = () => ({
        modo_web: $('#cfgModoWeb').value === 'turnos' ? 'turnos' : 'venta'
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
        // Solo dígitos: un número de WhatsApp no lleva espacios, "+" ni símbolos.
        // Además de normalizar la entrada, evita que un valor con comillas o "<"
        // rompa el markup de la tienda donde se interpola.
        whatsapp_number: $('#cfgWhatsapp').value.replace(/\D/g, ''),
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
        },
        {
            columnas: ['modo_web'],
            aviso: 'Falta aplicar la migración 0051: el tipo de web todavía no se puede guardar.'
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
        popup_cta: $('#cfgPopupCta').value.trim() || (esTurnos ? 'Ver servicios' : DEFAULT_POPUP.cta),
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

    // Tipo de web: el panel depende del modo (menú Productos/Servicios y las
    // secciones Pedidos/Turnos visibles según el caso). Si el modo CAMBIA, la
    // RPC cambiar_modo_web (migración 0056) activa los ítems del modo entrante
    // y desactiva (sin borrar) los del otro modo, con confirmación previa que
    // muestra los conteos. Sin cambio de modo, se guarda normal.
    const modoActual = s.modo_web === 'turnos' ? 'turnos' : 'venta';
    const etiquetaModo = (m) => m === 'turnos' ? 'servicios' : 'productos';
    $('#configFormTipoWeb').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#configFormTipoWeb').querySelector('[type="submit"]');
        const payload = sinColumnasAusentes(camposTipoWeb());
        const nuevoModo = payload.modo_web === 'turnos' ? 'turnos' : 'venta';

        if (nuevoModo === modoActual) {
            conCarga(submitBtn, guardarConfig(payload))
                .then(() => toast('Configuración guardada.'))
                .catch((error) => toast(error.message, 'error'));
            return;
        }

        // Cambio de modo: consultar conteos para el mensaje de confirmación.
        // (Si la 0056 no está aplicada, la columna `modo` no existe y esto
        // falla con error claro: hay que correr la migración primero.)
        let sb;
        let conteos = { activar: 0, desactivar: 0 };
        try {
            sb = await clienteAdmin();
            const [activarR, desactivarR] = await Promise.all([
                sb.from('products').select('id', { count: 'exact', head: true })
                    .eq('modo', nuevoModo).eq('activo', false),
                sb.from('products').select('id', { count: 'exact', head: true })
                    .eq('modo', modoActual).eq('activo', true)
            ]);
            if (activarR.error) throw activarR.error;
            if (desactivarR.error) throw desactivarR.error;
            conteos = { activar: activarR.count ?? 0, desactivar: desactivarR.count ?? 0 };
        } catch (error) {
            toast(`No se pudo preparar el cambio de modo: ${error.message}`, 'error');
            return;
        }

        const nombreNuevo = nuevoModo === 'turnos'
            ? 'Solicitud de turnos (agenda)'
            : 'Venta de productos (carrito y checkout)';
        const ok = await confirmarDialogo({
            titulo: 'Cambiar tipo de web',
            mensaje:
                `¿Cambiar el sitio a <strong>${esc(nombreNuevo)}</strong>?`
                + `<br><br>Se <strong>activarán ${conteos.activar}</strong> ${etiquetaModo(nuevoModo)} y se `
                + `<strong>desactivarán ${conteos.desactivar}</strong> ${etiquetaModo(modoActual)}. `
                + 'Ningún ítem se borra: los ocultos siguen en el panel (filtro "Activos e inactivos").',
            textoConfirmar: `Cambiar a ${nuevoModo === 'turnos' ? 'turnos' : 'venta'}`,
            mensajeHtml: true
        });
        if (!ok) return;

        conCarga(submitBtn, sb.rpc('cambiar_modo_web', { p_modo: nuevoModo }))
            .then(({ data, error }) => {
                if (error) throw error;
                const r = data || {};
                toast(`Modo ${nuevoModo}: ${r.activados ?? conteos.activar} activado(s), ${r.desactivados ?? conteos.desactivar} desactivado(s).`);
                // Espera a que se vea el toast antes de recargar el panel.
                setTimeout(() => window.location.reload(), 700);
            })
            .catch((error) => toast(`No se pudo cambiar el modo: ${error.message}`, 'error'));
    });

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
        `No hay ${esTurnos ? 'servicios' : 'productos'} para exportar.`,
        (n) => `${esTurnos ? 'Servicios' : 'Productos'} exportados: ${n} filas.`
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