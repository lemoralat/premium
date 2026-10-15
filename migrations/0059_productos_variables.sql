-- ============================================================================
-- LEMORA — Migración 0059: productos simples y variables (estilo WooCommerce)
--
-- ----------------------------------------------------------------------------
-- QUÉ AGREGA
-- ----------------------------------------------------------------------------
--   · `products.tipo` ('simple' | 'variable'). Los productos existentes quedan
--     en 'simple' (mismo precio y stock únicos de siempre).
--   · `product_variants`: las COMBINACIONES de un producto variable. Cada una
--     tiene su propio SKU, precio, precio anterior, stock y visibilidad.
--   · `order_items.variant_id` (se re-agrega: 0046 lo había dropeado).
--   · Un trigger que mantiene, para los productos variables, `products.stock`
--     (suma de las variantes activas) y `products.precio` (mínimo), así las
--     tarjetas y las listas del panel siguen mostrando algo coherente.
--   · `insertar_pedido` con soporte de variantes: valida y descuenta el stock de
--     la VARIANTE (no del producto), usa el precio de la VARIANTE y guarda el
--     `variant_id` en la línea. Conserva las cinco protecciones canónicas
--     (idempotencia, anti-spam, compra mínima dual, snapshot de items[] y
--     search_path) tal como quedaron en 0048.
--
-- ----------------------------------------------------------------------------
-- CÓMO SE INTEGRA (sin duplicar lógica)
-- ----------------------------------------------------------------------------
--   · Los ATRIBUTOS reutilizan las tablas que ya existían: `product_options`
--     (el grupo, ej. "Color") y `product_option_values` (sus valores, ej.
--     "Rojo"). No se crea un sistema paralelo de atributos.
--   · `product_variants.combinacion` guarda los VALORES elegidos en el orden de
--     los atributos (jsonb array de strings). El front arma la misma clave con
--     los <select> y así resuelve la variante sin una consulta extra.
--   · Los productos SIMPLES (y los históricos con atributos del sistema viejo)
--     NO se tocan: su fila queda en 'simple', sin variantes, con el precio y el
--     stock únicos de siempre. No hay migración de datos ni pérdida.
--
-- ----------------------------------------------------------------------------
-- STOCK
-- ----------------------------------------------------------------------------
--   · Producto simple  → el stock vive en `products.stock` (como hasta ahora).
--   · Producto variable → el stock vive en cada `product_variants.stock`.
--     `products.stock` es SOLO informativo (suma, la mantiene el trigger).
--
-- APLICAR: SQL Editor del dashboard. Correr el archivo completo (begin/commit).
-- REQUIERE: 0053 (servicios) y 0056 (products.modo) ya aplicadas. Va después.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Tipo de producto
-- ----------------------------------------------------------------------------
alter table public.products
    add column if not exists tipo text not null default 'simple'
    check (tipo in ('simple', 'variable'));

comment on column public.products.tipo is
    'simple = precio y stock únicos (características y servicios); variable = combinaciones en product_variants con precio/stock propios.';

-- ----------------------------------------------------------------------------
-- 2) Variantes (combinaciones) del producto variable
-- ----------------------------------------------------------------------------
create table if not exists public.product_variants (
    id              bigint generated always as identity primary key,
    product_id      integer not null references public.products(id) on delete cascade,
    sku             text not null default '',
    precio          numeric(12, 2) not null check (precio >= 0),
    precio_anterior numeric(12, 2) check (precio_anterior is null or precio_anterior >= 0),
    stock           integer not null default 0 check (stock >= 0),
    activo          boolean not null default true,
    position        integer not null default 0,
    combinacion     jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.product_variants is
    'Combinaciones de un producto variable. precio/stock/sku propios. combinacion = valores elegidos en el orden de los atributos (jsonb array de strings).';

create index if not exists product_variants_product_idx
    on public.product_variants (product_id);

-- SKU único GLOBAL cuando está cargado (WooCommerce: SKU único). Vacío = sin SKU.
create unique index if not exists product_variants_sku_uidx
    on public.product_variants (lower(sku))
    where btrim(sku) <> '';

-- Una sola variante por combinación dentro del mismo producto.
create unique index if not exists product_variants_combinacion_uidx
    on public.product_variants (product_id, combinacion);

-- updated_at genérico (reutiliza la función de 0001/0046).
drop trigger if exists trg_product_variants_updated_at on public.product_variants;
create trigger trg_product_variants_updated_at
    before update on public.product_variants
    for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) order_items.variant_id (se re-agrega: 0046 lo había dropeado)
