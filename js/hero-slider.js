// Hero Slider - Autoplay, Loop, Swipe, Stop on Hover
// Slides dinámicos desde la hoja "Slider" (js/slider.json).
// Sin slides => la sección se mantiene oculta (hidden en el HTML).

import { obtenerSlider, recortarTexto, imagenOptimizada } from './utils.js';

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
        if (!this.slider) return;

        // La sección llega oculta del HTML (hidden): solo se muestra con slides reales.
        // El administrador decide desde la hoja "Slider": hoja vacía => slider.json con []
        // => la sección desaparece por completo (sin estático, sin JSON viejo).
        const datos = await obtenerSlider();

        if (!Array.isArray(datos) || datos.length === 0) {
            this.slider.hidden = true;
            return;
        }

        this.track = this.slider.querySelector('.slider-track');
        this.construirSlides(datos);

        this.slides = this.slider.querySelectorAll('.slider-slide');

        if (this.slides.length === 0) {
            this.slider.hidden = true;
            return;
        }

        this.slider.hidden = false;

        // Configurar eventos
        this.setupNavigation();
        this.setupAutoplay();
        this.setupTouch();
        this.setupKeyboard();

        // Mostrar primer slide
        this.goToSlide(0);
    }

    // Misma estructura de clases que los slides estáticos del index.html
    construirSlides(datos) {
        this.track.innerHTML = datos.map((slide, i) => {
            const contenido = `
                    <img src="${imagenOptimizada(slide.imagen)}" alt="${slide.titulo}" width="1920" height="1280"${i === 0 ? ' fetchpriority="high"' : ''}>

                    <div class="slider-content">
                        <div class="slider-text">
                            <h1>${recortarTexto(slide.titulo)}</h1>
                            ${slide.textoSoporte ? `<p>${recortarTexto(slide.textoSoporte, 120)}</p>` : ''}
                        </div>
                    </div>
            `;
            return `
                <div class="slider-slide${i === 0 ? ' active' : ''}">
                    ${slide.link ? `<a href="${slide.link}" target="_self" class="slider-link">${contenido}</a>` : contenido}
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