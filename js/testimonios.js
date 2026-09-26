// Testimonios - carrusel de reseñas (motor JS + drag/swipe)

import { obtenerResenas, imagenOptimizada, escaparHtml, placeholderImagenPublica } from './utils.js';

// Red de origen del testimonio: la clave ES la clase de Tabler (de ahí sale
// el <i>, con el prefijo `ti` adelante), y el valor es la etiqueta para
// lectores de pantalla.
// El dato viene de reviews.red y se busca acá, nunca se interpola crudo: si la
// fila tuviera algo desconocido, cae en Google en vez de volcarlo en el class.
//
// El color de cada marca está en css/styles.css, en las reglas
// .red-isologo.ti-brand-<red> (facebook, instagram, x, tiktok, youtube,
// linkedin, whatsapp).
// Al agregar una red hay que tocar también el CHECK de la columna en la
// migración 0029 y la lista REDES de admin/js/resenas.js.
const RED_POR_DEFECTO = 'ti-brand-google';
const REDES = {
    'ti-brand-google':    { etiqueta: 'Google' },
    'ti-brand-facebook':  { etiqueta: 'Facebook' },
    'ti-brand-instagram': { etiqueta: 'Instagram' },
    'ti-brand-x': { etiqueta: 'X' },
    'ti-brand-tiktok':    { etiqueta: 'TikTok' },
    'ti-brand-youtube':   { etiqueta: 'YouTube' },
    'ti-brand-linkedin':  { etiqueta: 'LinkedIn' },
    'ti-brand-whatsapp':  { etiqueta: 'WhatsApp' }
};

const TESTIMONIOS = [
    {
        nombre: 'María González',
        avatar: 'https://i.pravatar.cc/150?img=45',
        rating: 5,
        fecha: '12/08/2026',
        texto: 'Excelente atención y envío rapidísimo. El producto llegó perfectamente embalado y tal cual la descripción.'
    },
    {
        nombre: 'Carlos Rodríguez',
        avatar: 'https://i.pravatar.cc/150?img=12',
        rating: 5,
        fecha: '08/08/2026',
        texto: 'Muy buena calidad. Hice el pedido un martes y el jueves ya lo tenía en casa. Recomiendo completamente.'
    },
    {
        nombre: 'Lucía Fernández',
        avatar: 'https://i.pravatar.cc/150?img=32',
        rating: 5,
        fecha: '03/08/2026',
        texto: 'La atención por WhatsApp fue excelente, me ayudaron a elegir el producto correcto. ¡Volveré a comprar!'
    },
    {
        nombre: 'Martín López',
        avatar: 'https://i.pravatar.cc/150?img=68',
        rating: 4,
        fecha: '29/07/2026',
        texto: 'Compré por primera vez y la experiencia fue genial. Precios justos y muy buena comunicación durante todo el proceso.'
    },
    {
        nombre: 'Valentina García',
        avatar: 'https://i.pravatar.cc/150?img=25',
        rating: 5,
        fecha: '24/07/2026',
        texto: 'El producto superó mis expectativas. La entrega llegó en el horario prometido y en perfectas condiciones.'
    },
    {
        nombre: 'Pablo Martínez',
        avatar: 'https://i.pravatar.cc/150?img=53',
        rating: 5,
        fecha: '19/07/2026',
        texto: 'Muy conforme con la compra. El packaging era impecable y el producto funciona de maravilla. 100% recomendable.'
    },
    {
        nombre: 'Sofía Díaz',
        avatar: 'https://i.pravatar.cc/150?img=47',
        rating: 5,
        fecha: '15/07/2026',
        texto: 'Atención personalizada de principio a fin. Consulté varias dudas por WhatsApp y me respondieron al instante.'
    },
    {
        nombre: 'Jorge Sánchez',
        avatar: 'https://i.pravatar.cc/150?img=5',
        rating: 4,
        fecha: '10/07/2026',
        texto: 'Segunda compra que hago y todo perfecto otra vez. Calidad garantizada y envíos muy puntuales.'
    },
    {
        nombre: 'Camila Romero',
        avatar: 'https://i.pravatar.cc/150?img=20',
        rating: 5,
        fecha: '06/07/2026',
        texto: 'Gran experiencia de compra. La página es clara, el pago fue simple y el envío llegó en tiempo récord.'
    },
    {
        nombre: 'Diego Torres',
        avatar: 'https://i.pravatar.cc/150?img=59',
        rating: 5,
        fecha: '01/07/2026',
        texto: 'Los productos son tal cual se muestran en la web. Muy buena relación precio-calidad. Estoy muy satisfecho.'
    },
    {
        nombre: 'Florencia Álvarez',
        avatar: 'https://i.pravatar.cc/150?img=38',
        rating: 5,
        fecha: '27/06/2026',
        texto: 'Me encantó el detalle del seguimiento del pedido. Todo el proceso fue transparente y sin sorpresas.'
    },
    {
        nombre: 'Nicolás Herrera',
        avatar: 'https://i.pravatar.cc/150?img=15',
        rating: 4,
        fecha: '22/06/2026',
        texto: 'Recomendada por un amigo y no me defraudó. Excelente servicio, atención amable y productos de calidad.'
    }
];