-- ----------------------------------------------------------------------------
alter table public.order_items
    add column if not exists variant_id bigint
    references public.product_variants(id) on delete set null;

create index if not exists order_items_variant_idx
    on public.order_items (variant_id);

comment on column public.order_items.variant_id is
    'Variante comprada en un producto variable (NULL en productos simples). Snapshot: si la variante se borra, la línea conserva nombre/precio.';

-- ----------------------------------------------------------------------------
-- 4) Agregados del producto variable (products.stock = suma, precio = mínimo)
-- ----------------------------------------------------------------------------
-- Es una función trigger: no se puede invocar por SQL, así que 0049 no le toca
-- el EXECUTE (la excluye por estar referenciada en pg_trigger).
create or replace function public.refrescar_agregados_variantes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_product_id integer;
begin
    v_product_id := coalesce(new.product_id, old.product_id);

    update public.products p
       set stock = coalesce((
               select sum(v.stock)::integer
                 from public.product_variants v
                where v.product_id = v_product_id
                  and v.activo
           ), 0),
           precio = coalesce((
               select min(v.precio)
                 from public.product_variants v
                where v.product_id = v_product_id
                  and v.activo
           ), p.precio)
     where p.id = v_product_id
       and p.tipo = 'variable';

    return null;  -- AFTER trigger: el valor de retorno se ignora.
end;
$$;

drop trigger if exists trg_refrescar_agregados_variantes on public.product_variants;
create trigger trg_refrescar_agregados_variantes
    after insert or update or delete on public.product_variants
    for each row execute function public.refrescar_agregados_variantes();

-- ----------------------------------------------------------------------------
-- 5) RLS + permisos de la tabla nueva
-- ----------------------------------------------------------------------------
alter table public.product_variants enable row level security;

-- Lectura pública: la tienda necesita mostrar qué combinaciones existen y su
-- disponibilidad. El SKU no es secreto.
drop policy if exists "Variantes de producto: lectura pública" on public.product_variants;
create policy "Variantes de producto: lectura pública"
    on public.product_variants for select
    to anon, authenticated
    using (true);

-- Escritura: solo el administrador (mismo patrón que product_options).
drop policy if exists "Variantes de producto: admin full" on public.product_variants;
create policy "Variantes de producto: admin full"
    on public.product_variants for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

