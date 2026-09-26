// cupones.js — CRUD de cupones de descuento.

import { $, esc, toast, confirmarBorrado, conCarga, abrirModal, cerrarModal, estadoCargando, fechaInput } from './admin-ui.js';
import { clienteAdmin } from './admin-supabase.js';

let cupones = [];
export let cuponesCargados = false;

export async function renderizar(contenedor) {
    estadoCargando(contenedor);
    const sb = await clienteAdmin();

    const [rCupones, rSettings] = await Promise.all([
        sb.from('coupons').select('*').order('id', { ascending: true }),
        sb.from('settings').select('*').eq('id', 1).single()
    ]);
    if (rCupones.error) throw rCupones.error;
    if (rSettings.error) throw rSettings.error;
    cupones = rCupones.data || [];
    cuponesCargados = true;
    const s = rSettings.data;
    // Compra mínima DUAL: cantidad de productos y monto, ambas acumulables
    // (0 = regla inactiva).
    const minCantidad = Math.max(0, Math.floor(Number(s.compra_minima_cantidad) || 0));
    const minMonto = Math.max(0, Number(s.compra_minima_monto) || 0);

    contenedor.innerHTML = `
        <div class="admin-card">
            <h2>Descuentos automáticos</h2>
            <p class="card-sub">Se aplican sobre el total del carrito y se recalculan en el servidor al confirmar el pedido.</p>
            <form class="admin-form" id="formDescuentosAuto">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cfgUmbral">Umbral para descuento automático ($)</label>
                        <input type="number" id="cfgUmbral" min="0" step="1000" value="${esc(s.discount_threshold || '')}">
                        <span class="hint">Compras desde este monto obtienen descuento.</span>
                    </div>
                    <div class="admin-field">
                        <label for="cfgPorcentaje">Porcentaje de descuento automático (%)</label>
                        <input type="number" id="cfgPorcentaje" min="1" max="100" step="1" value="${esc(s.discount_percent || '')}">
                    </div>
                </div>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>
        <div class="admin-card">
            <h2>Compra mínima</h2>
            <p class="card-sub">La tienda exige un mínimo antes de finalizar. Podés combinar cantidad de productos y monto: cada regla se activa con un valor mayor a 0 y se aplican JUNTAS. El servidor las vuelve a validar al registrar el pedido.</p>
            <form class="admin-form" id="formCompraMinima">
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label for="cmpCantidad">Cantidad mínima de productos</label>
                        <input type="number" id="cmpCantidad" min="0" step="1" value="${esc(minCantidad)}">
                        <span class="hint">0 = sin mínimo de unidades.</span>
                    </div>
                    <div class="admin-field">
                        <label for="cmpMonto">Monto mínimo ($)</label>
                        <input type="number" id="cmpMonto" min="0" step="1000" value="${esc(minMonto)}">
                        <span class="hint">0 = sin mínimo de monto.</span>
                    </div>
                </div>
                <p class="hint" id="cmpResumen">${resumenMin(minCantidad, minMonto)}</p>
                <div class="admin-modal-acciones">
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>
        <div class="admin-toolbar">
            <p>Códigos de descuento manuales</p>
            <button type="button" class="btn btn-primary" id="btnNuevoCupon">
                <i class="ti ti-plus"></i> Nuevo cupón
            </button>
        </div>
        <div class="admin-tabla-wrap">
            <table class="admin-tabla">
                <thead>
                    <tr><th>Código</th><th>Descuento</th><th>Vence</th><th>Vigencia</th><th></th></tr>
                </thead>
                <tbody>${filas()}</tbody>
            </table>
        </div>
    `;

    $('#formDescuentosAuto').addEventListener('submit', async (event) => {
        event.preventDefault();
        conCarga(event.submitter, guardarDescuentos({
            discount_threshold: parseFloat($('#cfgUmbral').value) || 0,
            discount_percent: parseFloat($('#cfgPorcentaje').value) || 0
        }))
            .then(() => toast('Descuentos automáticos guardados.'))
            .catch((error) => toast(error.message, 'error'));
    });

    // Compra mínima DUAL: cantidad y monto, ambas reglas acumulables. El
    // resumen de estado se actualiza al tipear; 0 = regla desactivada.
    const inputCantidad = $('#cmpCantidad');
    const inputMonto = $('#cmpMonto');
    const resumenEl = $('#cmpResumen');
    const actualizarResumenMin = () => {
        const c = Math.max(0, Math.floor(Number(inputCantidad.value) || 0));
        const m = Math.max(0, Number(inputMonto.value) || 0);
        resumenEl.textContent = resumenMin(c, m);
    };
    inputCantidad.addEventListener('input', actualizarResumenMin);
    inputMonto.addEventListener('input', actualizarResumenMin);

    $('#formCompraMinima').addEventListener('submit', async (event) => {
        event.preventDefault();
        const cantidad = Math.max(0, Math.floor(Number(inputCantidad.value) || 0));
        const monto = Math.max(0, Number(inputMonto.value) || 0);
        conCarga(event.submitter, guardarCompraMinima({
            compra_minima_cantidad: cantidad,
            compra_minima_monto: monto
        }))
            .then(() => toast('Compra mínima guardada.'))
            .catch((error) => toast(error.message, 'error'));
    });

    $('#btnNuevoCupon').addEventListener('click', () => abrirModalCupon(null));
    contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalCupon(Number(btn.dataset.editar)));
    });
    contenedor.querySelectorAll('[data-borrar]').forEach((btn) => {
        btn.addEventListener('click', () => borrarCupon(Number(btn.dataset.borrar), contenedor));
    });
}