function generarCard(testimonio) {
    const card = document.createElement('article');
    card.className = 'testimonio-card';

    // V-2: reseñas son contenido administrado → escapar antes de interpolar.
    const nombre = escaparHtml(testimonio.nombre);
    const avatar = escaparHtml(imagenOptimizada(testimonio.avatar));
    const fecha = escaparHtml(testimonio.fecha);
    const texto = escaparHtml(testimonio.texto);
    const avatarVisual = avatar
        ? `<img src="${avatar}" alt="Foto de ${nombre}" class="testimonio-foto" loading="lazy" width="56" height="56">`
        : placeholderImagenPublica('testimonio-foto testimonio-foto-placeholder');

    // Ícono de la red de origen. La clase sale del mapa, no de la fila.
    const red = REDES[testimonio.red] ? testimonio.red : RED_POR_DEFECTO;
    const redEtiqueta = REDES[red].etiqueta;
    // El texto va oculto a ojo pero no a lectores de pantalla: antes el ícono
    // era siempre Google y por eso era decorativo (aria-hidden). Ahora dice de
    // dónde vino la reseña, que es información, así que se expone.
    const redVisual = `
        <span class="red-isologo-wrap">
            <i class="ti ${red} red-isologo" aria-hidden="true"></i>
            <span class="sr-only">Reseña publicada en ${escaparHtml(redEtiqueta)}</span>
        </span>
    `;

    // La estrella llena y la vacía son el mismo ícono (Tabler es outline, sin
    // variante rellena): las distingue la clase .star-vacia, que el CSS pinta
    // en gris. Antes era  / .
    let estrellas = '';
    for (let i = 1; i <= 5; i++) {
        estrellas += `<i class="ti ti-star star${i <= testimonio.rating ? '' : ' star-vacia'}" aria-hidden="true"></i>`;
    }

    card.innerHTML = `
        <div class="testimonio-body">
            <div class="testimonio-head">
                ${avatarVisual}
                <div class="testimonio-info">
                    <p class="testimonio-nombre">${nombre}</p>
                    <div class="testimonio-stars">${estrellas}</div>
                    <p class="testimonio-fecha">${fecha}</p>
                </div>
                ${redVisual}
            </div>
            <p class="testimonio-texto">"${texto}"</p>
        </div>
    `;

    return card;
}

