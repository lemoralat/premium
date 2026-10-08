-- ============================================================================
-- LEMORA — Migración 0050: re-endurecimiento canónico de RLS (Error 3).
--
-- Auditoría 2026-10-08. Cierra la regresión de seguridad del patrón histórico
-- "crear permisivo en una migración vieja y endurecer después en otra": si
-- alguien re-ejecuta una de las migraciones viejas sobre la base viva, esas
-- migraciones RECREAN sus policies abiertas `using (true)` (mismo nombre ⇒
-- pisan la versión endurecida de 0007/0026) y vuelven a abrir la tabla.
--
-- Migraciones que degradan al re-ejecutarse y qué reabren:
--
--   · 0001_schema.sql        → todas las "…: admin full" de las 10 tablas de
--                              0001 (categories, products, product_options,
--                              product_option_values, product_images, coupons,
--                              sliders, banners, reviews, settings) y las de
--                              orders/order_items ("…: acceso de administrador"),
--                              que 0007 había reemplazado por lectura + cambio
--                              de estado con es_admin(). ADEMÁS re-otorga
--                              `grant all on all tables to authenticated`, que
--                              devuelve INSERT/UPDATE/DELETE directos sobre
--                              orders/order_items (0007 los revocó).
--   · 0004_iconos_pie.sql    → "Iconos: admin full" (0004) y las policies de
--                              escritura de Storage "… autenticada" sobre los 6
--                              buckets (0007/0021 las pasaron a "solo admin").
--   · 0014_preguntas_frecuentes.sql → "Preguntas frecuentes: admin full".
--   · 0017_marquee.sql       → "Marquee: admin full".
--
-- Todas esas tablas ya fueron endurecidas con public.es_admin() por 0007 y
-- 0026, y Storage por 0007/0021. El problema NO es el estado actual (está bien):
-- es que un re-run los revierte. Esta migración es el "re-endurecedor"
-- idempotente para correr después de cualquier re-ejecución de una migración
-- vieja (misma convención que 0049_higiene_permisos.sql).
--
-- ⚠️ REGLA OPERATIVA — después de re-ejecutar una migración vieja, correr:
--      1) 0050_rls_endurecida.sql   (esta: policies RLS + Storage + grants)
--      2) 0049_higiene_permisos.sql (permisos de funciones / TRUNCATE / search_path)
--      3) 0048_insertar_pedido_canonico.sql (si se re-ejecutó 0007/0028: repone
--         el cuerpo canónico de insertar_pedido con compra mínima y snapshot)
--
-- NOTA: el endurecimiento de funciones (EXECUTE de anon/authenticated) NO se
-- repite acá: lo cubre 0049. Esta migración es sólo RLS de tablas, las policies
-- y grants de pedidos, y las policies de escritura de Storage.
--
-- RE-EJECUTABLE: todo es `drop policy if exists` + `create policy`, dentro de
-- una transacción (begin/commit) y con guardas `to_regclass` para tablas que
-- podrían no existir todavía. Si algo falla, revierte completo.
--
-- APLICACIÓN: SQL Editor del dashboard. Correr el archivo completo. Al final
-- registra su nombre en public.schema_migrations (si 0045 ya corrió).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) PEDIDOS: sólo lectura + cambio de estado para admin (0007, V-6)
-- ----------------------------------------------------------------------------
-- 0001 recreaba "Pedidos: acceso de administrador" / "Líneas pedido: acceso de
-- administrador" (for all using true). Se dropean ambas versiones (la vieja de
-- 0001 y la endurecida de 0007) y se recrean las endurecidas.

drop policy if exists "Pedidos: acceso de administrador" on public.orders;
drop policy if exists "Pedidos: lectura de administrador" on public.orders;
create policy "Pedidos: lectura de administrador"
    on public.orders for select
    to authenticated
    using (public.es_admin());

drop policy if exists "Líneas pedido: acceso de administrador" on public.order_items;
drop policy if exists "Líneas pedido: lectura de administrador" on public.order_items;
create policy "Líneas pedido: lectura de administrador"
    on public.order_items for select
    to authenticated
    using (public.es_admin());

-- Escritura directa bloqueada: el alta entra SÓLO por la RPC insertar_pedido
-- (service_role). 0001 re-otorgaba `grant all on all tables to authenticated`;
-- esto lo revoca de nuevo. service_role conserva todo (rol del servidor).
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;

-- Cambio de estado por admin: se devuelve SÓLO la columna `estado` (privilegio
-- a nivel columna) y se exige es_admin() en la policy.
grant update (estado) on public.orders to authenticated;
drop policy if exists "Pedidos: cambio de estado por administrador" on public.orders;
create policy "Pedidos: cambio de estado por administrador"
    on public.orders for update
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