function filas() {
    if (!cupones.length) {
        return `<tr><td colspan="5"><div class="admin-empty"><p>No hay cupones todavía.</p></div></td></tr>`;
    }
    const hoy = new Date().toISOString().slice(0, 10);
    return cupones.map((c) => {
        const vencido = c.expira < hoy;
        return `
        <tr>
            <td data-label="Código"><strong>${esc(c.codigo)}</strong></td>
            <td data-label="Descuento">${esc(c.porcentaje)}%</td>
            <td data-label="Vence">${esc(fechaInput(c.expira))}</td>
            <td data-label="Vigencia">
                ${!c.activo
                    ? '<span class="estado-badge estado-cancelado">Inactivo</span>'
                    : vencido
                        ? '<span class="estado-badge estado-pendiente">Vencido</span>'
                        : '<span class="estado-badge estado-entregado">Vigente</span>'}
            </td>
            <td class="td-acciones">
                <button type="button" class="btn btn-sm" data-editar="${esc(c.id)}"><i class="ti ti-edit"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-borrar="${esc(c.id)}"><i class="ti ti-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function abrirModalCupon(idExistente) {
    const cupon = idExistente ? cupones.find((c) => c.id === idExistente) : null;

    abrirModal(`
        <h2>${cupon ? 'Editar cupón' : 'Nuevo cupón'}</h2>
        <p class="modal-sub">${cupon ? esc(cupon.codigo) : 'Creá un código de descuento para tus clientes'}</p>
        <form class="admin-form" id="cuponForm">
            <input type="hidden" id="cpnId" value="${cupon ? cupon.id : ''}">
            <div class="admin-form-grid">
                <div class="admin-field">
                    <label for="cpnCodigo">Código</label>
                    <input type="text" id="cpnCodigo" required value="${esc(cupon?.codigo || '')}"
                           placeholder="ej: VERANO25" style="text-transform:uppercase;">
                </div>
                <div class="admin-field">
                    <label for="cpnPorcentaje">Porcentaje de descuento (%)</label>
                    <input type="number" id="cpnPorcentaje" required min="1" max="100" step="1"
                           value="${esc(cupon?.porcentaje ?? '')}" placeholder="ej: 10">
                </div>
                <div class="admin-field">
                    <label for="cpnExpira">Fecha de vencimiento</label>
                    <input type="date" id="cpnExpira" required value="${esc(cupon ? fechaInput(cupon.expira) : '')}">
                </div>
                <div class="admin-field full">
                    <label class="admin-check">
                        <input type="checkbox" id="cpnActivo" ${cupon?.activo === false ? '' : 'checked'}>
                        Cupón activo
                    </label>
                </div>
            </div>
            <div class="admin-modal-acciones">
                <button type="button" class="btn" onclick="document.querySelector('#adminModal [data-cerrar-modal]').click()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
    `);

    $('#cuponForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter;
        const codigo = $('#cpnCodigo').value.trim().toUpperCase();
        const porcentaje = parseInt($('#cpnPorcentaje').value);
        const expira = $('#cpnExpira').value;

        if (!codigo || !porcentaje || !expira) {
            toast('Completá código, porcentaje y vencimiento.', 'error');
            return;
        }
        if (porcentaje < 1 || porcentaje > 100) {
            toast('El porcentaje debe estar entre 1 y 100.', 'error');
            return;
        }

        const id = $('#cpnId').value;
        conCarga(submitBtn, guardarCupon({ codigo, porcentaje, expira, activo: $('#cpnActivo').checked }, id ? Number(id) : null))
            .then(() => { cerrarModal(); renderizar($('#adminView')); })
            .catch((error) => toast(error.message, 'error'));
    });
}

async function guardarCupon(payload, id) {
    const sb = await clienteAdmin();
    const { error } = id
        ? await sb.from('coupons').update(payload).eq('id', id)
        : await sb.from('coupons').insert(payload);
    if (error) throw new Error(error.message);
    toast(id ? 'Cupón actualizado.' : 'Cupón creado.');
}

async function guardarDescuentos(payload) {
    const sb = await clienteAdmin();
    const { error } = await sb.from('settings').update(payload).eq('id', 1);
    if (error) throw new Error(error.message);
}

// Texto de estado de la compra mínima (ambas reglas acumulables).
function resumenMin(cantidad, monto) {
    if (!cantidad && !monto) {
        return 'Desactivada: el cliente puede comprar cualquier cantidad y monto.';
    }
    const partes = [];
    if (cantidad) partes.push(`${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}`);
    if (monto) partes.push(`$${monto.toLocaleString('es-AR')}`);
    return 'La tienda exige: ' + partes.join(' y ') + '.';
}

async function guardarCompraMinima(payload) {
    const sb = await clienteAdmin();
    const { error } = await sb.from('settings').update(payload).eq('id', 1);
    if (error) throw new Error(error.message);
}

async function borrarCupon(id, contenedor) {
    if (!(await confirmarBorrado('¿Eliminar este cupón?'))) return;
    const sb = await clienteAdmin();
    const { error } = await sb.from('coupons').delete().eq('id', id);
    if (error) {
        toast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }
    toast('Cupón eliminado.');
    renderizar(contenedor);
}