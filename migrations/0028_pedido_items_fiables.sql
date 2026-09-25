-- ============================================================================
-- 0028 — Items y montos fiables en la respuesta de `insertar_pedido`
--
-- PROBLEMA (hallazgo V-3/M5): el RPC ya recalculaba subtotal, descuento, cupón
-- y total contra la tabla `products`, pero NO devolvía las líneas del pedido.
-- El frontend tenía que armar el mensaje de WhatsApp con el carrito que tenía
-- en `localStorage`, que el cliente controla por completo: nombres, cantidades
-- y precios unitarios. Como el canal real del pedido es ese mensaje (y no el
-- registro en BD), un cliente podía mandar "3 x Producto Barato" y el vendedor
-- leería otra cosa en WhatsApp, con el total del servidor en un renglón aparte.
--
-- SOLUCIÓN: el RPC ahora devuelve `items`, tomado de `order_items` (que ya se
-- llenaba con nombres y precios congelados desde la BD). El frontend arma el
-- mensaje exclusivamente con esa respuesta: nombre, cantidad, precio unitario,
-- variante, subtotal, descuento y total son valores que pasan por el servidor.
--
-- `items` también se devuelve en los dos caminos idempotentes (reenvío por
-- doble clic), leyéndolo del pedido previo, así el mensaje sale igual.
--
-- NOTA DE SEGURIDAD: la serialización de las líneas se hace INLINE (subconsulta
-- a order_items) y no con una función aparte a propósito. Una función
-- `security definer` que devuelva las líneas de un pedido sería invocable y
-- filtraría datos de pedidos, que en RLS son solo de admin.
--
-- El resto del cuerpo de la función es IDÉNTICO al de 0023_compra_minima_dual.
-- Si más adelante se toca la lógica de `insertar_pedido`, esta debe quedar
-- sincronizada (mismo patrón que 0001 → 0007 → 0020 → 0023 → 0028).
--
-- APLICACIÓN (SQL Editor del dashboard, después de 0027): correr este archivo.
-- Sin ella la tienda sigue funcionando: `items` simplemente no llega y el
-- frontend cae al comportamiento anterior.
--
-- RE-EJECUTABLE: create or replace + revoke/grant idempotentes.
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
    v_threshold         numeric;
    v_discount_pct      numeric;
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
    'Registra un pedido en una transacción: valida stock, recalcula montos con precios de la BD, aplica descuento/cupón, descuenta stock e inserta pedido + líneas. La respuesta incluye items[] con el snapshot real de order_items (migración 0028), para que el frontend no arme el resumen con datos del cliente.';

commit;