-- Defensa en profundidad (los default privileges ya lo hacen; explícito igual).
grant select on public.product_variants to anon;
grant all on public.product_variants to authenticated, service_role;
revoke truncate, trigger, references on public.product_variants from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) insertar_pedido con soporte de variantes
--    Cuerpo = el canónico de 0048 + la rama de variante. Se conservan las cinco
--    protecciones: IDEMPOTENCIA, ANTI-SPAM, COMPRA MÍNIMA DUAL, snapshot de
--    items[] y set search_path.
-- ----------------------------------------------------------------------------
create or replace function public.insertar_pedido(
    p_cliente jsonb,
    p_items   jsonb,
    p_cupon   text default null,
    p_token   uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
    v_subtotal          numeric := 0;
    v_descuento         numeric := 0;
    v_porcentaje        numeric := 0;
    v_total             numeric := 0;
    -- 0042: arrancan en 0 a propósito. Si la fila de settings no existe, el
    -- `select ... into` no deja nada y no se descuenta nada (lado seguro).
    v_threshold         numeric := 0;
    v_discount_pct      numeric := 0;
    v_cupon_final       text := 'NINGUNO';
    v_cupon_monto       numeric := 0;
    v_cupon_pct         numeric;
    v_item              jsonb;
    v_product           record;
    v_variant           record;
    v_variant_id        bigint;
    v_precio            numeric;
    v_qty               integer;
    v_pedido_id         bigint;
    v_email             text;
    v_pedidos_hora      integer;
    v_prev              record;
    -- Compra mínima (migración 0023: cantidad Y monto, acumulables)
    v_compra_cantidad   integer := 0;
    v_compra_monto      numeric := 0;
    v_unidades          integer := 0;
    v_error             text := '';
    -- Líneas ya insertadas, leídas de order_items (migración 0028)
    v_items             jsonb := '[]'::jsonb;
begin
    -- 0) IDEMPOTENCIA: si el token ya dio de alta un pedido, devolvemos ese
    --    pedido sin validar stock ni tocar stock (reenvío, doble clic).
    if p_token is not null then
        select id, numero, subtotal, descuento, porcentaje, cupon, total, token
          into v_prev
          from public.orders
         where token = p_token;
        if found then
            select coalesce(jsonb_agg(jsonb_build_object(
                       'nombre',          oi.nombre,
                       'variante_texto',  oi.variante_texto,
                       'variant_id',      oi.variant_id,
                       'quantity',        oi.quantity,
                       'precio_unitario', oi.precio_unitario
                   ) order by oi.id), '[]'::jsonb)
              into v_items
              from public.order_items oi
             where oi.order_id = v_prev.id;

            return jsonb_build_object(
                'status',       'success',
                'numero',       v_prev.numero,
                'subtotal',     v_prev.subtotal,
                'descuento',    v_prev.descuento,
                'porcentaje',   v_prev.porcentaje,
                'total',        v_prev.total,
                'cupon',        v_prev.cupon,
                'token',        v_prev.token,
                'items',        v_items,
                'idempotente',  true
            );
        end if;
    end if;

    -- 0.1) ANTI-SPAM: el mismo correo no puede registrar más de 10 pedidos en
    --      la última hora. (La defensa principal es la idempotencia por token;
    --      este tope frena el abuso de "comprar" en ráfaga contra el stock.)
    v_email := lower(btrim(coalesce(p_cliente->>'email', '')));
    if v_email <> '' then
        select count(*) into v_pedidos_hora
          from public.orders
         where lower(btrim(cliente->>'email')) = v_email
           and created_at >= now() - interval '1 hour';
        if v_pedidos_hora >= 10 then
            raise exception 'Demasiados pedidos desde este correo. Intentá de nuevo en unos minutos.';
        end if;
    end if;

    select discount_threshold, discount_percent, compra_minima_cantidad, compra_minima_monto
      into v_threshold, v_discount_pct, v_compra_cantidad, v_compra_monto
      from public.settings where id = 1;

    if p_cliente is null or p_items is null or jsonb_array_length(p_items) = 0 then
        raise exception 'Estructura de pedido inválida';
    end if;

    -- 1) Validar productos, variantes y stock, y acumular subtotal (precios de
    --    la BD). Se bloquea la fila (for update) para que dos pedidos
    --    simultáneos no vendan la última unidad: el segundo espera y revalida.
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := coalesce((v_item->>'quantity')::int, 0);
        if v_qty <= 0 then
            raise exception 'Cantidad inválida para un producto';
        end if;

        select id, nombre, precio, stock, activo, tipo
          into v_product
          from public.products
         where id = (v_item->>'product_id')::int
         for update;

        if not found or v_product.activo is false then
            raise exception 'Producto no encontrado o inactivo (id: %)', (v_item->>'product_id')::int;
        end if;

        -- Variante (producto variable): manda su precio y su stock.
        v_variant_id := nullif(btrim(coalesce(v_item->>'variant_id', '')), '')::bigint;

        -- Un producto variable SIEMPRE se vende por combinación: sin variant_id
        -- no hay precio ni stock confiables (el stock vive en la variante).
        if v_product.tipo = 'variable' and v_variant_id is null then
            raise exception 'Elegí una opción para "%"', v_product.nombre;
        end if;

        if v_variant_id is not null then
            select id, precio, stock, activo
              into v_variant
              from public.product_variants
             where id = v_variant_id
               and product_id = v_product.id
             for update;

            if not found or v_variant.activo is false then
                raise exception 'Stock insuficiente para "%" (opción no disponible)', v_product.nombre;
            end if;
            if v_variant.stock < v_qty then
                raise exception 'Stock insuficiente para "%" (quedan %)', v_product.nombre, v_variant.stock;
            end if;

            update public.product_variants
               set stock = stock - v_qty
             where id = v_variant.id;

            v_precio := v_variant.precio;
        else
            if v_product.stock < v_qty then
                raise exception 'Stock insuficiente para "%" (quedan %)', v_product.nombre, v_product.stock;
            end if;

            update public.products
               set stock = stock - v_qty
             where id = v_product.id;

            v_precio := v_product.precio;
        end if;

        v_subtotal := v_subtotal + (v_precio * v_qty);
        v_unidades := v_unidades + v_qty;
    end loop;

    -- 1.5) COMPRA MÍNIMA DUAL (migración 0023): cantidad de productos Y monto,
    --      ambas reglas acumulables (cada una activa con valor > 0). Se acumula
    --      el mensaje con las reglas incumplidas y se lanza en una sola
    --      excepción: la transacción revierte la bajada de stock y el pedido no
    --      se registra hasta cumplir todas las reglas activas.
    if v_compra_cantidad > 0 and v_unidades < v_compra_cantidad then
        v_error := v_error || format(
            'El pedido mínimo es de %s productos. Te faltan %s para completarlo. ',
            v_compra_cantidad, (v_compra_cantidad - v_unidades));
    end if;
    if v_compra_monto > 0 and v_subtotal < v_compra_monto then
        v_error := v_error || format(
            'El monto mínimo de compra es de $%s. Te faltan $%s. ',
            to_char(v_compra_monto, 'FM999G999G999'),
            to_char(v_compra_monto - v_subtotal, 'FM999G999G999'));
    end if;
    if v_error <> '' then
        raise exception '%', btrim(v_error);
    end if;

    -- 2) Descuento automático por umbral.
    --    El `v_threshold > 0 and v_discount_pct > 0` es el fix de la 0042:
    --    hace que el 0 del panel sea "desactivado" y no "aplicar 0%".
    if v_threshold > 0 and v_discount_pct > 0 and v_subtotal >= v_threshold then
        v_descuento  := round(v_subtotal * (v_discount_pct / 100), 2);
        v_porcentaje := v_discount_pct;
    end if;

    -- 3) Cupón manual: solo si supera el descuento automático (no acumulables)
    if p_cupon is not null and btrim(p_cupon) <> '' then
        select porcentaje into v_cupon_pct
          from public.coupons
         where codigo = upper(btrim(p_cupon))
           and activo = true
           and expira >= current_date;

        if found then
            v_cupon_monto := round(v_subtotal * (v_cupon_pct / 100), 2);
            if v_cupon_monto > v_descuento then
                v_descuento   := v_cupon_monto;
                v_porcentaje  := v_cupon_pct;
                v_cupon_final := upper(btrim(p_cupon));
            end if;
        end if;
    end if;

    v_total := v_subtotal - v_descuento;

    -- 4) Insertar pedido (token: el del cliente si es válido, si no uno nuevo)
    insert into public.orders (cliente, subtotal, descuento, porcentaje, cupon, total, token)
    values (p_cliente, v_subtotal, v_descuento, v_porcentaje, v_cupon_final, v_total,
            coalesce(p_token, gen_random_uuid()))
    returning id into v_pedido_id;

    -- 5) Insertar líneas (snapshot con nombres y precios de la BD). El precio
    --    sale de la variante cuando la hay; si no, del producto.
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := (v_item->>'quantity')::int;
        v_variant_id := nullif(btrim(coalesce(v_item->>'variant_id', '')), '')::bigint;

        insert into public.order_items (order_id, product_id, variant_id, nombre, variante_texto, quantity, precio_unitario)
        select v_pedido_id, p.id, pv.id, p.nombre,
               coalesce(v_item->>'variante_texto', ''), v_qty,
               coalesce(pv.precio, p.precio)
          from public.products p
          left join public.product_variants pv
                 on pv.id = v_variant_id
                and pv.product_id = p.id
         where p.id = (v_item->>'product_id')::int;
    end loop;

    -- 6) Se devuelven las líneas YA INSERTADAS (no las que envió el cliente),
    --    para que el frontend no arme el resumen con su propio carrito.
    --    Mismo criterio en los dos caminos idempotentes de arriba.
    select coalesce(jsonb_agg(jsonb_build_object(
               'nombre',          oi.nombre,
               'variante_texto',  oi.variante_texto,
               'variant_id',      oi.variant_id,
               'quantity',        oi.quantity,
               'precio_unitario', oi.precio_unitario
           ) order by oi.id), '[]'::jsonb)
      into v_items
      from public.order_items oi
     where oi.order_id = v_pedido_id;

    return jsonb_build_object(
        'status',      'success',
        'numero',      (select numero from public.orders where id = v_pedido_id),
        'subtotal',    v_subtotal,
        'descuento',   v_descuento,
        'porcentaje',  v_porcentaje,
        'total',       v_total,
        'cupon',       v_cupon_final,
        'token',       (select token from public.orders where id = v_pedido_id),
        'items',       v_items
    );
