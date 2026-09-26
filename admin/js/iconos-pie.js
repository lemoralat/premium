// iconos-pie.js — CRUD de los iconos de confianza del pie del home.
// Cada icono se representa o bien con una imagen (archivo subido o URL) o bien
// con un ícono de Font Awesome elegido de un catálogo curado con buscador.

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, urlPublica, validarYOptimizarImagen, subirImagenAdmin, eliminarImagenAdmin, placeholderImagen, mostrarPreviewImagen, LIMITES_IMAGEN } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';
import { montarSelectorIconos } from './selector-iconos.js';

let iconos = [];

// Tope de iconos. La garantía real está en la BD (trigger
// trg_iconos_pie_max, migración 0040): esto es la parte amable, que evita que el
// admin llegue al error.
//
// El 3 no es un número arbitrario: el bloque del pie es un grid de tres
// columnas (css/styles.css → `.iconos { grid-template-columns: repeat(3, 1fr) }`).
// Con 4 iconos el cuarto cae a una segunda fila y deja dos huecos, así que se
// ve roto. En móvil el grid pasa a una columna y se apila bien, pero el tope
// responde a cómo se ve en escritorio.
const MAX_ICONOS = 3;

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const { data, error } = await sb.from('iconos_pie').select('*').order('position', { ascending: true });
    if (error) throw error;
    iconos = data || [];

    // El botón se apaga al llegar al tope. `iconos` se relee en cada
    // renderizado, así que el estado nunca queda desfasado tras un borrado.
    const alTope = iconos.length >= MAX_ICONOS;
    const quedan = MAX_ICONOS - iconos.length;

    contenedor.innerHTML = `
        <div class="admin-toolbar">
            <p>Iconos que se muestran antes del footer en el inicio</p>
            <button type="button" class="btn btn-primary" id="btnNuevoIcono" ${alTope ? 'disabled title="Límite alcanzado"' : ''}>
                <i class="fa-solid fa-plus"></i> Nuevo icono
            </button>
        </div>
        <p class="hint">Máximo ${MAX_ICONOS} iconos, uno por columna del bloque. ${alTope
            ? 'Límite alcanzado: borrá alguno para crear otro (desactivar no libera lugar).'
            : `Te quedan ${quedan}.`}</p>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Icono</th><th>Descripción</th><th>Orden</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    if (!alTope) {
        $('#btnNuevoIcono').addEventListener('click', () => abrirModalIcono(null));
    }
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalIcono(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarIcono(Number(btn.dataset.borrar), contenedor));
    });
}

function imagenIconoHtml(icono) {
    const imagen = urlPublica(icono.storage_path || '');
    return imagen
        ? `<img src="${esc(imagen)}" alt="" style="width:34px; height:34px; object-fit:contain; border:1px solid var(--border); background:#fff; flex-shrink:0;">`
        : placeholderImagen('admin-image-placeholder--icon', 'Sin imagen');
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
                        : imagenIconoHtml(i)}
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
    let imagenOptimizada = null;

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
                    <div id="icoPreview" class="admin-preview admin-preview--icon">
                        ${icono && !icono.icono && icono.storage_path
                            ? `<img class="admin-preview-image" src="${esc(urlPublica(icono.storage_path))}" alt="">`
                            : placeholderImagen('', 'Sin imagen')}
                    </div>
                    <label class="btn btn-outline admin-file-btn">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Elegir imagen
                        <input type="file" id="icoArchivo" accept="image/jpeg,image/png,image/webp">
                    </label>
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
        if (modo === 'icono') selectorIconos.render($('#icoBuscar').value);
    };
    $('#icoSeg').addEventListener('click', (event) => {
        const boton = event.target.closest('.admin-seg-btn');
        if (!boton) return;
        setModo(boton.dataset.modo);
    });

    // Selector de íconos del catálogo curado (buscador + grilla), compartido
    // con la sección "Preguntas frecuentes" vía admin/js/selector-iconos.js.
    const selectorIconos = montarSelectorIconos({
        inputId: 'icoIcono',
        buscarId: 'icoBuscar',
        grillaId: 'icoGrilla',
        vacioId: 'icoVacio'
    });

    $('#icoArchivo').addEventListener('change', async () => {
        const archivo = $('#icoArchivo').files[0];
        if (!archivo) return;
        try {
            const lista = await validarYOptimizarImagen(archivo, { maxLado: LIMITES_IMAGEN.icono });
            imagenOptimizada = lista;
            mostrarPreviewImagen($('#icoPreview'), URL.createObjectURL(lista), 'Vista previa de la imagen');
        } catch (error) { toast(error.message, 'error'); $('#icoArchivo').value = ''; }
    });

    $('#iconoForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter || $('#iconoForm').querySelector('[type="submit"]');

        const idValor = $('#icoId').value;
        const modo = $('#icoSeg').querySelector('.admin-seg-btn.activo').dataset.modo;

        // `idValor` vacío = icono nuevo. El botón ya viene deshabilitado en el
        // tope, pero si el panel está abierto en dos pestañas el `iconos` de
        // esta quedó viejo: el trigger de 0040 lo rechaza igual, esto sólo
        // evita que el error llegue como toast de servidor.
        if (!idValor && iconos.length >= MAX_ICONOS) {
            toast(`El pie admite máximo ${MAX_ICONOS} iconos.`, 'error');
            return;
        }

        const archivo = imagenOptimizada;

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

        conCarga(submitBtn, guardarIcono(payload, idValor ? Number(idValor) : null, modo, archivo))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarIcono(payload, id, modo, archivo) {
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
        if (archivo) {
            const { error } = await sb.from('iconos_pie')
                .update({ storage_path: await subirImagenAdmin('iconos', 'iconos', archivo) })
                .eq('id', registroId);
            if (error) throw new Error(error.message);
            if (previo?.storage_path) await eliminarImagenAdmin(previo.storage_path);
        }
    } else if (previo?.storage_path) {
        // Al pasar a ícono se limpia la imagen anterior.
        const { error } = await sb.from('iconos_pie').update({ storage_path: null }).eq('id', registroId);
        if (error) throw new Error(error.message);
        await eliminarImagenAdmin(previo.storage_path);
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