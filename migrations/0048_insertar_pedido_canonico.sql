-- ============================================================================
-- LEMORA — Migración 0048: `insertar_pedido` canónica (fin de la regresión 0042)
--
-- ----------------------------------------------------------------------------
-- QUÉ PASÓ
-- ----------------------------------------------------------------------------
-- La función `insertar_pedido` se redefinió 6 veces (0001 → 0007 → 0020 →
-- 0023 → 0028 → 0042). La 0042, al querer arreglar el 0 del descuento,
-- reescribió la función con "el mismo cuerpo que en 0001" (su propio
-- comentario lo dice) y CON ESO PIDIO las cuatro protecciones que las
-- migraciones intermedias le habían agregado:
--
--   · Idempotencia por token (0007/0028)  → doble clic = pedido duplicado y
--     stock descontado dos veces, o 500 contra orders_token_unique_idx.
--   · Anti-spam de 10 pedidos/hora por correo (0007) → la rama 429 de
--     api/pedido.js quedó muerta.
--   · Compra mínima dual server-side (0023) → solo quedó la validación de
--     cliente en js/formulario.js, evadible con un curl directo.
--   · Snapshot `items[]` leído de order_items (0028) → js/formulario.js
--     vuelve a armar el mensaje de WhatsApp con el carrito del navegador.
--   · `set search_path` (0007/0028) → la definición de 0042 quedó sin él.
--
-- EN QUÉ ESTÁ LA BASE: la función VIVA en producción fue verificada con
-- `pg_get_functiondef` (auditoría del 2026-10-07) y ya tiene el cuerpo
-- correcto (0028 + el fix del 0 de la 0042). El problema era del REPO: la
-- última definición del árbol (la de 0042, y la de migracionesBulk.sql)
-- estaba regresada, así que una instalación nueva —o una re-ejecución del
-- bulk— instalaba la versión vieja.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- Vuelve a definir la función con el cuerpo canónico = 0028 + los dos únicos
-- cambios de la 0042 que hay que conservar:
--   1. `v_threshold/v_discount_pct := 0` en el declare (sin fila de settings,
--      no se descuenta nada).
--   2. `if v_threshold > 0 and v_discount_pct > 0 and v_subtotal >= v_threshold`
--      (el 0 del panel apaga el descuento de verdad).
-- Sobre la base viva el efecto es un no-op: reescribe la misma función.
--
-- DE ACÁ EN ADELANTE: esta es la ÚLTIMA definición de `insertar_pedido` del
-- árbol. Si se toca la lógica del checkout, se parte de ESTE archivo (mismo
-- criterio que 0028 advertía, aplicado de una vez). Las definiciones de
-- 0001/0007/0020/0023/0028/0042 quedan como historia.
--
-- NUMERACIÓN: 0046 y 0047 quedan reservados (ocupados en la historia de git),
-- igual que 0016 y 0034. Por eso se salta a 0048.
--
-- RE-EJECUTABLE: `create or replace` + revoke/grant idempotentes. Va en
-- `begin`/`commit` y termina con el registro en `schema_migrations`.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

begin;

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

-- La RPC solo la invoca api/pedido.js (Vercel) con la service_role key.
revoke execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) from anon, authenticated;
grant execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) to service_role;

comment on function public.insertar_pedido(jsonb, jsonb, text, uuid) is
    'Registra un pedido en una transacción: valida stock, recalcula montos con precios de la BD, aplica descuento/cupón, descuenta stock e inserta pedido + línea. Protecciones activas: idempotencia por token, anti-spam de 10 pedidos/hora por correo, compra mínima dual server-side, snapshot items[] desde order_items y set search_path (migración 0048, cuerpo canónico = 0028 + fix del 0 de 0042).';

-- Registro en schema_migrations (si la 0045 ya creó la tabla).
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0048_insertar_pedido_canonico')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — Que las cinco protecciones estén en el cuerpo vigente.
-- ============================================================================
-- select pg_get_functiondef('public.insertar_pedido(jsonb,jsonb,text,uuid)'::regprocedure)
--        as definicion;
-- -- Esperado: el cuerpo contiene, como mínimo:
-- --   · 'IDEMPOTENCIA'            (0007/0028)
-- --   · 'ANTI-SPAM'               (0007)
-- --   · 'COMPRA MINIMA DUAL'      (0023)  -- el comentario dice "COMPRA MÍNIMA DUAL"
-- --   · "'items',       v_items"  (0028)
-- --   · 'v_threshold > 0 and v_discount_pct > 0'  (0042)
-- --   · 'set search_path' en la cabecera (0007/0028)
-- -- Si falta alguno, la función sigue en una versión vieja.

-- Versión corta (true/false):
-- select pg_get_functiondef('public.insertar_pedido(jsonb,jsonb,text,uuid)'::regprocedure)
--        like '%ANTI-SPAM%'
--        and pg_get_functiondef('public.insertar_pedido(jsonb,jsonb,text,uuid)'::regprocedure)
--        like '%v_threshold > 0 and v_discount_pct > 0%' as canonica;
-- -- Esperado: true

-- ============================================================================
-- PASO 2 — Que la función compile. `create or replace` NO valida el cuerpo
-- plpgsql al definirla, así que un error de tipeo sólo aparece al ejecutarla.
-- Este bloque no escribe nada: se deshace con el rollback.
-- ============================================================================
-- begin;
--   -- Se espera que frene con 'Producto no encontrado o inactivo' porque la
--   -- fila de settings/carrito no existe. Lo que importa es que NO diga
--   -- 'function ... does not exist' ni un error de sintaxis.
--   select public.insertar_pedido(
--       '{"nombre":"PRUEBA"}'::jsonb,
--       '[{"product_id":999999,"quantity":1}]'::jsonb
--   );
-- rollback;
-- -- Frene con 'Producto no encontrado o inactivo' => el cuerpo está bien  ✓
-- -- Error de sintaxis o "does not exist" => avisar antes de seguir.

-- ============================================================================
-- PASO 3 — Permisos: la anon key no puede invocar la RPC.
-- ============================================================================
-- select has_function_privilege('anon', 'public.insertar_pedido(jsonb,jsonb,text,uuid)', 'execute')
--        as anon_puede_invocar,
--        has_function_privilege('service_role', 'public.insertar_pedido(jsonb,jsonb,text,uuid)', 'execute')
--        as service_role_puede_invocar;
-- -- Esperado: false | true
