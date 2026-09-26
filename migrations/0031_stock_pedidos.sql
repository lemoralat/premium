-- ============================================================================
-- 0031 — El stock sigue al estado del pedido (reintegro al cancelar)
--
-- PROBLEMA: el stock sólo se tocaba al dar de alta un pedido. La RPC
-- `insertar_pedido` (0028) valida y descuenta, y ahí terminaba el
-- seguimiento: nadie volvía a mirar `products.stock`. Concretamente:
--
--   * Cancelar un pedido (Pendiente → Cancelado desde el panel) dejaba el
--     stock descontado para siempre. Las unidades venta seguían descontadas
--     aunque el pedido ya no iba a cobrar, así que el stock del panel
--     mentía en el panel y la tienda seguía descontando esas unidades.
--   * Al revés tampoco estaba controlado: un pedido cancelado que se volvía a
--     abrir ("deshacer") dejaba el stock reintegrado por el primer bug, con lo
--     que las unidades quedaban disponibles dos veces.
--   * Borrar un pedido no cancelado (RPC `borrar_pedidos`, 0025) borraba la
--     línea en cascada pero dejaba el descuento original sin compensar.
--
-- SOLUCIÓN: que la compensación viva en la base, con triggers sobre `orders`.
-- En el panel el estado se cambia con un `update orders set estado = ...` que
-- pasa por la policy "Pedidos: cambio de estado por administrador"; no hay
-- ningún otro camino. Un trigger cubre todos los casos, incluidos los que
-- entren por la RPC, y no se puede esquivar desde el navegador.
--
-- La suma del reintegro y del descuento se hace con una subconsulta agregada
-- y no con `update ... from order_items`: si un producto tiene variantes, cada
-- variante es una línea distinta con el mismo `product_id`, y con el join
-- plano Postgres actualiza la fila destino una sola vez (toma una de las
-- líneas al azar) en vez de sumarlas. Agregar primero lo evita.
--
-- `order_items.product_id` es `on delete set null`: si el producto se borró,
-- la línea queda sin producto y no hay a qué reintegrarle stock. Las tres
-- funciones las filtran con `product_id is not null`.
--
-- Las funciones son `security definer` para que el reintegro no dependa de los
-- permisos de quien fired el trigger (el panel sólo tiene `update (estado)`
-- sobre orders). A cambio se les revoca el EXECUTE a todos: sin esto, cualquiera
-- con la anon key podría llamar `descontar_stock_por_pedido()` y vaciar el
-- stock de cualquier producto. Los triggers no necesitan ese privilegio.
--
-- IDEMPOTENTE: todo es `create or replace` + `drop trigger if exists`, así que
-- se puede volver a correr las veces que haga falta (cada `create or replace`
-- pisa la función anterior y cada trigger se dropea antes de rehacerse).
--
-- TRANSACCIONAL: todo corre dentro de un `begin`/`commit`, igual que 0026 y
-- 0028. Importa acá más que en otras migraciones: sin la transacción, un corte
-- a mitad del archivo dejaba estado parcial (funciones creadas sin sus
-- triggers, o triggers vivos sin los `revoke` que los cierran al `anon`) —
-- que es exactamente el agujero que estos mismos `revoke` previenen. Con el
-- `commit` final, un fallo revierte completo y no queda nada a medias.
--
-- PENDIENTE DE REVISAR (ver el bloque de abajo): los pedidos YA cancelados
-- antes de esta migración no disparan ningún trigger, porque no hubo
-- transición. Si quedó alguno, su stock sigue sin reintegrar. La migración no
-- los toca sola a propósito: primero hay que ver cuántos son y decidir.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Cantidades agregadas por producto para un pedido
-- ----------------------------------------------------------------------------
-- Varias líneas del mismo producto (una por variante) se suman en una sola
-- fila. `product_id is not null` descarta las líneas cuyo producto ya no
-- existe (order_items.product_id es on delete set null).
create or replace function public.cantidades_por_producto(p_order_id bigint)
returns table (product_id integer, cantidad integer)
language sql
stable
security definer
set search_path = public
as $$
    select oi.product_id, sum(oi.quantity)::int
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.product_id is not null
     group by oi.product_id;
