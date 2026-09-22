// iconos-pie.js — CRUD de los iconos de confianza del pie del home.
// Cada icono se representa o bien con una imagen (archivo subido o URL) o bien
// con un ícono de Font Awesome elegido de un catálogo curado con buscador.

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { ICONOS_FONT_AWESOME } from './iconos-fa.js';

let iconos = [];

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('iconos_pie').select('*').order('position', { ascending: true });
    if (error) throw error;
    iconos = data || [];

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Iconos que se muestran antes del footer en el inicio</p>
            <button type="button" class="btn btn-primary" id="btnNuevoIcono">
                <i class="fa-solid fa-plus"></i> Nuevo icono
            </button>
        </div>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Icono</th><th>Descripción</th><th>Orden</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    $('#btnNuevoIcono').addEventListener('click', () => abrirModalIcono(null));
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalIcono(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarIcono(Number(btn.dataset.borrar), contenedor));
    });
}

function filas() {
    if (!iconos.length) {
        return `<tr><td colspan="5"><div class="admin-empty"><p>No hay iconos.</p></div></td></tr>`;
    }
    return iconos.map((i) => `
        <tr>
            <td class="td-principal">
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    ${i.icono
                        ? `<span class="admin-icono-mini"><i class="${esc(i.icono)}" aria-hidden="true"></i></span>`
                        : `<img src="${esc(urlPublica(i.storage_path || i.external_url || ''))}" alt=""
                             style="width:34px; height:34px; object-fit:contain; border:1px solid var(--border); background:#fff; flex-shrink:0;">`}
                    <strong>${esc(i.titulo)}</strong>
                </div>
            </td>
            <td data-label="Descripción">${esc(i.descripcion || '')}</td>
            <td data-label="Orden">${esc(i.position ?? 0)}</td>
            <td data-label="Estado">${i.activo
                ? '<span class="estado-badge estado-entregado">Activo</span>'
                : '<span class="estado-badge estado-cancelado">Inactivo</span>'}</td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(i.id)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(i.id)}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function abrirModalIcono(idExistente) {
    const icono = idExistente ? iconos.find((i) => i.id === idExistente) : null;
    const modoInicial = icono?.icono ? 'icono' : 'imagen';

    abrirModal(`
        <h2>${icono ? 'Editar icono' : 'Nuevo icono'}</h2>
        <p class="modal-sub">${icono ? esc(icono.titulo) : 'Icono de confianza para el inicio (imagen o ícono, título y descripción)'}</p>
        <form class="admin-form" id="iconoForm">
            <input type="hidden" id="icoId" value="${icono ? icono.id : ''}">
            <input type="hidden" id="icoIcono" value="${esc(icono?.icono || '')}">

            <div class="admin-field full">
                <label>Tipo de visual</label>
                <div class="admin-seg" id="icoSeg" role="group" aria-label="Tipo de visual del icono">
                    <button type="button" class="admin-seg-btn ${modoInicial === 'imagen' ? 'activo' : ''}" data-modo="imagen" aria-pressed="${modoInicial === 'imagen'}">
                        <i class="fa-solid fa-image"></i> Imagen
                    </button>
                    <button type="button" class="admin-seg-btn ${modoInicial === 'icono' ? 'activo' : ''}" data-modo="icono" aria-pressed="${modoInicial === 'icono'}">
                        <i class="fa-solid fa-icons"></i> Ícono FontAwesome
                    </button>
                </div>
            </div>

            <div class="admin-field full" id="seccionImagen" ${modoInicial === 'icono' ? 'hidden' : ''}>
                <label>Imagen</label>
                <div class="admin-img-upload">
                    <img src="${esc(urlPublica(icono && !icono.icono ? (icono.storage_path || icono.external_url || '') : ''))}" alt=""
                         id="icoPreview" style="width:64px; height:64px; object-fit:contain; border:1px solid var(--border); background:#fff;">
                    <label class="btn btn-outline admin-file-btn">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Elegir imagen
                        <input type="file" id="icoArchivo" accept="image/jpeg,image/png,image/webp">
                    </label>
                    <input type="url" id="icoUrl" class="admin-url-input" placeholder="…o pegá una URL de imagen"
                           value="${esc(icono && !icono.icono && !icono?.storage_path ? (icono.external_url || '') : '')}">
                </div>
            </div>

            <div class="admin-field full" id="seccionIcono" ${modoInicial === 'icono' ? '' : 'hidden'}>
                <label for="icoBuscar">Ícono FontAwesome</label>
                <input type="search" id="icoBuscar" class="admin-url-input" placeholder="Buscar ícono… (ej. camión, escudo, tarjeta)">
                <div class="admin-iconos-grid" id="icoGrilla" role="listbox" aria-label="Catálogo de íconos"></div>
                <p class="admin-icono-vacio" id="icoVacio" hidden>Sin resultados. Probá con otra palabra.</p>
                <span class="hint">Catálogo curado con los íconos más usados en una tienda. Buscá en español o inglés (ej. truck).</span>
            </div>

            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="icoTitulo">Título <span style="color:var(--danger);">*</span></label>
                    <input type="text" id="icoTitulo" required value="${esc(icono?.titulo || '')}">
                    <span class="hint">Obligatorio. Se muestra como encabezado del icono.</span>
                </div>
                <div class="admin-field">
                    <label for="icoPosition">Orden</label>
                    <input type="number" id="icoPosition" min="0" step="1" value="${esc(icono?.position ?? (iconos.length + 1))}">
                </div>
                <div class="admin-field full">
                    <label for="icoDescripcion">Descripción</label>
                    <textarea id="icoDescripcion">${esc(icono?.descripcion || '')}</textarea>
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="icoActivo" ${icono?.activo === false ? '' : 'checked'}>
                        Icono activo (visible en la tienda)
                    </label>
                </div>
            </div>

            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    // Modo de visual: Imagen ⇄ Ícono FontAwesome
    const setModo = (modo) => {
        $('#icoSeg').querySelectorAll('.admin-seg-btn').forEach((b) => {
            const activo = b.dataset.modo === modo;
            b.classList.toggle('activo', activo);
            b.setAttribute('aria-pressed', String(activo));
        });
        $('#seccionImagen').hidden = modo !== 'imagen';
        $('#seccionIcono').hidden = modo !== 'icono';
        if (modo === 'icono') renderGrillaIconos($('#icoBuscar').value);
    };
    $('#icoSeg').addEventListener('click', (event) => {
        const boton = event.target.closest('.admin-seg-btn');
        if (!boton) return;
        setModo(boton.dataset.modo);
    });

    // Grilla de íconos del catálogo curado (más buscador en español/inglés)
    const renderGrillaIconos = (filtro = '') => {
        const busca = filtro.toLowerCase().trim();
        const lista = busca
            ? ICONOS_FONT_AWESOME.filter((i) =>
                i.clase.toLowerCase().includes(busca) || i.etiqueta.toLowerCase().includes(busca))
            : ICONOS_FONT_AWESOME;
        const seleccion = $('#icoIcono').value;
        $('#icoGrilla').innerHTML = lista.map((i) => `
            <button type="button" role="option" class="admin-icono-opcion ${i.clase === seleccion ? 'seleccionado' : ''}"
                    data-clase="${esc(i.clase)}" title="${esc(i.etiqueta)}" aria-label="${esc(i.etiqueta)}" aria-selected="${i.clase === seleccion}">
                <i class="${esc(i.clase)}" aria-hidden="true"></i>
            </button>`).join('');
        $('#icoVacio').hidden = lista.length > 0;
    };
    $('#icoGrilla').addEventListener('click', (event) => {
        const boton = event.target.closest('.admin-icono-opcion');
        if (!boton) return;
        $('#icoIcono').value = boton.dataset.clase;
        renderGrillaIconos($('#icoBuscar').value);
    });
    $('#icoBuscar').addEventListener('input', () => renderGrillaIconos($('#icoBuscar').value));
    renderGrillaIconos();

    $('#icoArchivo').addEventListener('change', async () => {
        const archivo = $('#icoArchivo').files[0];
        if (!archivo) return;
        try {
            const lista = await validarYOptimizarImagen(archivo);
            $('#icoPreview').src = URL.createObjectURL(lista && lista.size ? lista : archivo);
        } catch (error) { toast(error.message, 'error'); $('#icoArchivo').value = ''; }
    });

    $('#iconoForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#iconoForm').querySelector('[type="submit"]');

        const idValor = $('#icoId').value;
        const modo = $('#icoSeg').querySelector('.admin-seg-btn.activo').dataset.modo;

        const archivo = $('#icoArchivo').files[0];
        const urlExterna = $('#icoUrl').value.trim();
        if (modo === 'imagen' && archivo && urlExterna) {
            toast('Elegí una sola fuente de imagen: archivo o URL.', 'error');
            return;
        }

        const titulo = $('#icoTitulo').value.trim();
        if (!titulo) {
            toast('El título es obligatorio.', 'error');
            return;
        }

        const iconoClase = $('#icoIcono').value.trim();
        if (modo === 'icono' && !iconoClase) {
            toast('Elegí un ícono del catálogo.', 'error');
            return;
        }

        const payload = {
            titulo,
            descripcion: $('#icoDescripcion').value.trim(),
            position: parseInt($('#icoPosition').value) || 0,
            activo: $('#icoActivo').checked,
            icono: modo === 'icono' ? iconoClase : null
        };

        conCarga(submitBtn, guardarIcono(payload, idValor ? Number(idValor) : null, modo, archivo, urlExterna))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarIcono(payload, id, modo, archivo, urlExterna) {
    const sb = await clienteAdmin();
    const previo = id ? iconos.find((i) => i.id === id) : null;

    let registroId = id;
    if (id) {
        const { error } = await sb.from('iconos_pie').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { data, error } = await sb.from('iconos_pie').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        registroId = data?.id;
    }

    // Fuente de la visual según el modo elegido.
    if (modo === 'imagen') {
        if (archivo || urlExterna) {
            const actualizacion = {};
            if (archivo) {
                actualizacion.storage_path = await subirImagenAdmin('iconos', 'iconos', archivo);
                actualizacion.external_url = null;
            } else {
                actualizacion.storage_path = null;
                actualizacion.external_url = urlExterna;
            }
            const { error } = await sb.from('iconos_pie').update(actualizacion).eq('id', registroId);
            if (error) throw new Error(error.message);
            if (archivo && previo?.storage_path) await eliminarImagenAdmin(previo.storage_path);
        }
    } else if (previo?.storage_path || previo?.external_url) {
        // Al pasar a ícono se limpia la fuente de imagen anterior.
        const { error } = await sb.from('iconos_pie').update({ storage_path: null, external_url: null }).eq('id', registroId);
        if (error) throw new Error(error.message);
        if (previo?.storage_path) await eliminarImagenAdmin(previo.storage_path);
    }

    toast(id ? 'Icono actualizado.' : 'Icono creado.');
}

async function borrarIcono(id, contenedor) {
    if (!(await confirmarBorrado('¿Eliminar este icono?'))) return;
    const sb = await clienteAdmin();
    const icono = iconos.find((i) => i.id === id);
    const { error } = await sb.from('iconos_pie').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    if (icono?.storage_path) await eliminarImagenAdmin(icono.storage_path);
    toast('Icono eliminado.');
    renderizar(contenedor);
}