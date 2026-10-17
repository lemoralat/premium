-- ============================================================================
-- LEMORA — Migración 0064: limpieza de avisos del Database Linter (Advisors)
--
-- ----------------------------------------------------------------------------
-- CONTEXTO
-- ----------------------------------------------------------------------------
-- El linter de Supabase (Advisors) reporta 13 hallazgos, todos de nivel WARN
-- (ninguno es un error). Nueve son funciones security definer con EXECUTE para
-- anon/authenticated. OCHO de esas son la superficie RPC deliberada de la app y
-- se ACEPTAN como están (ver la nota «Avisos del linter aceptados» en
-- SUPABASE_MIGRATION.md): validan public.es_admin() adentro, o sólo devuelven un
-- conteo / datos de agenda, nunca datos de cliente.
--
-- Esta migración cierra los tres que sí eran un descuido:
--
--   1) `public.generar_sku_variante()` (0060) quedó SIN `set search_path`. La
--      0049 se lo fijó a todas las funciones que existían entonces; esta es
--      posterior y se le pasó. No lee tablas (sólo built-ins y `new.*`), pero se
--      unifica con el resto.
--
--   2) `public.handle_new_user()` (0001) es un trigger de auth.users invocable
--      por RPC con la anon key sin ninguna necesidad. Postgres NO chequea
--      EXECUTE al disparar un trigger, así que revocarlo NO afecta el alta de
--      usuarios ni la creación de su fila en `profiles`.
--
--   3) `public.rls_auto_enable()` es el event trigger de auto-RLS (receta de la
--      documentación de Supabase para que toda tabla nueva nazca con RLS). NO
--      viene de estas migraciones: se creó a mano en el SQL Editor. Mismo caso:
--      es un event trigger, no necesita EXECUTE.
--
-- Es la parte acotada del hallazgo A6 de AUDITORIA.md (la 0049 no revocó
-- EXECUTE a `authenticated`). No se revoca en bloque: eso rompería el panel.
--
-- APLICAR: SQL Editor del dashboard, archivo completo (begin/commit).
-- ORDEN: después de 0060 (usa public.generar_sku_variante) y de 0001/0007.
-- RE-EJECUTABLE: alter/revoke/insert idempotentes.
-- ============================================================================

begin;

-- 1) search_path canónico (mismo valor que fijó 0049 en el resto de las
--    funciones propias). Sin esto, el aviso 0011 vuelve si algún día se
--    re-ejecuta la 0060.
alter function public.generar_sku_variante() set search_path = public, pg_temp;

-- 2) Funciones de trigger: sin EXECUTE para los roles de la API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3) rls_auto_enable no es nuestra: se revoca sólo si existe.
do $$
begin
    if to_regprocedure('public.rls_auto_enable()') is not null then
        execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    end if;
end $$;

-- 4) Registro en schema_migrations (si 0045 ya creó la tabla).
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0064_limpieza_linter')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (correr por separado, después del commit).
-- ============================================================================
-- -- 1) search_path fijado. Esperado: {search_path=public, pg_temp}
-- select p.proname, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'generar_sku_variante';
--
-- -- 2) Los roles de la API ya no pueden invocarlas. Esperado: false, false
-- select has_function_privilege('anon',          'public.handle_new_user()', 'execute') as anon_puede,
--        has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') as authenticated_puede;
--
-- -- 3) El trigger sigue vivo: crear un usuario de prueba desde
-- --    Authentication -> Users -> Add user y comprobar que aparece su fila:
-- select id, email, role from public.profiles order by created_at desc limit 3;
--
-- -- 4) Las RPC del panel siguen concedidas. Esperado: true, true, true
-- select has_function_privilege('authenticated', 'public.es_admin()', 'execute')                   as es_admin,
--        has_function_privilege('authenticated', 'public.borrar_pedidos(bigint[])', 'execute')    as borrar_pedidos,
--        has_function_privilege('authenticated', 'public.cambiar_modo_web(text)', 'execute')      as cambiar_modo_web;
-- ============================================================================