$$;

comment on function public.cantidades_por_producto(bigint) is
    'Cantidades por producto de un pedido, agregadas (varias líneas del mismo producto se suman). Excluye las líneas sin product_id (producto borrado).';


-- ----------------------------------------------------------------------------
-- 2) Reintegro: el stock vuelve al inventario
-- ----------------------------------------------------------------------------
create or replace function public.reintegrar_stock_por_pedido(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.products p
       set stock = p.stock + c.cantidad
      from public.cantidades_por_producto(p_order_id) c
     where p.id = c.product_id;
end;
$$;

comment on function public.reintegrar_stock_por_pedido(bigint) is
    'Suma al stock de cada producto del pedido las unidades que le faltaban. La guarda del trigger (solo al cruzar a Cancelado) evita que se llame más de una vez por pedido.';


-- ----------------------------------------------------------------------------
-- 3) Re-descuento: se deshace una cancelación
-- ----------------------------------------------------------------------------
-- Al volver a abrir un pedido cancelado hay que volver a reservar esas
-- unidades. Antes de tocar nada se verifica que alcance: si no, se aborta con
-- un error que nombra los productos, en vez de dejar que reviente el
-- `check (stock >= 0)` de products con un mensaje incomprensible. Como el
-- trigger es AFTER, el raise deja sin efecto el UPDATE del estado: el pedido
-- se queda cancelado y el stock no se toca.
create or replace function public.descontar_stock_por_pedido(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_faltante text;
begin
    select string_agg(p.nombre || ' (pedido ' || c.cantidad || ', hay ' || p.stock || ')', '; ')
      into v_faltante
      from public.cantidades_por_producto(p_order_id) c
      join public.products p on p.id = c.product_id
     where p.stock < c.cantidad;

    if v_faltante is not null then
        raise exception 'No se puede revertir la cancelación: stock insuficiente de %', v_faltante;
    end if;

    update public.products p
       set stock = p.stock - c.cantidad
      from public.cantidades_por_producto(p_order_id) c
     where p.id = c.product_id;
end;
$$;

comment on function public.descontar_stock_por_pedido(bigint) is
    'Descuenta del stock las unidades de un pedido que se está reabriendo. Si no hay stock suficiente aborta la transacción con un error legible, sin dejar el stock a medias.';


-- ----------------------------------------------------------------------------
-- 4) Trigger: cambio de estado
-- ----------------------------------------------------------------------------
-- Sólo actúa al cruzar la frontera de 'Cancelado'. Un UPDATE que deja el
-- estado igual (o que cambia entre dos estados no cancelados) no mueve stock, así
-- que reintentos y cambios de estado repetidos no acumulan reintegraciones.
create or replace function public.gestionar_stock_por_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.estado = 'Cancelado' and old.estado is distinct from 'Cancelado' then
        perform public.reintegrar_stock_por_pedido(new.id);
    elsif new.estado <> 'Cancelado' and old.estado = 'Cancelado' then
        perform public.descontar_stock_por_pedido(new.id);
    end if;
    return new;
end;
$$;

comment on function public.gestionar_stock_por_estado() is
    'Trigger AFTER UPDATE OF estado ON orders: reintegrar el stock al cancelar y volver a descontarlo al reabrir. No hace nada si el estado no cruza la frontera de Cancelado.';

drop trigger if exists trg_orders_stock_estado on public.orders;
create trigger trg_orders_stock_estado
    after update of estado on public.orders
    for each row execute function public.gestionar_stock_por_estado();


-- ----------------------------------------------------------------------------
-- 5) Trigger: borrado del pedido
-- ----------------------------------------------------------------------------
-- `borrar_pedidos` (0025) borra en cascada las líneas, así que el trigger va
-- BEFORE DELETE: en AFTER las líneas ya no existirían y no habría contra qué
-- reintegrar. Si el pedido estaba cancelado, el stock ya había vuelto al
-- cancelar y no hay que tocarlo otra vez (si no, se contaría doble).
create or replace function public.gestionar_stock_por_borrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.estado is distinct from 'Cancelado' then
        perform public.reintegrar_stock_por_pedido(old.id);
    end if;
    return old;
