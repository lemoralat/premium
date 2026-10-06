-- ============================================================================
-- 0046_limpieza_variantes.sql — Compensación de 0046 / 0046b / 0047
--
-- CONTEXTO
--   El código del repositorio volvió al commit 78addff (antes del sistema de
--   variantes por SKU), pero esas tres migraciones YA ESTÁN APLICADAS en la
--   base de datos. Este archivo deshace sus efectos para que la base vuelva a
--   corresponder con el código desplegado.
--
-- POR QUÉ HACE FALTA (no es cosmético)
--   1) SEGURIDAD. Las 6 funciones de 0046b son `security definer` y se
--      crearon sin revocar el permiso de `PUBLIC`. En PostgreSQL todo rol es
--      miembro implícito de PUBLIC, así que revocar solo a `anon`/`authenticated`
--      NO alcanza: la anon key (pública, en js/env.generated.js) permite
--      llamar `bulk_update_variants_by_category` y escribir stock y precios.
--      Además las policies de 0046 eran `using (true) to authenticated`, así
--      que cualquier usuario registrado podía modificar stock/precios.
--      Con este archivo ambos agujeros desaparecen: no hay funciones ni tablas.
--   2) COHERENCIA. El código reverted no lee variantes ni el umbral
--      `categories.low_stock_threshold`, así que quedan comoSchema muerto
--      con superficie de ataque que nadie necesita.
--
-- RESTAURACIÓN DE `insertar_pedido` (punto donde NO es un revert exacto)
--   La versión vigente en la base es la de 0047. El revert "literal" del
--   árbol (0042) NO sería una restauración: 0042 ya había borrado antes las
--   protecciones de 0028 (idempotencia, anti-spam, compra mínima, `items[]`,
--   `set search_path`). Revertir a 0042 dejaría una función sin ninguna de
--   ellas. Por eso el cuerpo se reconstruye desde 0028 —el último estado con
--   las protecciones completas— más las TRES correcciones reales de 0042:
--       a) v_threshold / v_discount_pct con valor por defecto 0
--       b) guarda `v_threshold > 0 and v_discount_pct > 0` en el descuento
--   Es un superconjunto del árbol: coincide con lo que 0042 pretendía hacer y
--   además recupera lo que 0042 rompió.
--
-- PÉRDIDA DE DATOS (verificá 00_VERIFICAR_ANTES.sql ANTES de correr esto)
--   - Filas de product_variants / product_variant_images /
--     product_variant_option_values. El backfill de 0046 generó una variante
--     por producto sin opciones; las creadas a mano desde el panel NO se
--     recuperan. products.stock NO se toca: el backfill solo copió el valor.
--   - order_items.variant_id (debería estar en NULL: api/pedido.js descartaba
--     el campo). Si la verificación da > 0, se pierde el rastro del SKU.
--   - categories.low_stock_threshold (y sus CHECK).
--
-- RE-EJECUTABLE: todo es `if exists`. Correrlo dos veces no rompe nada.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Funciones de 0046b (6). Se dropean, no solo se revocan.
--    Orden sin importancia: ninguna se llama desde otra.
-- ----------------------------------------------------------------------------
drop function if exists public.get_category_inventory(integer);
drop function if exists public.bulk_update_variants_by_category(integer, bigint[], jsonb);
drop function if exists public.bulk_set_stock_delta_by_category(integer, bigint[], integer);
drop function if exists public.bulk_toggle_active_by_category(integer, bigint[], boolean);
drop function if exists public.bulk_generate_variants_by_category(integer);
drop function if exists public.export_category_inventory_csv(integer);

-- ----------------------------------------------------------------------------
-- 2) Columna de la línea de pedido ANTES que la tabla: es la FK que la ata.
-- ----------------------------------------------------------------------------
alter table public.order_items drop column if exists variant_id;

-- ----------------------------------------------------------------------------
-- 3) Tablas de variantes. Primero las hijas, después la padre.
--    Las policies, los triggers y los índices de estas tablas caen con la
--    tabla, así que no hace falta dropearlos por separado.
-- ----------------------------------------------------------------------------
drop table if exists public.product_variant_images;
drop table if exists public.product_variant_option_values;
drop table if exists public.product_variants;

-- ----------------------------------------------------------------------------
-- 4) Índice que 0046 agregó sobre products(category_id).
--    0001:332 ya crea products_category_id_idx con las mismas columnas:
--    0046 lo duplicó (hallazgo L1 de la auditoría). Se va el de 0046.
-- ----------------------------------------------------------------------------
drop index if exists public.idx_products_category_id;

-- ----------------------------------------------------------------------------
-- 5) Columna del umbral de stock bajo que 0046 añadió a categories.
-- ----------------------------------------------------------------------------
alter table public.categories drop column if exists low_stock_threshold;

