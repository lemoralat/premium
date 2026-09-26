// selector-iconos.js — Selector de íconos Tabler reutilizable.
// Milita el buscador + grilla del catálogo curado (ICONOS_TABLER) sobre
// tres elementos del modal que lo declare:
//   - <input type="hidden"> con el valor seleccionado (clase FA completa)
//   - <input type="search"> para filtrar
//   - <div role="listbox"> grilla de opciones
//   - <p> mensaje de "sin resultados"
// Usado por la sección "Iconos" (iconos-pie.js) y por "Preguntas frecuentes".

import { $, esc } from './admin-ui.js';
import { ICONOS_TABLER } from './iconos-tabler.js';

/**
 * Conecta el buscador y la grilla del catálogo con el input oculto.
 *
 * @param {object} opts
 * @param {string} opts.inputId  id del <input type="hidden"> que guarda la clase FA
 * @param {string} opts.buscarId id del <input type="search"> filtro
 * @param {string} opts.grillaId id del <div> que lista las opciones
 * @param {string} opts.vacioId  id del <p> de "sin resultados"
 * @returns {{ render: (filtro?: string) => void }} para re-renderizar a demanda
 */
export function montarSelectorIconos({ inputId, buscarId, grillaId, vacioId }) {
    const input = document.getElementById(inputId);
    const buscar = document.getElementById(buscarId);
    const grilla = document.getElementById(grillaId);
    const vacio = document.getElementById(vacioId);
    if (!input || !buscar || !grilla || !vacio) {
        throw new Error('selector-iconos: faltan elementos del selector.');
    }

    const render = (filtro = '') => {
        const busca = filtro.toLowerCase().trim();
        const lista = busca
            ? ICONOS_TABLER.filter((i) =>
                i.clase.toLowerCase().includes(busca) || i.etiqueta.toLowerCase().includes(busca))
            : ICONOS_TABLER;
        const seleccion = input.value;
        grilla.innerHTML = lista.map((i) => `
            <button type="button" role="option" class="admin-icono-opcion ${i.clase === seleccion ? 'seleccionado' : ''}"
                    data-clase="${esc(i.clase)}" title="${esc(i.etiqueta)}" aria-label="${esc(i.etiqueta)}" aria-selected="${i.clase === seleccion}">
                <i class="${esc(i.clase)}" aria-hidden="true"></i>
            </button>`).join('');
        vacio.hidden = lista.length > 0;
    };

    grilla.addEventListener('click', (event) => {
        const boton = event.target.closest('.admin-icono-opcion');
        if (!boton) return;
        input.value = boton.dataset.clase;
        render(buscar.value);
    });

    buscar.addEventListener('input', () => render(buscar.value));

    render();
    return { render };
}