end;
$$;

comment on function public.gestionar_stock_por_borrado() is
    'Trigger BEFORE DELETE ON orders: compensa el descuento original de insertar_pedido. No hace nada si el pedido estaba cancelado (ya se reintegró al cancelar).';

drop trigger if exists trg_orders_stock_borrado on public.orders;
create trigger trg_orders_stock_borrado
    before delete on public.orders
    for each row execute function public.gestionar_stock_por_borrado();


-- ----------------------------------------------------------------------------
-- 6) Permisos: nadie llama a estas funciones salvo los triggers
-- ----------------------------------------------------------------------------
-- create function da EXECUTE a PUBLIC por defecto. Con security definer, dejar
-- eso abierto sería un agujero: la anon key podría invocar
-- descontar_stock_por_pedido() y dejar el stock de cualquier producto en 0.
revoke all on function public.cantidades_por_producto(bigint) from public;
revoke all on function public.reintegrar_stock_por_pedido(bigint) from public;
revoke all on function public.descontar_stock_por_pedido(bigint) from public;
revoke all on function public.gestionar_stock_por_estado() from public;
revoke all on function public.gestionar_stock_por_borrado() from public;

-- Los `revoke ... from anon, authenticated` van dentro de un DO con
-- comprobación de existencia: en Supabase ambos roles existen siempre, pero
-- esta migración también se puede aplicar sobre una base propia sin ellos y,
-- sin el guard, abortaría a mitad de camino.
do $$
declare
    v_rol text;
begin
    foreach v_rol in array array['anon', 'authenticated'] loop
        if exists (select 1 from pg_roles where rolname = v_rol) then
            execute format('revoke all on function public.cantidades_por_producto(bigint) from %I', v_rol);
            execute format('revoke all on function public.reintegrar_stock_por_pedido(bigint) from %I', v_rol);
            execute format('revoke all on function public.descontar_stock_por_pedido(bigint) from %I', v_rol);
            execute format('revoke all on function public.gestionar_stock_por_estado() from %I', v_rol);
            execute format('revoke all on function public.gestionar_stock_por_borrado() from %I', v_rol);
        end if;
    end loop;
end $$;

commit;


-- ----------------------------------------------------------------------------
-- 7) Diagnóstico + backfill OPCIONAL de los pedidos ya cancelados
-- ----------------------------------------------------------------------------
-- Los pedidos que YA estaban en 'Cancelado' antes de esta migración no
-- dispararon ningún trigger, así que su stock sigue descontado. La migración
-- NO loscorrige sola: primero hay que ver el número, porque si alguien
-- repuso stock a mano al cancelar, reintegrar de nuevo lo contaría doble.
--
-- PASO 1 — correr esto y mirar el resultado:
--
--   select o.id, o.numero, o.estado, o.created_at,
--          sum(oi.quantity) filter (where oi.product_id is not null) as unidades,
--          string_agg(distinct p.nombre, ', ')
--     from public.orders o
--     join public.order_items oi on oi.order_id = o.id
--     left join public.products p on p.id = oi.product_id
--    where o.estado = 'Cancelado'
--    group by o.id, o.numero, o.estado, o.created_at
--    order by o.created_at;
--
-- PASO 2 — si la lista tiene pedidos y nadie repuso stock a mano, descomentar
-- y correr esto UNA sola vez (es idempotente por pedidos, no lo repitas):
--
-- update public.products p
--    set stock = p.stock + c.cantidad
--   from (
--       select oi.product_id, sum(oi.quantity)::int as cantidad
--         from public.orders o
--         join public.order_items oi on oi.order_id = o.id
--        where o.estado = 'Cancelado'
--          and oi.product_id is not null
--        group by oi.product_id
--   ) c
--  where p.id = c.product_id;
-- ============================================================================
