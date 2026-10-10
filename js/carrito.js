// Gestión del carrito de compras

import { formatearPrecio, mostrarNotificacion, calcularTotales, estadoCompraMinima, CONFIG_DESCUENTO, CONFIG_CUPONES, obtenerProductos, obtenerCupones, obtenerBanners, escaparHtml, urlSegura, claveItemCarrito, esBannerSoloImagen, recortarTexto, atributosEnlace, placeholderImagenPublica, cargarConfiguracionGlobal, esModoTurnos, obtenerTurnosOcupados } from './utils.js';

let productosGlobales = [];

// Obtener carrito del localStorage
function obtenerCarrito() {
    return JSON.parse(localStorage.getItem('cart')) || [];
}

// Guardar carrito en localStorage
function guardarCarrito(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    if (window.actualizarContadorCarrito) window.actualizarContadorCarrito();
}

// Renderizar items del carrito
function renderizarCarrito() {
    const cartItemsContainer = document.getElementById('cartItems');
    if (!cartItemsContainer) return;

    const cart = obtenerCarrito();

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart">
                <h2>Tu carrito está vacío</h2>
                <p>Agrega productos para comenzar tu compra</p>
                <a href="/" class="shop-btn btn-border">Ir a la tienda</a>
            </div>
        `;
        actualizarTotales();
        return;
    }

    cartItemsContainer.innerHTML = cart.map(item => {
        const enTurnos = esModoTurnos();
        const productoRef = productosGlobales.find(p => p.id === item.id);
        // En modo turnos los servicios no manejan stock ni cantidad: nunca se
        // marcan como agotados ni de última unidad y la cantidad queda fija en
        // 1 (el turno no se multiplica), así que no hay stepper de cantidad.
        const sinStock = !enTurnos && productoRef && productoRef.stock === 0;
        const stockBajo = !enTurnos && productoRef && productoRef.stock > 0 && productoRef.stock < 5;
        const clave = claveItemCarrito(item.id, item.varianteTexto);

        // V-2: el nombre del producto (contenido administrado) viaja en el
        // carrito → escapar antes de interpolar en HTML.
        const nombreSeguro = escaparHtml(recortarTexto(item.nombre));
        const imagenSegura = escaparHtml(item.imagen);

        return `
        <div class="cart-item${sinStock ? ' sin-stock' : ''}" data-clave="${escaparHtml(clave)}">
            ${item.imagen
                ? `<img src="${imagenSegura}" alt="${nombreSeguro}" class="item-image" loading="lazy">`
                : placeholderImagenPublica('item-image')}
            <div class="item-details">
                <h3 class="item-title">${nombreSeguro}</h3>
                ${item.varianteTexto ? `<p class="item-variant">${escaparHtml(item.varianteTexto)}</p>` : ''}
                ${sinStock ? `<p class="stock-alert stock-alert-danger">⚠️ Este producto se agotó. Debes eliminarlo para continuar.</p>` : ''}
                ${stockBajo ? `<p class="stock-alert stock-alert-warn">⚠️ ¡Últimas unidades disponibles! (Quedan ${productoRef.stock})</p>` : ''}
                <p class="item-price">$${formatearPrecio(item.precio)}</p>
            </div>
            <div class="item-controls">
                ${enTurnos ? '' : `
                <div class="quantity-controls">
                    <button class="qty-btn btn-border" onclick="actualizarCantidad(this.dataset.clave, -1)" data-clave="${escaparHtml(clave)}" aria-label="Disminuir cantidad" ${sinStock ? 'disabled' : ''}>-</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button class="qty-btn btn-border" onclick="actualizarCantidad(this.dataset.clave, 1)" data-clave="${escaparHtml(clave)}" aria-label="Aumentar cantidad" ${sinStock ? 'disabled' : ''}>+</button>
                </div>
                `}
                <button class="remove-btn btn-border" onclick="eliminarDelCarrito(this.dataset.clave)" data-clave="${escaparHtml(clave)}" aria-label="Eliminar ${nombreSeguro}">
                    <i class="fa-solid fa-trash-can"></i> Eliminar
                </button>
            </div>
        </div>
    `;
    }).join('');

    actualizarTotales();
}

// Actualizar cantidad de un producto (por clave de línea). En modo turnos no
// se puede cambiar: los servicios se piden de a 1 (no hay stock ni cantidad).
function actualizarCantidad(clave, cambio) {
    if (esModoTurnos()) return;

    let cart = obtenerCarrito();
    const item = cart.find(i => claveItemCarrito(i.id, i.varianteTexto) === clave);

    if (item) {
        // Validar stock solo si se intenta aumentar la cantidad (sumado entre
        // líneas del mismo producto). En modo turnos no aplica: los servicios
        // no manejan stock.
        if (cambio > 0 && !esModoTurnos()) {
            const productoRef = productosGlobales.find(p => p.id === item.id);
            if (productoRef) {
                const enCarrito = cart
                    .filter(i => i.id === item.id)
                    .reduce((sum, i) => sum + i.quantity, 0);
                if (enCarrito + cambio > productoRef.stock) {
                    mostrarNotificacion(`Límite de stock alcanzado (${productoRef.stock} disponibles)`);
                    return;
                }
            }
        }

        item.quantity += cambio;
        
        if (item.quantity <= 0) {
            eliminarDelCarrito(clave);
            return;
        }

        guardarCarrito(cart);
        renderizarCarrito();
    }
}

// Eliminar producto del carrito (por clave de línea)
function eliminarDelCarrito(clave) {
    let cart = obtenerCarrito();
    cart = cart.filter(item => claveItemCarrito(item.id, item.varianteTexto) !== clave);
    guardarCarrito(cart);
    renderizarCarrito();
}

// Aplicar cupón manual
function aplicarCupon() {
    const input = document.getElementById('couponInput');
    const btn = document.getElementById('applyCouponBtn');
    if (!input || !btn) return;

    const codigo = input.value.trim().toUpperCase();
    if (!codigo) return;

    // Estado de carga
    const originalText = btn.textContent;
    btn.textContent = 'Validando...';
    btn.disabled = true;

    // Simular validación (ej. 800ms) para que el estado de carga sea visible
    setTimeout(() => {
        const cuponData = CONFIG_CUPONES[codigo];

        if (cuponData) {
            const hoy = new Date();
            const fechaExp = new Date(cuponData.expira);

            // Validar si el cupón no ha expirado
            if (hoy.setHours(0, 0, 0, 0) <= fechaExp.setHours(0, 0, 0, 0)) {
                sessionStorage.setItem('appliedCoupon', codigo);
                mostrarNotificacion(`✅ Cupón ${codigo} aplicado con éxito`);
                actualizarTotales();
                input.value = ''; // Limpiar el campo tras éxito
            } else {
                mostrarNotificacion('❌ Este cupón ha expirado', 'error');
            }
        } else {
            mostrarNotificacion('❌ El código de cupón no es válido', 'error');
        }

        // Restaurar estado original
        btn.textContent = originalText;
        btn.disabled = false;
    }, 800);
}

// Eliminar cupón aplicado
function eliminarCupon() {
    sessionStorage.removeItem('appliedCoupon');
    mostrarNotificacion('Cupón eliminado');
    actualizarTotales();
}

// Actualizar totales
function actualizarTotales() {
    const cart = obtenerCarrito();
    const cupon = sessionStorage.getItem('appliedCoupon');
    const enTurnos = esModoTurnos();

    // En modo turnos no hay envío: se oculta la fila del resumen (no aplica a
    // los servicios). Se decide acá porque actualizarTotales es el refresh del
    // resumen completo, con carrito lleno o vacío.
    const shippingRow = document.getElementById('shippingRow');
    if (shippingRow) shippingRow.style.display = enTurnos ? 'none' : 'flex';

    const applyBtn = document.getElementById('applyCouponBtn');
    const removeBtn = document.getElementById('removeCouponBtn');
    const couponInput = document.getElementById('couponInput');

    if (cupon) {
        if (applyBtn) {
            applyBtn.style.display = 'none';
            applyBtn.classList.remove('coupon-animate');
        }
        if (couponInput) {
            couponInput.style.display = 'none';
            couponInput.classList.remove('coupon-animate');
        }
        if (removeBtn && removeBtn.style.display !== 'block') {
            removeBtn.style.display = 'block';
            removeBtn.classList.add('coupon-animate');
        }
    } else {
        if (applyBtn && applyBtn.style.display !== 'block') {
            applyBtn.style.display = 'block';
            applyBtn.classList.add('coupon-animate');
        }
        if (couponInput && couponInput.style.display !== 'block') {
            couponInput.style.display = 'block';
            couponInput.classList.add('coupon-animate');
        }
        if (removeBtn) {
            removeBtn.style.display = 'none';
            removeBtn.classList.remove('coupon-animate');
        }
    }

    const haySinStock = cart.some(item => {
        const ref = productosGlobales.find(p => p.id === item.id);
        return ref && ref.stock === 0;
    });

    const { subtotal, descuento, total, esCupon, porcentaje } = calcularTotales(cart, cupon);

    // Compra mínima (si está configurada): aviso y bloqueo del checkout.
    const min = estadoCompraMinima(cart);
    const minAviso = document.getElementById('minCompraAviso');
    if (minAviso) {
        const mostrarAviso = cart.length > 0 && !min.cumple;
        minAviso.textContent = min.mensaje || '';
        minAviso.hidden = !mostrarAviso;
    }

    const subtotalElement = document.getElementById('subtotal');
    const descuentoElement = document.getElementById('descuento');
    const descuentoRow = document.getElementById('descuentoRow');
    const totalElement = document.getElementById('total');

    if (subtotalElement) {
        subtotalElement.textContent = `$${formatearPrecio(subtotal)}`;
    }

    // Manejar la visualización del descuento
    if (descuento > 0) {
        if (descuentoRow) descuentoRow.style.display = 'flex';
        if (descuentoElement) {
            const etiqueta = esCupon ? `Cupón ${cupon}` : 'Dcto. Automático';
            descuentoElement.textContent = `-${etiqueta} ($${formatearPrecio(descuento)} [${porcentaje}%])`;
        }
    } else {
        if (descuentoRow) descuentoRow.style.display = 'none';
    }

    if (totalElement) {
        totalElement.textContent = `$${formatearPrecio(total)}`;
    }

    // Habilitar/deshabilitar el botón del paso final. En modo turnos solo se
    // bloquea con el carrito vacío: la solicitud de turno no exige mínimos de
    // compra ni stock disponible (se coordina después), a diferencia del checkout.
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.disabled = cart.length === 0 || (!enTurnos && (haySinStock || !min.cumple));
    }
}

// Mostrar formulario de checkout
function mostrarFormularioCheckout() {
    const checkoutForm = document.getElementById('checkoutForm');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (checkoutForm && checkoutBtn) {
        checkoutForm.classList.remove('hidden');
        checkoutBtn.style.display = 'none';
        
        // Scroll al formulario
        checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Cargar productos para referencia de stock
async function cargarProductosReferencia() {
    try {
        productosGlobales = await obtenerProductos();
    } catch (error) {
        console.error('Error al cargar productos para validación:', error);
    }
}

// Banner del carrito: el que tiene en_carrito, elegido en el panel
// (Banners → Editar → "Banner del carrito"). Antes se deducía de la posición, y
// eso hacía que cualquier banner nuevo se llevara el carrito porque el alta lo
// deja último. Si nadie está marcado, no se muestra banner.
function renderizarBannerCarrito(banners) {
    const contenedor = document.getElementById('banner-carrito');
    if (!contenedor) return;

    const banner = Array.isArray(banners) ? banners.find((b) => b.en_carrito) || null : null;
    if (!banner) return;

    // Banner "solo imagen": imagen a ancho completo como fondo con cover
    if (esBannerSoloImagen(banner)) {
        const img = escaparHtml(banner.imagen);
        // V-3: urlSegura bloquea esquemas peligrosos (javascript:, data:, …)
        const link = banner.link ? escaparHtml(urlSegura(banner.link)) : '';
        const etiqueta = link ? `aria-label="${escaparHtml(banner.titulo || 'Banner')}" ` : '';
        const visual = img
            ? `<div class="banner-solo-imagen banner-border" style="background-image:url('${img}')">${link ? `<a href="${link}" ${atributosEnlace(banner)} ${etiqueta}></a>` : ''}</div>`
            : `<div class="banner-solo-imagen banner-border sin-imagen">${link ? `<a href="${link}" ${atributosEnlace(banner)} ${etiqueta}></a>` : ''}</div>`;
        contenedor.innerHTML = visual;
        contenedor.hidden = false;
        return;
    }

    const titulo = escaparHtml(banner.titulo);
    // V-3: urlSegura bloquea esquemas peligrosos en el href administrado.
    const link = banner.link ? escaparHtml(urlSegura(banner.link)) : '';
    const tieneBoton = Boolean(banner.boton && link);
    const imagenVisual = banner.imagen
        ? `<img loading="lazy" src="${escaparHtml(banner.imagen)}" alt="${titulo}" width="1200" height="400">`
        : placeholderImagenPublica('banner-image-placeholder');

    contenedor.innerHTML = `
        <div class="banner banner-border">
            <div class="banner_imagen">
                ${link ? `<a href="${link}" ${atributosEnlace(banner)}>` : ''}
                    ${imagenVisual}
                ${link ? '</a>' : ''}
            </div>
            <div class="banner_info">
                ${banner.logo ? `
                <div class="banner_info_icono banner-border">
                    <img loading="lazy" src="${escaparHtml(banner.logo)}" alt="" class="block" width="60">
                </div>
                ` : ''}

                <div class="banner_info_copy">
                    ${banner.badge ? `<span>${escaparHtml(recortarTexto(banner.badge))}</span>` : ''}
                    <h2>${escaparHtml(recortarTexto(banner.titulo))}</h2>
                    ${tieneBoton ? `<a href="${link}" ${atributosEnlace(banner)}>${escaparHtml(recortarTexto(banner.boton))} <i class="fa-solid fa-chevron-right"></i></a>` : ''}
                </div>
            </div>
        </div>
    `;
    contenedor.hidden = false;
}

// ============ MODO TURNOS: el carrito se mantiene, cambia solo el paso final ============
// En modo turnos (Configuración → Tipo de web) la tienda y el carrito
// funcionan igual que en venta: ítems, cupón, resumen y totales. Lo único que
// cambia es el formulario que se abre al tocar "Solicitar turno": en vez del
// checkout de envío (#checkoutForm) se muestra la solicitud de turno
// (#turnoForm), y el turno se registra con los ítems del carrito (insertar_turno,
// migración 0053).
function mostrarFormularioTurno() {
    const turnoForm = document.getElementById('turnoForm');
    const checkoutBtn = document.getElementById('checkoutBtn');

    if (turnoForm && checkoutBtn) {
        turnoForm.classList.remove('hidden');
        checkoutBtn.style.display = 'none';

        // Guía y restricción de fecha/hora con la agenda actual del carrito:
        // se recalculan acá (al abrir) para reflejar cualquier cambio posterior
        // del carrito, no solo los del primer render.
        mostrarHorariosCarrito();
        restringirFormularioTurno();

        // Scroll al formulario de solicitud
        turnoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Guía para quien pide el turno: los días de la semana en que se atiende cada
// servicio del carrito (0053). Es informativa: la restricción real de fecha y
// hora la aplica restringirFormularioTurno() al abrir el formulario.
function mostrarHorariosCarrito() {
    const contenedor = document.getElementById('turnoHorarios');
    if (!contenedor) return;

    const cart = obtenerCarrito();
    const lineas = cart
        .map((item) => {
            const ref = productosGlobales.find((p) => p.id === item.id);
            if (!ref) return null;
            const horarios = Array.isArray(ref.servicioHorarios) ? ref.servicioHorarios : [];
            if (!horarios.length) return null;
            const dias = [...new Set(horarios.map((h) => String(h?.dia || '').trim()).filter(Boolean))];
            return dias.length ? { nombre: item.nombre, dias } : null;
        })
        .filter(Boolean);

    if (!lineas.length) {
        contenedor.hidden = true;
        contenedor.innerHTML = '';
        return;
    }

    contenedor.innerHTML = `
        <strong>Días disponibles de tus servicios (la solicitud de turno solo ofrece esos días y horarios):</strong>
        <ul>
            ${lineas.map((l) => `<li>${escaparHtml(l.nombre)}: ${escaparHtml(l.dias.join(', '))}</li>`).join('')}
        </ul>
    `;
    contenedor.hidden = false;
}

// ---------- Restricción de fecha y hora por la agenda de los servicios (0053) ----------
// La solicitud de turno solo ofrece días y horarios que respetan la agenda de
// TODOS los servicios del carrito que declaran horarios (intersección): el día
// debe estar en las agendas en común y la hora de inicio en alguna franja
// [desde, hasta), descontando la duración estimada (el turno debe terminar
// antes del cierre). Un servicio sin horarios declarados no restringe.
// Se reemplazan los inputs nativos por selects: value "YYYY-MM-DD" / "HH:MM",
// el mismo contrato que ya lee formulario.js con FormData (fecha y hora).

// Normaliza "Miércoles" → "miercoles" (minúsculas y sin acentos) para comparar
// el día de la agenda (cadena del panel) con el de la fecha elegida.
function normalizarDiaTurno(d) {
    return String(d || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function diaSemanaFecha(fecha) {
    return normalizarDiaTurno(fecha.toLocaleDateString('es-AR', { weekday: 'long' }));
}

function minutosAMedianoche(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
}

function minutosAMedianocheAString(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function tiempoAMedianoche(hhmm, paso) {
    const h = Math.floor(paso / 60);
    const m = paso % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Servicios del carrito que declaran agenda y los días de la semana en común
// entre todos ellos.
function agendaTurnoCarrito() {
    const cart = obtenerCarrito();
    const servicios = cart
        .map((item) => productosGlobales.find((p) => p.id === item.id))
        .filter(Boolean)
        .filter((s) => Array.isArray(s.servicioHorarios) && s.servicioHorarios.length > 0);

    if (servicios.length === 0) return { activo: false, dias: new Set(), servicios: [] };

    let dias = null;
    for (const s of servicios) {
        const setDias = new Set(s.servicioHorarios.map((h) => normalizarDiaTurno(h.dia)).filter(Boolean));
        dias = dias === null ? setDias : new Set([...dias].filter((d) => setDias.has(d)));
    }

    return { activo: true, dias: dias || new Set(), servicios };
}

// Horas de inicio posibles del servicio s para un día de la semana (normalizado):
// cada franja [desde, hasta) se recorre de a 15 minutos desde su inicio y se
// acota con la duración estimada (inicio + duración ≤ hasta).
const PASO_TURNO_MIN = 15;

function franjasPosiblesServicio(s, diaNorm) {
    const dur = Math.max(0, Number(s.servicioDuracionMin) || 0);
    const inicios = new Set();
    for (const h of s.servicioHorarios) {
        if (normalizarDiaTurno(h.dia) !== diaNorm) continue;
        const desde = String(h.desde || '');
        const hasta = String(h.hasta || '');
        if (!/^\d{2}:\d{2}$/.test(desde) || !/^\d{2}:\d{2}$/.test(hasta)) continue;
        const desdeMin = minutosAMedianoche(desde);
        const hastaMin = minutosAMedianoche(hasta);
        if (hastaMin <= desdeMin) continue;
        const paso = dur > 0 ? dur : PASO_TURNO_MIN;
        if (paso <= 0) continue;
        const ultimoMin = dur > 0 ? (hastaMin - dur) : hastaMin;
        if (ultimoMin < desdeMin) continue;
        for (let tMin = desdeMin; tMin <= ultimoMin; tMin += paso) {
            inicios.add(minutosAMedianocheAString(tMin));
        }
    }
    return inicios;
}

// Reemplaza los inputs nativos del formulario de turno por selects limitados a
// la agenda de los servicios del carrito. Idempotente: se llama cada vez que se
// abre el formulario (mostrarFormularioTurno), así refleja el carrito actual.
// Desde la migración 0054 también descarta los horarios ya tomados (turno
// Confirmado/Realizado): solo se ofrecen días y horas que siguen libres.
async function restringirFormularioTurno() {
    const campoFecha = document.getElementById('turnoFecha');
    const campoHora = document.getElementById('turnoHora');
    if (!campoFecha || !campoHora) return;

    const agenda = agendaTurnoCarrito();
    if (!agenda.activo) return; // sin agenda declarada: campos sin restricción

    // Select de fecha: próximos 60 días que caen en un día de agenda común.
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyISO = [hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate()]
        .map((n) => String(n).padStart(2, '0'))
        .join('-');

    const fechas = [];
    for (let i = 0; i < 60; i++) {
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
        if (!agenda.dias.has(diaSemanaFecha(fecha))) continue;
        fechas.push({
            valor: [fecha.getFullYear(), fecha.getMonth() + 1, fecha.getDate()]
                .map((n) => String(n).padStart(2, '0'))
                .join('-'),
            fecha
        });
    }

    // Horarios ya tomados (0054): la anon key no puede leer `turnos` por RLS,
    // así que se consultan por la RPC pública turnos_ocupados. Si falla (RPC
    // sin aplicar o Supabase caído) se degrada a la agenda sin ocupación:
    // insertar_turno igual valida al registrar (el servidor es la verdad).
    const finRango = fechas.length ? fechas[fechas.length - 1].valor : hoyISO;
    const ocupados = await obtenerTurnosOcupados(hoyISO, finRango);
    const ocupadosPorFecha = new Map();
    for (const o of Array.isArray(ocupados) ? ocupados : []) {
        if (!o || !o.fecha || !o.hora) continue;
        if (!ocupadosPorFecha.has(o.fecha)) ocupadosPorFecha.set(o.fecha, []);
        ocupadosPorFecha.get(o.fecha).push({
            hora: String(o.hora),
            duracion: Math.max(0, Math.floor(Number(o.duracion) || 0))
        });
    }

    // Duración del turno que se está reservando (suma de los servicios del
    // carrito): 15 min de paso por servicio sin duración declarada, el mismo
    // criterio que usa el servidor (0054) para calcular superposiciones.
    const durNueva = obtenerCarrito().reduce((suma, item) => {
        const ref = productosGlobales.find((p) => p.id === item.id);
        const dur = ref ? Math.max(0, Number(ref.servicioDuracionMin) || 0) : 0;
        return suma + (dur > 0 ? dur : PASO_TURNO_MIN);
    }, 0);

    // Horas de inicio posibles de la agenda común para una fecha, sin horas
    // pasadas (si es hoy) y sin las que se superponen con un turno tomado.
    const horasDisponiblesDe = (valorFecha) => {
        const [y, m, d] = valorFecha.split('-').map(Number);
        const diaNorm = diaSemanaFecha(new Date(y, m - 1, d));

        let horas = null;
        for (const s of agenda.servicios) {
            const set = franjasPosiblesServicio(s, diaNorm);
            horas = horas === null ? set : new Set([...horas].filter((t) => set.has(t)));
        }
        if (!horas) return new Set();

        if (valorFecha === hoyISO) {
            const minutosAhora = new Date().getHours() * 60 + new Date().getMinutes();
            horas = new Set([...horas].filter((t) => minutosAMedianoche(t) > minutosAhora));
        }

        const tomados = ocupadosPorFecha.get(valorFecha) || [];
        if (tomados.length) {
            horas = new Set([...horas].filter((t) => {
                const tMin = minutosAMedianoche(t);
                return !tomados.some((o) => {
                    const eIni = minutosAMedianoche(o.hora);
                    const eFin = eIni + (o.duracion > 0 ? o.duracion : 1);
                    return tMin < eFin && eIni < tMin + (durNueva > 0 ? durNueva : 1);
                });
            }));
        }

        return horas;
    };

    // Solo se ofrecen días que aún tienen al menos un horario libre.
    const conDisponibilidad = [];
    for (const f of fechas) {
        const horas = horasDisponiblesDe(f.valor);
        if (horas.size > 0) conDisponibilidad.push({ ...f, horas });
    }

    const selectFecha = document.createElement('select');
    selectFecha.id = 'turnoFecha';
    selectFecha.name = 'fecha';
    selectFecha.required = true;
    selectFecha.setAttribute('aria-label', 'Fecha preferida');

    const opcionFecha = document.createElement('option');
    opcionFecha.value = '';
    opcionFecha.textContent = conDisponibilidad.length
        ? 'Elegí el día…'
        : 'Sin horarios disponibles en los próximos 60 días';
    selectFecha.appendChild(opcionFecha);
    for (const f of conDisponibilidad) {
        const opt = document.createElement('option');
        opt.value = f.valor;
        opt.textContent = f.fecha.toLocaleDateString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        selectFecha.appendChild(opt);
    }

    // Select de hora: franjas en común para el día elegido y aún libres.
    const selectHora = document.createElement('select');
    selectHora.id = 'turnoHora';
    selectHora.name = 'hora';
    selectHora.required = true;
    selectHora.disabled = true;
    selectHora.setAttribute('aria-label', 'Hora preferida');

    const opcionHora = document.createElement('option');
    opcionHora.value = '';
    selectHora.appendChild(opcionHora);
    opcionHora.textContent = 'Elegí primero el día';

    function poblarHoras() {
        while (selectHora.options.length > 1) selectHora.remove(1);

        const valorFecha = selectFecha.value;
        if (!valorFecha) {
            opcionHora.textContent = 'Elegí primero el día';
            selectHora.disabled = true;
            return;
        }

        const dia = conDisponibilidad.find((f) => f.valor === valorFecha);
        const horas = dia ? dia.horas : new Set();
        if (!horas.size) {
            opcionHora.textContent = 'No hay horarios disponibles para ese día';
            selectHora.disabled = true;
            return;
        }

        opcionHora.textContent = 'Elegí la hora';
        selectHora.disabled = false;
        [...horas].sort().forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = `${t} hs`;
            selectHora.appendChild(opt);
        });
    }

    selectFecha.addEventListener('change', poblarHoras);
    campoFecha.replaceWith(selectFecha);
    campoHora.replaceWith(selectHora);
}

// Event listener para el botón de checkout
document.addEventListener('DOMContentLoaded', async function() {
    // El modo de la web se lee de settings (Configuración → Tipo de web).
    // Se espera acá (aunque template.js ya lo carga) para decidir con seguridad.
    await cargarConfiguracionGlobal();

    // El carrito se renderiza igual en ambos modos: en turnos solo cambia el
    // formulario del paso final (ver mostrarFormularioTurno).
    await cargarProductosReferencia();
    await obtenerCupones();
    renderizarCarrito();
    renderizarBannerCarrito(await obtenerBanners());
    
    // Alerta inicial si hay productos que se quedaron sin stock (no aplica en
    // modo turnos: los servicios no manejan stock).
    const cart = obtenerCarrito();
    const tieneSinStock = !esModoTurnos() && cart.some(item => {
        const ref = productosGlobales.find(p => p.id === item.id);
        return ref && ref.stock === 0;
    });

    if (tieneSinStock) {
        mostrarNotificacion('⚠️ Algunos productos en tu carrito ya no tienen stock disponible.');
    }

    const enTurnos = esModoTurnos();

    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', enTurnos ? mostrarFormularioTurno : mostrarFormularioCheckout);
        if (enTurnos) checkoutBtn.textContent = 'Solicitar turno';
    }

    // Modo turnos: la guía de horarios y la restricción de fecha/hora se
    // aplican al abrir el formulario (mostrarFormularioTurno), con el carrito
    // ya establecido.

    // Validar cupón al presionar Enter en el input
    const couponInput = document.getElementById('couponInput');
    if (couponInput) {
        couponInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                aplicarCupon();
            }
        });
    }
});

// Exponer funciones globalmente (necesario por usar módulos y eventos inline en HTML)
window.actualizarCantidad = actualizarCantidad;
window.eliminarDelCarrito = eliminarDelCarrito;
window.aplicarCupon = aplicarCupon;
window.eliminarCupon = eliminarCupon;
window.mostrarFormularioCheckout = mostrarFormularioCheckout;