// Hero Carrusel - Autoplay, Loop, Swipe, Stop on Hover
// Elementos dinámicos desde Supabase (tabla sliders).
// Sin elementos => la sección se mantiene oculta (hidden en el HTML).

import { obtenerCarrusel, recortarTexto, atributosEnlace, escaparHtml, urlSegura, placeholderImagenPublica } from './utils.js';

class CarruselHero {
    constructor() {
        this.currentItem = 0;
        this.items = [];
        this.carrusel = null;
        this.track = null;
        this.autoplayInterval = null;
        this.autoplayDelay = 5000; // 5 segundos
        this.isTransitioning = false;
        this.touchStartX = 0;
        this.touchEndX = 0;

        this.init();
    }

    init() {
        // Esperar a que el DOM esté listo
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    async setup() {
        this.carrusel = document.querySelector('.hero-carrusel');
        if (!this.carrusel || this.eventosVinculados) return;

        // La sección llega oculta del HTML (hidden): solo se muestra con elementos reales.
        // El administrador configura los elementos desde el panel (tabla sliders); sin elementos => []
        // => la sección desaparece por completo (sin estático, sin JSON viejo).
        const datos = await obtenerCarrusel();
        this.datosCompletos = Array.isArray(datos) ? datos : [];

        if (this.datosCompletos.length === 0) {
            this.carrusel.hidden = true;
            return;
        }

        this.eventosVinculados = true;

        // Configurar eventos (el .hero-carrusel es un elemento persistente: se
        // vinculan una sola vez; la reconstrucción solo reemplaza el track).
        this.setupNavigation();
        this.setupAutoplay();
        this.setupTouch();
        this.setupKeyboard();

        // Pintar según dispositivo (móvil ≤ 768px / escritorio) y escuchar
        // cambios de tamaño: el conjunto de elementos visibles puede cambiar y
        // hay que reconstruir el track con el índice inicial en 0.
        this.ultimoEsMovil = this.esMovil();
        this.pintarSegunDispositivo();
        this.registrarResize();
    }

    // ¿El viewport actual es móvil? Mismo breakpoint que css/styles.css.
    esMovil() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    // Un elemento sin `mostrarEn` se muestra en ambos. Ojo: eso sólo cubre el valor
    // ausente; un valor desconocido (por ejemplo 'inventado') no cae en 'ambos'
    // y el elemento no se muestra en ningún breakpoint, con lo que el carrusel entero
    // puede quedar oculto. No se cambia acá porque es semántica de visibilidad
    // y ajena a la navegación; la columna tiene un CHECK que la limita a los
    // tres valores válidos, así que sólo se alcanzaría con datos corruptos.
    esVisibleEnDispositivo(item) {
        const m = (item.mostrarEn || 'ambos').toLowerCase();
        if (m === 'ambos') return true;
        return this.esMovil() ? m === 'mobile' : m === 'desktop';
    }

    // Filtra por dispositivo, reconstruye el track y reinicia el índice.
    pintarSegunDispositivo() {
        const visibles = (this.datosCompletos || []).filter((s) => this.esVisibleEnDispositivo(s));

        if (visibles.length === 0) {
            this.stopAutoplay();
            this.carrusel.hidden = true;
            return;
        }

        this.track = this.carrusel.querySelector('.carrusel-track');
        this.construirItems(visibles);

        this.items = this.carrusel.querySelectorAll('.carrusel-item');
        if (this.items.length === 0) {
            this.carrusel.hidden = true;
            return;
        }

        this.carrusel.hidden = false;
        this.isTransitioning = false;
        this.stopAutoplay();
        this.goToItem(0);
        this.ajustarNav();
    }

    // ¿Se muestran las flechas? Depende del breakpoint, no del total: cada elemento
    // declara su `mostrarEn`, así que con 2 elementos en la base (uno mobile y otro
    // desktop) hay 1 solo visible en cada lado y las flechas sobran igual. Por eso
    // se cuenta lo que quedó pintado, no lo que llegó de la base, y se recalcula
    // en cada repintado, o sea también al cruzar el breakpoint.
    //
    // Con un solo elemento, next/prev hacen loop a sí mismo y el autoplay giraba en
    // vacío cada 5 s, así que también se corta: no hay a dónde navegar.
    ajustarNav() {
        const navegable = this.items.length > 1;
        this.carrusel.classList.toggle('hero-carrusel-unico', !navegable);

        if (navegable) {
            this.startAutoplay();
        } else {
            this.stopAutoplay();
        }
    }

    // Al cruzar el breakpoint (≤768px), repinta con el set que corresponda.
    registrarResize() {
        if (this.resizeVinculado) return;
        this.resizeVinculado = true;

        let timer = null;
        window.addEventListener('resize', () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                const movilAhora = this.esMovil();
                if (movilAhora !== this.ultimoEsMovil) {
                    this.ultimoEsMovil = movilAhora;
                    this.pintarSegunDispositivo();
                }
            }, 200);
        }, { passive: true });
    }

    // Misma estructura de clases que los elementos estáticos del index.html
    construirItems(datos) {
        this.track.innerHTML = datos.map((item, i) => {
            // V-2: texto, imagen y link son contenido administrado → escapar y
            // filtrar esquemas peligrosos antes de interpolar en HTML.
            const titulo = recortarTexto(item.titulo);
            const textoSoporte = recortarTexto(item.textoSoporte);
            const imagen = escaparHtml(item.imagen);
            const link = item.link ? urlSegura(item.link) : '';
            const visual = imagen
                ? `<img src="${imagen}" alt="${escaparHtml(titulo)}" width="1920" height="1280"${i === 0 ? ' fetchpriority="high"' : ''}>`
                : placeholderImagenPublica('carrusel-image-placeholder');

            const contenido = `
                    ${visual}

                    <div class="carrusel-content">
                        <div class="carrusel-text">
                            <h1>${escaparHtml(titulo)}</h1>
                            ${textoSoporte ? `<p>${escaparHtml(textoSoporte)}</p>` : ''}
                        </div>
                    </div>
            `;
            return `
                <div class="carrusel-item${i === 0 ? ' active' : ''}">
                    ${link ? `<a href="${escaparHtml(link)}" ${atributosEnlace(item)} class="carrusel-link">${contenido}</a>` : contenido}
                </div>
            `;
        }).join('');
    }
    
    setupNavigation() {
        const prevBtn = this.carrusel.querySelector('.carrusel-nav.prev');
        const nextBtn = this.carrusel.querySelector('.carrusel-nav.next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevItem());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextItem());
        }
    }
    
    setupAutoplay() {
        // Iniciar autoplay
        this.startAutoplay();
        
        // Pausar en hover
        this.carrusel.addEventListener('mouseenter', () => this.stopAutoplay());
        this.carrusel.addEventListener('mouseleave', () => this.startAutoplay());
        
        // Pausar cuando la pestaña no está visible
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAutoplay();
            } else {
                this.startAutoplay();
            }
        });
    }
    
    setupTouch() {
        // Touch events para móvil
        this.carrusel.addEventListener('touchstart', (e) => {
            this.touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        this.carrusel.addEventListener('touchend', (e) => {
            this.touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        }, { passive: true });
    }
    
    setupKeyboard() {
        // Navegación con teclado
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.prevItem();
            } else if (e.key === 'ArrowRight') {
                this.nextItem();
            }
        });
    }
    
    handleSwipe() {
        const swipeThreshold = 50;
        const diff = this.touchStartX - this.touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // Swipe left - siguiente elemento
                this.nextItem();
            } else {
                // Swipe right - anterior elemento
                this.prevItem();
            }
        }
    }
    
    goToItem(index) {
        if (this.isTransitioning) return;
        
        this.currentItem = index;
        this.isTransitioning = true;
        
        // Calcular offset
        const offset = -index * 100;
        this.track.style.transform = `translateX(${offset}%)`;
        
        // Actualizar elementos activos
        this.items.forEach((item, i) => {
            if (i === index) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Resetear flag después de la transición
        setTimeout(() => {
            this.isTransitioning = false;
        }, 600);
    }
    
    nextItem() {
        // Sin destino: con un solo elemento el loop volvería al mismo. El guard
        // también evita que el teclado y el swipe muevan el flag
        // isTransitioning sin cambiar nada.
        if (this.items.length <= 1) return;

        let next = this.currentItem + 1;
        if (next >= this.items.length) {
            next = 0; // Loop
        }
        this.goToItem(next);
        
        // Reiniciar autoplay
        this.restartAutoplay();
    }
    
    prevItem() {
        // Mismo guard que nextItem().
        if (this.items.length <= 1) return;

        let prev = this.currentItem - 1;
        if (prev < 0) {
            prev = this.items.length - 1; // Loop
        }
        this.goToItem(prev);
        
        // Reiniciar autoplay
        this.restartAutoplay();
    }
    
    startAutoplay() {
        // Con un solo elemento no hay giro. El guard va acá y no sólo en
        // ajustarNav() porque mouseleave y visibilitychange llaman a
        // startAutoplay() directo: sin esto volvían a levantar el intervalo en
        // vacío después de que ajustarNav() lo cortara.
        if (this.items.length <= 1) return;

        this.stopAutoplay(); // Limpiar cualquier intervalo anterior
        this.autoplayInterval = setInterval(() => {
            this.nextItem();
        }, this.autoplayDelay);
    }
    
    stopAutoplay() {
        if (this.autoplayInterval) {
            clearInterval(this.autoplayInterval);
            this.autoplayInterval = null;
        }
    }
    
    restartAutoplay() {
        this.stopAutoplay();
        this.startAutoplay();
    }
}

// Inicializar el carrusel
const carruselHero = new CarruselHero();