exception
    when unique_violation then
        -- Carrera de doble envío: el mismo token ya existe. La excepción
        -- revierte TODO lo hecho en el bloque (incluida la bajada de stock),
        -- así que devolvemos el pedido previo sin duplicar nada.
        if p_token is not null then
            select id, numero, subtotal, descuento, porcentaje, cupon, total, token
              into v_prev
              from public.orders
             where token = p_token;
            if found then
                select coalesce(jsonb_agg(jsonb_build_object(
                           'nombre',          oi.nombre,
                           'variante_texto',  oi.variante_texto,
                           'variant_id',      oi.variant_id,
                           'quantity',        oi.quantity,
                           'precio_unitario', oi.precio_unitario
                       ) order by oi.id), '[]'::jsonb)
                  into v_items
                  from public.order_items oi
                 where oi.order_id = v_prev.id;

                return jsonb_build_object(
                    'status',      'success',
                    'numero',      v_prev.numero,
                    'subtotal',    v_prev.subtotal,
                    'descuento',   v_prev.descuento,
                    'porcentaje',  v_prev.porcentaje,
                    'total',       v_prev.total,
                    'cupon',       v_prev.cupon,
                    'token',       v_prev.token,
                    'items',       v_items,
                    'idempotente', true
                );
            end if;
        end if;
        raise;
    when others then
        raise;
