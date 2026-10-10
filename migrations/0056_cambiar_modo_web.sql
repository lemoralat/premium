-- ============================================================================
-- LEMORA — Migración 0056: propiedad del ítem por modo + RPC de cambio de modo
--
-- CONTEXTO
--   Productos y servicios viven en la misma tabla `products`. Hasta acá,
--   cambiar settings.modo_web (venta ↔ turnos) solo relablaba el panel: todo
--   el catálogo quedaba publicado igual en ambos modos.
--
--   Con la 0056 cada ítem pasa a tener una propiedad de modo (products.modo):
--     · 'turnos' → "servicio" (se administra como servicio y se reserva)
--     · 'venta'  → "producto" (carrito y pedido)
--   Al cambiar el modo desde Configuración, la RPC cambiar_modo_web() deja
--   ACTIVOS los ítems del modo entrante y DESACTIVA (nunca borra) los del otro
--   modo. Desactivar oculta el ítem de la tienda pública (que ya filtra
--   activo = true, ver js/supabase.js y la policy RLS) sin perder nada.
--
--   La pertenencia se asigna al GUARDAR el ítem (el panel escribe `modo` según
--   el modo activo), así que un servicio guardado sin duración ni horarios
--   igual queda como 'turnos' si se guardó en modo turnos.
--
-- REQUIERE 0053 (columnas servicio_duracion_min / servicio_horarios) y 0051
-- (settings.modo_web). Aplicar las migraciones en orden.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Columna products.modo + backfill de los ítems existentes
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists modo text;

-- Backfill heurístico (corre solo la primera vez: la columna recién se
-- agregó). Un ítem es un SERVICIO si:
--   · declara duración estimada o horarios por día (0053), o
--   · fue guardado desde el panel en modo turnos: ese formulario fuerza
--     stock = 0 y borra las variantes → la fila quedó con stock 0 y sin
--     opciones (firma de guardado, no un dato declarado).
-- El resto (producto de venta común) queda como 'venta'.
update public.products p
   set modo = 'turnos'
 where p.modo is null
   and (
            coalesce(p.servicio_duracion_min, 0) > 0
        or (
               p.servicio_horarios is not null
           and jsonb_typeof(p.servicio_horarios) = 'array'
           and jsonb_array_length(p.servicio_horarios) > 0
           )
        or (
               p.stock = 0
           and not exists (
                   select 1 from public.product_options po where po.product_id = p.id
               )
           )
   );

update public.products set modo = 'venta' where modo is null;

alter table public.products alter column modo set default 'venta';
alter table public.products alter column modo set not null;

-- Constraint idempotente (Postgres no admite ADD CONSTRAINT IF NOT EXISTS).
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'products_modo_check'
    ) then
        alter table public.products
            add constraint products_modo_check check (modo in ('venta', 'turnos'));
    end if;
end $$;

comment on column public.products.modo is
    'Modo al que pertenece el ítem: venta (producto, carrito/pedido) o turnos (servicio, reserva de turno). Lo asigna el panel al guardar; al cambiar settings.modo_web la RPC cambiar_modo_web() activa los del modo entrante y desactiva los del otro (sin borrar).';

-- ----------------------------------------------------------------------------
-- 2) RPC cambiar_modo_web(p_modo): cambia el modo y reparte el catálogo
-- ----------------------------------------------------------------------------
create or replace function public.cambiar_modo_web(p_modo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_anterior     text;
    v_activados    bigint;
    v_desactivados bigint;
begin
    if not public.es_admin() then
        raise exception 'Acceso denegado: se requiere sesión de administrador';
    end if;

    if p_modo not in ('venta', 'turnos') then
        raise exception 'Modo inválido: %', p_modo using errcode = '22023';
    end if;

    select modo_web into v_anterior
      from public.settings
     where id = 1;

    update public.settings set modo_web = p_modo where id = 1;

    -- Desactiva los activos del OTRO modo (nunca los borra).
    update public.products
       set activo = false
     where activo = true
       and modo is distinct from p_modo;
    get diagnostics v_desactivados = row_count;

    -- Activa los del modo entrante que estén inactivos (si existen).
    update public.products
       set activo = true
     where activo = false
       and modo = p_modo;
    get diagnostics v_activados = row_count;

    return jsonb_build_object(
        'anterior',     v_anterior,
        'nuevo',        p_modo,
        'activados',    v_activados,
        'desactivados', v_desactivados
    );
end;
$$;

comment on function public.cambiar_modo_web(text) is
    'Cambia settings.modo_web y reparte la visibilidad del catálogo: activa los ítems del modo entrante y desactiva (sin borrar) los del otro modo. Solo administradores: valida public.es_admin() con el JWT. Devuelve { anterior, nuevo, activados, desactivados }.';

-- Solo `authenticated` (el check de es_admin() adentro lo restringe a admin).
revoke all on function public.cambiar_modo_web(text) from public;
grant execute on function public.cambiar_modo_web(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Registro en schema_migrations (si 0045 ya creó la tabla)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0056_cambiar_modo_web')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (correr por separado, después del commit).
-- ============================================================================
-- select modo, count(*) from public.products group by modo;
-- -- Esperado: cada ítem clasificado 'venta' o 'turnos' (sin NULL).
-- select * from public.cambiar_modo_web('turnos');
-- -- Esperado: { anterior, nuevo: 'turnos', activados, desactivados }.
-- select nombre, aplicada_en from public.ultimas_migraciones
--  order by aplicada_en desc limit 3;
-- -- Esperado: 0056_cambiar_modo_web en primer lugar.
-- ============================================================================