-- ----------------------------------------------------------------------------
-- 6) `set_updated_at`: 0046 la redefinió (usaba `=` en vez de `:=`, que en
--    plpgsql es lo mismo). Se restaura la de 0001 para que el árbol y la base
--    vuelvan a coincidir objeto por objeto.
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) `insertar_pedido`: cuerpo de 0028 + las 3 correcciones de 0042.
--    Sin la rama de variantes de 0047 y sin leer product_variants.
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
    v_threshold         numeric := 0;
    v_discount_pct      numeric := 0;
    v_cupon_final       text := 'NINGUNO';
    v_cupon_monto       numeric := 0;
    v_cupon_pct         numeric;
    v_item              jsonb;
    v_product           record;
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

    -- 1) Validar productos, stock y acumular subtotal (precios de la BD)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := coalesce((v_item->>'quantity')::int, 0);
        if v_qty <= 0 then
            raise exception 'Cantidad inválida para un producto';
        end if;

        select id, nombre, precio, stock, activo
          into v_product
          from public.products
         where id = (v_item->>'product_id')::int
         for update;

        if not found or v_product.activo is false then
            raise exception 'Producto no encontrado o inactivo (id: %)', (v_item->>'product_id')::int;
        end if;
        if v_product.stock < v_qty then
            raise exception 'Stock insuficiente para "%" (quedan %)', v_product.nombre, v_product.stock;
        end if;

        update public.products set stock = stock - v_qty where id = v_product.id;

        v_subtotal := v_subtotal + (v_product.precio * v_qty);
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

    -- 2) Descuento automático por umbral (regla actual de la tienda)
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

    -- 5) Insertar líneas (snapshot con nombres y precios de la BD)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := (v_item->>'quantity')::int;
        insert into public.order_items (order_id, product_id, nombre, variante_texto, quantity, precio_unitario)
        select v_pedido_id, p.id, p.nombre, coalesce(v_item->>'variante_texto', ''), v_qty, p.precio
          from public.products p
         where p.id = (v_item->>'product_id')::int;
    end loop;

    -- 6) Se devuelven las líneas YA INSERTADAS (no las que envió el cliente),
    --    para que el frontend no arme el resumen con su propio carrito.
    --    Mismo criterio en los dos caminos idempotentes de arriba.
    select coalesce(jsonb_agg(jsonb_build_object(
               'nombre',          oi.nombre,
               'variante_texto',  oi.variante_texto,
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

-- ----------------------------------------------------------------------------
-- 8) Permisos de la RPC.
--    `create or replace` conserva el owner y los ACL previos, así que el
--    revoke de 0023 seguía vigente: por eso 0047 no abrió la RPC al navegador.
--    Se repite explícitamente y se añade `public` para que el control no
--    dependa de que alguien recuerde el orden de las migraciones. Con la
--    service_role de api/pedido.js alcanza: es quien la invoca.
-- ----------------------------------------------------------------------------
revoke execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) to service_role;

commit;

-- ============================================================================
-- VERIFICACIÓN (correr después). Todo debe dar 0 / false.
-- ============================================================================
-- select 'funciones 0046b' as que, count(*) as restante
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname in (
--        'get_category_inventory','bulk_update_variants_by_category',
--        'bulk_set_stock_delta_by_category','bulk_toggle_active_by_category',
--        'bulk_generate_variants_by_category','export_category_inventory_csv');
--
-- select 'tablas variantes' as que, count(*) as restante
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r'
--    and c.relname like 'product_variant%';
--
-- select 'columna variant_id' as que, count(*) as restante
--   from information_schema.columns
--  where table_schema = 'public' and column_name = 'variant_id';
--
-- select 'columna low_stock_threshold' as que, count(*) as restante
--   from information_schema.columns
--  where table_schema = 'public' and column_name = 'low_stock_threshold';
--
-- -- La RPC debe conservar sus 5 controles:
-- select prosrc like '%search_path%'      as tiene_search_path,
--        prosrc like '%idempotente%'      as tiene_idempotencia,
--        prosrc like '%ANTI-SPAM%'        as tiene_anti_spam,
--        prosrc like '%COMPRA MÍNIMA%'    as tiene_compra_minima,
--        prosrc like '%variant%'          as menciona_variantes_debe_ser_false
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'insertar_pedido';
--
-- ============================================================================
-- PRUEBA FUNCIONAL (la tienda tiene que seguir vendiendo)
-- ============================================================================
--   1) Probar un pedido real desde el sitio. Debe:
--      - devolver 'items' en la respuesta (lo usa el mensaje de WhatsApp)
--      - descontar stock de products
--      - rechazar con "El pedido mínimo es de..." si no se alcanza el mínimo
--   2) Mandar el MISMO pedido otra vez con el mismo token: debe devolver el
--      MISMO número de pedido con 'idempotente' = true, no crear uno nuevo.
--   3) Mismo correo, 11 pedidos seguidos: el último debe fallar con
--      "Demasiados pedidos desde este correo".
--
-- Si el pedido real falla, el problema más probable es que falte aplicar
-- 0028 o 0042 en esa base: el cuerpo restaurado depende de que existan
-- `settings.compra_minima_cantidad`, `settings.compra_minima_monto` y el
-- índice único orders_token_unique_idx (0007).
-- ============================================================================