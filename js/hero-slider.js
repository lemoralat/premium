// Hero Slider - Autoplay, Loop, Swipe, Stop on Hover
// Slides dinámicos desde Supabase (tabla slider).
// Sin slides => la sección se mantiene oculta (hidden en el HTML).

import { obtenerSlider, recortarTexto, imagenOptimizada, atributosEnlace, escaparHtml, urlSegura, placeholderImagenPublica } from './utils.js';

class HeroSlider {
    constructor() {
        this.currentSlide = 0;
        this.slides = [];
        this.slider = null;
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
        this.slider = document.querySelector('.hero-slider');
        if (!this.slider || this.eventosVinculados) return;

        // La sección llega oculta del HTML (hidden): solo se muestra con slides reales.
        // El administrador configura los slides desde el panel (tabla slider); sin slides => []
        // => la sección desaparece por completo (sin estático, sin JSON viejo).
        const datos = await obtenerSlider();
        this.datosCompletos = Array.isArray(datos) ? datos : [];

        if (this.datosCompletos.length === 0) {
            this.slider.hidden = true;
            return;
        }

        this.eventosVinculados = true;

        // Configurar eventos (el .hero-slider es un elemento persistente: se
        // vinculan una sola vez; la reconstrucción solo reemplaza el track).
        this.setupNavigation();
        this.setupAutoplay();
        this.setupTouch();
        this.setupKeyboard();

        // Pintar según dispositivo (móvil ≤ 768px / escritorio) y escuchar
        // cambios de tamaño: el conjunto de slides visibles puede cambiar y
        // hay que reconstruir el track con el índice inicial en 0.
        this.ultimoEsMovil = this.esMovil();
        this.pintarSegunDispositivo();
        this.registrarResize();
    }

    // ¿El viewport actual es móvil? Mismo breakpoint que css/styles.css.
    esMovil() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    // Un slide sin `mostrarEn` (o con valor desconocido) se muestra en ambos.
    esVisibleEnDispositivo(slide) {
        const m = (slide.mostrarEn || 'ambos').toLowerCase();
        if (m === 'ambos') return true;
        return this.esMovil() ? m === 'mobile' : m === 'desktop';
    }

    // Filtra por dispositivo, reconstruye el track y reinicia el índice.
    pintarSegunDispositivo() {
        const visibles = (this.datosCompletos || []).filter((s) => this.esVisibleEnDispositivo(s));

        if (visibles.length === 0) {
            this.stopAutoplay();
            this.slider.hidden = true;
            return;
        }

        this.track = this.slider.querySelector('.slider-track');
        this.construirSlides(visibles);

        this.slides = this.slider.querySelectorAll('.slider-slide');
        if (this.slides.length === 0) {
            this.slider.hidden = true;
            return;
        }

        this.slider.hidden = false;
        this.isTransitioning = false;
        this.stopAutoplay();
        this.goToSlide(0);
        this.startAutoplay();
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

    // Misma estructura de clases que los slides estáticos del index.html
    construirSlides(datos) {
        this.track.innerHTML = datos.map((slide, i) => {
            // V-2: texto, imagen y link son contenido administrado → escapar y
            // filtrar esquemas peligrosos antes de interpolar en HTML.
            const titulo = recortarTexto(slide.titulo);
            const textoSoporte = recortarTexto(slide.textoSoporte);
            const imagen = escaparHtml(imagenOptimizada(slide.imagen));
            const link = slide.link ? urlSegura(slide.link) : '';
            const visual = imagen
                ? `<img src="${imagen}" alt="${escaparHtml(titulo)}" width="1920" height="1280"${i === 0 ? ' fetchpriority="high"' : ''}>`
                : placeholderImagenPublica('slider-image-placeholder');

            const contenido = `
                    ${visual}

                    <div class="slider-content">
                        <div class="slider-text">
                            <h1>${escaparHtml(titulo)}</h1>
                            ${textoSoporte ? `<p>${escaparHtml(textoSoporte)}</p>` : ''}
                        </div>
                    </div>
            `;
            return `
                <div class="slider-slide${i === 0 ? ' active' : ''}">
                    ${link ? `<a href="${escaparHtml(link)}" ${atributosEnlace(slide)} class="slider-link">${contenido}</a>` : contenido}
                </div>
            `;
        }).join('');
    }
    
    setupNavigation() {
        const prevBtn = this.slider.querySelector('.slider-nav.prev');
        const nextBtn = this.slider.querySelector('.slider-nav.next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevSlide());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextSlide());
        }
    }
    
    setupAutoplay() {
        // Iniciar autoplay
        this.startAutoplay();
        
        // Pausar en hover
        this.slider.addEventListener('mouseenter', () => this.stopAutoplay());
        this.slider.addEventListener('mouseleave', () => this.startAutoplay());
        
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
        this.slider.addEventListener('touchstart', (e) => {
            this.touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        this.slider.addEventListener('touchend', (e) => {
            this.touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        }, { passive: true });
    }
    
    setupKeyboard() {
        // Navegación con teclado
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.prevSlide();
            } else if (e.key === 'ArrowRight') {
                this.nextSlide();
            }
        });
    }
    
    handleSwipe() {
        const swipeThreshold = 50;
        const diff = this.touchStartX - this.touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // Swipe left - next slide
                this.nextSlide();
            } else {
                // Swipe right - prev slide
                this.prevSlide();
            }
        }
    }
    
    goToSlide(index) {
        if (this.isTransitioning) return;
        
        this.currentSlide = index;
        this.isTransitioning = true;
        
        // Calcular offset
        const offset = -index * 100;
        this.track.style.transform = `translateX(${offset}%)`;
        
        // Actualizar slides activos
        this.slides.forEach((slide, i) => {
            if (i === index) {
                slide.classList.add('active');
            } else {
                slide.classList.remove('active');
            }
        });
        
        // Resetear flag después de la transición
        setTimeout(() => {
            this.isTransitioning = false;
        }, 600);
    }
    
    nextSlide() {
        let next = this.currentSlide + 1;
        if (next >= this.slides.length) {
            next = 0; // Loop
        }
        this.goToSlide(next);
        
        // Reiniciar autoplay
        this.restartAutoplay();
    }
    
    prevSlide() {
        let prev = this.currentSlide - 1;
        if (prev < 0) {
            prev = this.slides.length - 1; // Loop
        }
        this.goToSlide(prev);
        
        // Reiniciar autoplay
        this.restartAutoplay();
    }
    
    startAutoplay() {
        this.stopAutoplay(); // Limpiar cualquier intervalo anterior
        this.autoplayInterval = setInterval(() => {
            this.nextSlide();
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

// Inicializar el slider
const heroSlider = new HeroSlider();