-- ----------------------------------------------------------------------------
-- 2) CONTENIDO: las 13 tablas con "…: admin full" vuelven a exigir es_admin()
-- ----------------------------------------------------------------------------
-- Recorre tabla por tabla (guardado por `to_regclass`: si la migración que la
-- crea no corrió, se saltea). Para cada una: dropea la policy por nombre y la
-- recrea con es_admin() en USING y WITH CHECK.

do $$
declare
    t record;
begin
    for t in
        select *
          from (values
              ('categories',            'Categorías: admin full'),
              ('products',              'Productos: admin full'),
              ('product_options',       'Variantes: admin full'),
              ('product_option_values', 'Valores variante: admin full'),
              ('product_images',        'Imágenes: admin full'),
              ('coupons',               'Cupones: admin full'),
              ('sliders',               'Slider: admin full'),
              ('banners',               'Banners: admin full'),
              ('reviews',               'Reseñas: admin full'),
              ('settings',              'Configuración: admin full'),
              ('iconos_pie',            'Iconos: admin full'),
              ('preguntas_frecuentes',  'Preguntas frecuentes: admin full'),
              ('marquee_items',         'Marquee: admin full')
          ) as v(tabla, pol)
    loop
        if to_regclass('public.' || t.tabla) is not null then
            execute format('drop policy if exists %I on public.%I', t.pol, t.tabla);
            execute format(
                'create policy %I on public.%I for all to authenticated '
                'using (public.es_admin()) with check (public.es_admin())',
                t.pol, t.tabla);
        end if;
    end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3) STORAGE: escritura sólo admin (0007 + extensión a `iconos` de 0021)
-- ----------------------------------------------------------------------------
-- 0004 recrea las policies "…autenticada" (cualquier usuario logueado) mientras
-- las "…solo admin" de 0007/0021 siguen presentes. Al ser RLS permisiva (OR),
-- la abierta gana. Se dropean ambas y se recrean las "solo admin" con los 6
-- buckets canónicos.

drop policy if exists "Imágenes: lectura pública" on storage.objects;
create policy "Imágenes: lectura pública"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos'));

drop policy if exists "Imágenes: subida autenticada" on storage.objects;
drop policy if exists "Imágenes: subida solo admin" on storage.objects;
create policy "Imágenes: subida solo admin"
    on storage.objects for insert
    to authenticated
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos')
        and public.es_admin());

drop policy if exists "Imágenes: actualización autenticada" on storage.objects;
drop policy if exists "Imágenes: actualización solo admin" on storage.objects;
create policy "Imágenes: actualización solo admin"
    on storage.objects for update
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos')
        and public.es_admin())
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos')
        and public.es_admin());

drop policy if exists "Imágenes: eliminación autenticada" on storage.objects;
drop policy if exists "Imágenes: eliminación solo admin" on storage.objects;
create policy "Imágenes: eliminación solo admin"
    on storage.objects for delete
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos')
        and public.es_admin());

-- ----------------------------------------------------------------------------
-- 4) Registro en schema_migrations (si 0045 ya creó la tabla)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0050_rls_endurecida')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (correr por separado, después del commit).
--
-- PASO 1 — Contenido: ninguna policy de escritura permisible (using/with_check
--          deben decir es_admin(), no `true`).
-- ============================================================================
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('categories','products','product_options',
--                      'product_option_values','product_images','coupons',
--                      'sliders','banners','reviews','settings','iconos_pie',
--                      'preguntas_frecuentes','marquee_items')
--    and cmd in ('ALL','INSERT','UPDATE','DELETE')
--  order by tablename;
-- -- Esperado: 13 filas, todas cmd=ALL con qual/with_check = es_admin().
--
-- PASO 2 — Pedidos: escritura directa revocada; sólo la columna estado.
-- ============================================================================
-- select has_table_privilege('authenticated','public.orders','insert')          as pedidos_insert,
--        has_table_privilege('authenticated','public.orders','update')          as pedidos_update,
--        has_table_privilege('authenticated','public.orders','delete')          as pedidos_delete,
--        has_column_privilege('authenticated','public.orders','estado','update') as pedidos_estado;
-- -- Esperado: false | false | false | true
--
-- PASO 3 — Pedidos: policies de lectura y de cambio de estado.
-- ============================================================================
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public' and tablename in ('orders','order_items')
--  order by tablename, policyname;
-- -- Esperado: "…: lectura de administrador" (SELECT, es_admin()) y
-- --           "Pedidos: cambio de estado por administrador" (UPDATE, es_admin());
-- --           ninguna "…: acceso de administrador".
--
-- PASO 4 — Storage: escritura sólo admin, sin policies "autenticada".
-- ============================================================================
-- select policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--    and cmd in ('INSERT','UPDATE','DELETE')
--  order by cmd;
-- -- Esperado: las tres "… solo admin" (con es_admin()); ninguna "… autenticada".
-- ============================================================================