end;
$$;

-- La RPC solo la invoca api/pedido.js (Vercel) con la service_role key.
revoke execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) from anon, authenticated;
grant execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) to service_role;

comment on function public.insertar_pedido(jsonb, jsonb, text, uuid) is
    'Registra un pedido en una transacción: valida stock (de la variante si la hay), recalcula montos con precios de la BD, aplica descuento/cupón, descuenta stock e inserta pedido + líneas. Protecciones: idempotencia por token, anti-spam de 10 pedidos/hora por correo, compra mínima dual server-side, snapshot items[] desde order_items y set search_path (cuerpo canónico 0048 + variantes, migración 0059).';

-- ----------------------------------------------------------------------------
-- 7) Registro en schema_migrations (si 0045 ya creó la tabla)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0059_productos_variables')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (correr por separado, después del commit)
-- ============================================================================
-- PASO 1 — Estructura.
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='product_variants' order by ordinal_position;
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='products' and column_name='tipo';
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='order_items' and column_name='variant_id';
-- -- Esperado: la tabla con sus 11 columnas, `tipo` y `variant_id` presentes.
--
-- PASO 2 — El RPC conserva las cinco protecciones.
-- select pg_get_functiondef('public.insertar_pedido(jsonb,jsonb,text,uuid)'::regprocedure)
--        like '%ANTI-SPAM%'                     as anti_spam,
--        pg_get_functiondef('public.insertar_pedido(jsonb,jsonb,text,uuid)'::regprocedure)
--        like '%COMPRA MÍNIMA DUAL%'            as compra_minima,
--        pg_get_functiondef('public.insertar_pedido(jsonb,jsonb,text,uuid)'::regprocedure)
--        like '%IDEMPOTENCIA%'                  as idempotencia,
--        pg_get_functiondef('public.insertar_pedido(jsonb,jsonb,text,uuid)'::regprocedure)
--        like '%product_variants%'              as soporta_variantes;
-- -- Esperado: true | true | true | true
--
-- PASO 3 — Permisos: la anon key no puede tocar la tabla nueva ni el RPC.
-- select has_table_privilege('anon','public.product_variants','insert')      as anon_insert,
--        has_table_privilege('anon','public.product_variants','select')      as anon_select,
--        has_function_privilege('anon','public.insertar_pedido(jsonb,jsonb,text,uuid)','execute') as anon_rpc;
-- -- Esperado: false | true | false
--
-- PASO 4 — Prueba funcional (rollback, no escribe nada).
-- begin;
--   -- La tienda debe seguir vendiendo: un pedido simple y uno con variante.
--   -- (Reemplazar los ids por uno real de products y de product_variants.)
--   select public.insertar_pedido(
--       '{"nombre":"PRUEBA","email":"prueba@test.com"}'::jsonb,
--       '[{"product_id":1,"quantity":1,"variant_id":1}]'::jsonb
--   );
-- rollback;
-- -- Si no hay variante con ese id, frena con "Stock insuficiente ... opción no
-- -- disponible" (el cuerpo compila). Un error de sintaxis o "does not exist" es
-- -- el único resultado malo.
-- ============================================================================
