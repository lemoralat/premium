-- ============================================================================
-- 0020 — Compra mínima (cantidad de productos o monto)
--
-- El admin configura la compra mínima desde el panel (menú Descuentos →
-- "Compra mínima"): modo 'off' | 'cantidad' | 'monto' y un valor. La tienda la
-- muestra en el carrito y bloquea el checkout; acá se refuerza en el servidor,
-- dentro de insertar_pedido (al lanzar la excepción, la transacción revierte
-- el stock ya descontado: el pedido no se registra si no cumple el mínimo).
--
-- Idempotente: add column if not exists + create or replace function.
-- ============================================================================

alter table public.settings
    add column if not exists compra_minima_modo text not null default 'off'
        check (compra_minima_modo in ('off', 'cantidad', 'monto'));

alter table public.settings
    add column if not exists compra_minima_valor numeric(12, 2) not null default 0;

-- ----------------------------------------------------------------------------
-- insertar_pedido: se agrega la validación de compra mínima (sección "1.5").
-- El resto del cuerpo es idéntico a la versión de 0007_seguridad.sql.
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
    v_subtotal      numeric := 0;
    v_descuento     numeric := 0;
    v_porcentaje    numeric := 0;
    v_total         numeric := 0;
    v_threshold     numeric;
    v_discount_pct  numeric;
    v_cupon_final   text := 'NINGUNO';
    v_cupon_monto   numeric := 0;
    v_cupon_pct     numeric;
    v_item          jsonb;
    v_product       record;
    v_qty           integer;
    v_pedido_id     bigint;
    v_email         text;
    v_pedidos_hora  integer;
    v_prev          record;
    -- Compra mínima (migración 0020)
    v_compra_modo   text := 'off';
    v_compra_min    numeric := 0;
    v_unidades      integer := 0;
begin
    -- 0) IDEMPOTENCIA: si el token ya dio de alta un pedido, devolvemos ese
    --    pedido sin validar stock ni tocar stock (reenvío, doble clic).
    if p_token is not null then
        select numero, subtotal, descuento, porcentaje, cupon, total, token
          into v_prev
          from public.orders
         where token = p_token;
        if found then
            return jsonb_build_object(
                'status',       'success',
                'numero',       v_prev.numero,
                'subtotal',     v_prev.subtotal,
                'descuento',    v_prev.descuento,
                'porcentaje',   v_prev.porcentaje,
                'total',        v_prev.total,
                'cupon',        v_prev.cupon,
                'token',        v_prev.token,
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

    select discount_threshold, discount_percent, compra_minima_modo, compra_minima_valor
      into v_threshold, v_discount_pct, v_compra_modo, v_compra_min
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

    -- 1.5) COMPRA MÍNIMA (migración 0020): cantidad de productos o monto.
    --      Al hacer raise exception acá, la transacción revierte la bajada de
    --      stock: el pedido no se registra hasta cumplir el mínimo.
    if v_compra_modo = 'cantidad' and v_compra_min > 0 and v_unidades < v_compra_min then
        raise exception 'El pedido mínimo es de % productos. Te faltan % para completarlo.',
            v_compra_min::int, (v_compra_min - v_unidades)::int;
    end if;
    if v_compra_modo = 'monto' and v_compra_min > 0 and v_subtotal < v_compra_min then
        raise exception 'El monto mínimo de compra es de $%. Te faltan $%.',
            to_char(v_compra_min, 'FM999G999G999'),
            to_char(v_compra_min - v_subtotal, 'FM999G999G999');
    end if;

    -- 2) Descuento automático por umbral (regla actual de la tienda)
    if v_subtotal >= v_threshold then
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

    -- 5) Insertar líneas (snapshot)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := (v_item->>'quantity')::int;
        insert into public.order_items (order_id, product_id, nombre, variante_texto, quantity, precio_unitario)
        select v_pedido_id, p.id, p.nombre, coalesce(v_item->>'variante_texto', ''), v_qty, p.precio
          from public.products p
         where p.id = (v_item->>'product_id')::int;
    end loop;

    return jsonb_build_object(
        'status',      'success',
        'numero',      (select numero from public.orders where id = v_pedido_id),
        'subtotal',    v_subtotal,
        'descuento',   v_descuento,
        'porcentaje',  v_porcentaje,
        'total',       v_total,
        'cupon',       v_cupon_final,
        'token',       (select token from public.orders where id = v_pedido_id)
    );
exception
    when unique_violation then
        -- Carrera de doble envío: el mismo token ya existe. La excepción
        -- revierte TODO lo hecho en el bloque (incluida la bajada de stock),
        -- así que devolvemos el pedido previo sin duplicar nada.
        if p_token is not null then
            select numero, subtotal, descuento, porcentaje, cupon, total, token
              into v_prev
              from public.orders
             where token = p_token;
            if found then
                return jsonb_build_object(
                    'status',      'success',
                    'numero',      v_prev.numero,
                    'subtotal',    v_prev.subtotal,
                    'descuento',   v_prev.descuento,
                    'porcentaje',  v_prev.porcentaje,
                    'total',       v_prev.total,
                    'cupon',       v_prev.cupon,
                    'token',       v_prev.token,
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