document.addEventListener('DOMContentLoaded', async function () {
    const viewport = document.querySelector('.testimonios-viewport');
    const track = document.querySelector('.testimonios-track');
    if (!track || !viewport) return;

    // Cargar reseñas desde Supabase (tabla resenas).
    // - Array no vacío: reseñas activas de la BD
    // - null (red/cache caída): fallback estático
    // - [] (sin reseñas activas): ocultar la sección
    const resenas = await obtenerResenas();
    if (resenas && resenas.length === 0) {
        viewport.closest('.testimonios-carousel').style.display = 'none';
        return;
    }

    const datos = (resenas || TESTIMONIOS).map(r => ({
        nombre: r.nombre,
        avatar: imagenOptimizada(r.imagen) || '',
        rating: r.valoracion ?? r.rating ?? 5,
        fecha: r.fecha,
        texto: r.resena || r.texto,
        // Las reseñas estáticas de TESTIMONIOS no traen red: usan el default.
        red: r.red
    }));

    // Un solo testimonio no se anima: se muestra como una card estática y
    // centrada. El marquee necesita al menos dos para que el loop signifique
    // algo, y con uno la repetición que hace falta para cubrir el ancho se
    // leía como contenido duplicado.
    if (datos.length === 1) {
        track.appendChild(generarCard(datos[0]));
        viewport.closest('.testimonios-carousel')?.classList.add('testimonios-estatico');
        return;
    }

    // ============ MOTOR DE ANIMACIÓN (JS) + DRAG/SWIPE ============
    //
    // El track se repite hasta cubrir el viewport más una vuelta extra. La
    // unidad del loop es el ancho de UNA vuelta de reseñas, así que al llegar
    // al final siempre queda contenido llenando la pantalla y el wrap es
    // invisible.
    //
    // Antes se clonaba una sola vez y el loop daba por media vuelta el ancho
    // total del track, lo que sólo daba la vuelta completa si el listado ya
    // entraba en una pantalla. Con 25vw por card hacen falta 4 reseñas en
    // desktop (3 en tablet, 1 en móvil): con menos, la animación recorría
    // sólo una parte del ancho y quedaba un hueco vacío al lado.
    const MS_POR_RESENA = 8000; // una reseña nueva cada 8s

    let copias = 2;
    let anchoVuelta = 0;   // ancho de una vuelta = unidad del loop

    function vueltasParaCubrir(ancho) {
        return Math.max(2, Math.ceil(viewport.offsetWidth / ancho) + 1);
    }

    // Renderiza las reseñas y las repite las veces necesarias para que la
    // animación recorra todo el ancho. Mide la primera vuelta antes de clonar,
    // en vez de suponer el ancho a partir de la cantidad de cards.
    function repoblar() {
        track.innerHTML = '';
        datos.forEach((t) => track.appendChild(generarCard(t)));
        const ancho = track.offsetWidth;
        if (ancho <= 0) return false;   // layout todavía no disponible
        anchoVuelta = ancho;
        const necesarias = vueltasParaCubrir(ancho);
        for (let i = 1; i < necesarias; i++) {
            datos.forEach((t) => track.appendChild(generarCard(t)));
        }
        copias = necesarias;
        return true;
    }

    const mediaReducida = window.matchMedia('(prefers-reduced-motion: reduce)');

    let velocidad = 0;       // px por ms
    let offset = 0;          // desplazamiento actual en px (positivo = avanzó hacia la izquierda)
    let t0 = performance.now();
    let arrastrando = false;
    let enReposo = false;    // hover o reduced-motion: no avanza sola
    let dragStartX = 0;
    let dragStartOffset = 0;
    let raf = null;

    function actualizarVelocidad() {
        // 8s por reseña y no por vuelta: el tiempo de una vuelta escala con la
        // cantidad de reseñas, así la velocidad no depende de cuántas copias
        // hubo que agregar para llenar la pantalla.
        velocidad = anchoVuelta / (MS_POR_RESENA * datos.length);
    }

    function render() {
        track.style.transform = `translateX(${-offset}px)`;
    }

    function rebasear(now) {
        // Mantener el offset dentro de [0, anchoVuelta) para el loop seamless
        offset = ((offset % anchoVuelta) + anchoVuelta) % anchoVuelta;
        if (velocidad > 0) t0 = now - offset / velocidad;
    }

    function loop(now) {
        if (!arrastrando && !enReposo) {
            offset = (now - t0) * velocidad;
            if (offset >= anchoVuelta) offset = ((offset % anchoVuelta) + anchoVuelta) % anchoVuelta;
        }
        render();
        raf = requestAnimationFrame(loop);
    }

    viewport.addEventListener('pointerdown', function (e) {
        arrastrando = true;
        dragStartX = e.clientX;
        dragStartOffset = offset;
        viewport.classList.add('arrastrando');
        try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
    });

    viewport.addEventListener('pointermove', function (e) {
        if (!arrastrando) return;
        const delta = e.clientX - dragStartX;
        offset = dragStartOffset - delta;
        render();
    });

    function soltar(e) {
        if (!arrastrando) return;
        arrastrando = false;
        viewport.classList.remove('arrastrando');
        rebasear(performance.now());
    }

    viewport.addEventListener('pointerup', soltar);
    viewport.addEventListener('pointercancel', soltar);

    viewport.addEventListener('pointerenter', function () {
        if (!arrastrando) enReposo = true;
    });
    viewport.addEventListener('pointerleave', function () {
        enReposo = false;
    });

    window.addEventListener('resize', function () {
        // El ancho de las cards está en vw, así que las copias necesarias sólo
        // cambian al cruzar un breakpoint. Si cambian, hay que repoblar; si no,
        // alcanza con recalcular la velocidad.
        const anchoActual = track.offsetWidth / copias;
        if (anchoActual > 0 && vueltasParaCubrir(anchoActual) !== copias) {
            const progreso = anchoVuelta > 0 ? offset / anchoVuelta : 0;   // no saltar de posición
            repoblar();
            offset = progreso * anchoVuelta;
        }
        actualizarVelocidad();
        rebasear(performance.now());
        render();
    });

    if (mediaReducida.matches) {
        enReposo = true; // respetar prefers-reduced-motion: solo drag manual
    }

    repoblar();
    actualizarVelocidad();
    rebasear(performance.now());
    raf = requestAnimationFrame(loop);
});
