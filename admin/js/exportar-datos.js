export async function importarProductosCSV(file) {
    const sb = await clienteAdmin();
    const text = await file.text();
    const [encabezado, ...rest] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const cols = encabezado.split(SEP).map((x) => x.replace(/^"|"$/g, '').trim().toLowerCase());

    const map = {};
    ['id', 'nombre', 'categoria', 'precio', 'precio_anterior', 'stock', 'destacado', 'activo', 'descripcion', 'descripcion_detallada'].forEach((k) => {
        const i = cols.indexOf(k);
        if (i >= 0) map[k] = i;
    });

    let procesados = 0, creados = 0, actualizados = 0, errores = 0;
    const filas = rest.map((l) => {
        const values = [];
        let inQuotes = false, current = '';
        for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (ch === '"') {
                if (inQuotes && l[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes;
            } else if (ch === SEP && !inQuotes) {
                values.push(current);
                current = '';
            } else current += ch;
        }
        values.push(current);
        return values;
    });

    const categorias = {};
    const { data: cats } = await sb.from('categories').select('id, name');
    (cats||[]).forEach(c => categorias[String(c.name).toLowerCase()] = c.id);

    const modoWeb = await (async () => {
        const { data: s } = await sb.from('settings').select('modo_web').eq('id', 1).single();
        return s?.modo_web === 'turnos' ? 'turnos' : 'venta';
    })();

    for (const v of filas) {
        procesados++;
        try {
            const nombre = (v[map.nombre]||'').replace(/^"|"$/g, '');
            if (!nombre.trim()) { errores++; continue; }
            const descripcionDetallada = (v[map.descripcion_detallada]||v[map.descripcion]||'').replace(/^"|"$/g, '');
            const precio = Number(String(v[map.precio]||'').replace(',', '.')) || 0;
            const precio_anterior = v[map.precio_anterior] !== undefined && v[map.precio_anterior] !== '' ? (Number(String(v[map.precio_anterior]||'').replace(',', '.'))||null) : null;
            const stock = Number(v[map.stock]||0) || 0;
            const destacado = (String(v[map.destacado]||'').toLowerCase() === 'sí' || String(v[map.destacado]||'').toLowerCase() === 'si' || String(v[map.destacado]||'') === 'true');
            const activo = (String(v[map.activo]||'').toLowerCase() === 'sí' || String(v[map.activo]||'').toLowerCase() === 'si' || String(v[map.activo]||'') === 'true');
            const catName = (v[map.categoria]||'').replace(/^"|"$/g, '');
            const category_id = catName ? (categorias[String(catName).toLowerCase()] || null) : null;
            const id = map.id !== undefined && v[map.id] ? v[map.id] : undefined;

            const base = { nombre, descripcion_detallada, precio, precio_anterior, stock, destacado, activo, category_id, modo: modoWeb };

            if (id && id.trim()) {
                const { error } = await sb.from('products').update(base).eq('id', Number(id));
                if (error) { errores++; continue; }
                actualizados++;
            } else {
                const { error } = await sb.from('products').insert(base);
                if (error) { errores++; continue; }
                creados++;
            }
        } catch (e) {
            errores++;
        }
    }
    return { procesados, creados, actualizados, errores };
}

export async function importarPedidosCSV(file) {
    const sb = await clienteAdmin();
    const text = await file.text();
    const [encabezado, ...rest] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const cols = encabezado.split(SEP).map((x) => x.replace(/^"|"$/g, '').trim().toLowerCase());
    const map = {};
    ['numero', 'fecha', 'estado', 'nombre', 'email', 'telefono', 'direccion', 'ciudad', 'provincia', 'codigoPostal', 'notas', 'subtotal', 'descuento', 'porcentaje', 'cupon', 'total'].forEach((k) => {
        const i = cols.indexOf(k);
        if (i >= 0) map[k] = i;
    });

    let procesados = 0, creados = 0, actualizados = 0, errores = 0;
    const filas = rest.map((l) => {
        const values = [];
        let inQuotes = false, current = '';
        for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (ch === '"') {
                if (inQuotes && l[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes;
            } else if (ch === SEP && !inQuotes) {
                values.push(current);
                current = '';
            } else current += ch;
        }
        values.push(current);
        return values;
    });

    for (const v of filas) {
        procesados++;
        try {
            const numero = (v[map.numero]||'').replace(/^"|"$/g, '').trim();
            if (!numero) { errores++; continue; }
            const estado = (v[map.estado]||'pendiente').replace(/^"|"$/g, '').trim();
            const cliente = {
                nombre: (v[map.nombre]||'').replace(/^"|"$/g, ''),
                email: (v[map.email]||'').replace(/^"|"$/g, ''),
                telefono: (v[map.telefono]||'').replace(/^"|"$/g, ''),
                direccion: (v[map.direccion]||'').replace(/^"|"$/g, ''),
                ciudad: (v[map.ciudad]||'').replace(/^"|"$/g, ''),
                provincia: (v[map.provincia]||'').replace(/^"|"$/g, ''),
                codigoPostal: (v[map.codigoPostal]||'').replace(/^"|"$/g, ''),
                notas: (v[map.notas]||'').replace(/^"|"$/g, '')
            };
            const subtotal = Number(String(v[map.subtotal]||'').replace(',', '.')) || 0;
            const descuento = Number(String(v[map.descuento]||'').replace(',', '.')) || 0;
            const porcentaje = Number(String(v[map.porcentaje]||'').replace(',', '.')) || 0;
            const cupon = (v[map.cupon]||'').replace(/^"|"$/g, '');
            const total = Number(String(v[map.total]||'').replace(',', '.')) || 0;
            const fecha = (v[map.fecha]||'').replace(/^"|"$/g, '');
            const payload = { numero, cliente, subtotal, descuento, porcentaje, cupon, total, estado };
            if (fecha) payload.created_at = fecha;

            const { data: exists } = await sb.from('orders').select('numero').eq('numero', numero).maybeSingle();
            if (exists) {
                const { error } = await sb.from('orders').update(payload).eq('numero', numero);
                if (error) { errores++; continue; }
                actualizados++;
            } else {
                const { error } = await sb.from('orders').insert(payload);
                if (error) { errores++; continue; }
                creados++;
            }
        } catch (e) {
            errores++;
        }
    }
    return { procesados, creados, actualizados, errores };
}