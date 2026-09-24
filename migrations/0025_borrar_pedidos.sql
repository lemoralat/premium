-- ============================================================================
-- LEMORA — Migración 0025: Borrado de pedidos (individual y por lote).
--
-- El dashboard necesita poder eliminar pedidos (pruebas, duplicados, limpieza).
-- La escritura directa sobre `orders`/`order_items` está bloqueada para
-- anon/authenticated (revoke de 0007: solo lectura + cambio de `estado`),
-- así que el borrado entra por esta RPC:
--
--   • `security definer` → corre como el dueño de las tablas (bypasa RLS) y el
--     DELETE borra en cascada las líneas (`order_items` tiene
--     `on delete cascade`).
--   • Valida `public.es_admin()` contra el JWT de quien llama: si no es admin,
--     lanza EXCEPTION y no borra nada (defensa en profundidad, aunque solo
--     authenticated tiene EXECUTE).
--   • `p_ids` acepta un pedido suelto `[123]` o un lote `[123, 124, ...]`.
--   • Devuelve la cantidad REAL de pedidos eliminados (row_count) para que el
--     panel muestre el total correcto.
--
-- APLICACIÓN (SQL Editor del dashboard, después de 0024):
--   1) Correr este archivo una sola vez en el SQL Editor.
--   2) En el panel: Pedidos → checkbox por fila (o "seleccionar todos los
--      visibles") → botón rojo "Borrar seleccionados". Cada fila tiene además
--      su botón individual (ícono papelera) junto al de detalle.
--
-- RE-EJECUTABLE: create or replace + revoke/grant son idempotentes; correrla
-- de nuevo no rompe nada.
-- ============================================================================

create or replace function public.borrar_pedidos(p_ids bigint[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_borrados bigint;
begin
    if not public.es_admin() then
        raise exception 'Acceso denegado: se requiere sesión de administrador';
    end if;

    if p_ids is null or array_length(p_ids, 1) is null then
        return 0;
    end if;

    delete from public.orders where id = any (p_ids);
    get diagnostics v_borrados = row_count;
    return v_borrados;
end;
$$;

comment on function public.borrar_pedidos(bigint[]) is
    'Borra uno o varios pedidos (en cascada a order_items). Solo administradores: valida public.es_admin() con el JWT. Devuelve cuántos se borraron.';

-- El default privileges de 0001 daría EXECUTE a anon/authenticated; lo acotamos:
-- solo `authenticated` (y el check de es_admin() adentro lo restringe a admin).
revoke all on function public.borrar_pedidos(bigint[]) from public;
grant execute on function public.borrar_pedidos(bigint[]) to authenticated;