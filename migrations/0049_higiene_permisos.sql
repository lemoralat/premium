-- ============================================================================
-- LEMORA — Migración 0049: higiene de permisos, search_path e índices (aún no aplicado)
--
-- Migración correctiva de una sola vez (auditoría 2026-10-07). Cierra en la
-- base los agujeros que dejó el patrón histórico "crear permisivo en 0001 y
-- endurecer después en otra migración". Todo es idempotente: se puede correr
-- las veces que haga falta, y hay que correrla DESPUÉS de cualquier re-
-- ejecución de una migración vieja (ver la advertencia de 0001).
--
-- Qué hace (5 bloques):
--
--   1) TABLAS: `0001:665` hizo `grant all on all tables to authenticated`,
--      que otorga TRUNCATE, TRIGGER y REFERENCES además del CRUD. TRUNCATE
--      NO está sujeto a RLS, así que un usuario registrado con cualquier vía
--      a SQL podía vaciar tablas enteras. Se revoca de anon y authenticated
--      (service_role conserva todo: es el rol del servidor).
--
--   2) FUNCIONES: se revoca EXECUTE de todas las funciones de `public` a
--      `public` (el grant por defecto de PostgreSQL) y a `anon`, y después se
--      vuelven a conceder EXPLÍCITAMENTE las cuatro que sí se usan:
--        · contar_preguntas_frecuentes() → anon, authenticated  (tienda, 0015)
--        · es_admin()                    → authenticated, service_role (proxy.ts)
--        · borrar_pedidos(bigint[])      → authenticated (0025; con control
--          interno de es_admin — el revoke de 0025 solo alcanzaba a `public`,
--          `anon` conservaba el grant directo de 0001:667/default privileges)
--        · insertar_pedido(...)          → service_role (0028; solo api/pedido.js)
--      Las funciones de stock de 0031 siguen sin EXECUTE para nadie más.
--      Quedan FUERA del revoke las funciones trigger (set_updated_at,
--      handle_new_user, limitar_*, gestionar_stock_*): no se pueden invocar
--      por SQL ("trigger functions can only be called as triggers"), así que
--      el grant abierto no es un agujero — y excluirlas evita cualquier riesgo
--      contra el trigger de signups de auth.users, que dispara el rol
--      supabase_auth_admin. Sí entran en el barrido de search_path.
--      Las funciones de extensiones (pgcrypto etc.) quedan fuera de todo.
--
--   3) DEFAULT PRIVILEGES: 0001:671-677 concedía por defecto todo a anon y
--      authenticated para los objetos futuros — el motivo por el que cada
--      tabla nueva nacía con TRUNCATE para authenticated y cada función nueva
--      con EXECUTE para anon. A partir de esta migración los permisos se dan
--      de forma explícita por migración (patrón de 0015/0025/0028): si una
--      futura RPC pública se olvida del grant, FALLA A LA VISTA en revisión
--      en vez de quedar abierta en silencio.
--
--   4) FUNCIONES: `alter function ... set search_path = public, pg_temp` en
--      todas las funciones de `public` (reset previo para no duplicar la
--      entrada). `0001` no lo tenía y varias funciones referencian objetos
--      sin calificar: con `pg_temp` al final, un objeto temporal no puede
--      sombrear el esquema `public`.
--
--   5) ÍNDICES: los tres que la auditoría marcó como faltantes + el del
--      anti-spam del RPC (búsqueda por `lower(btrim(email))` contra orders).
--
-- Además: la vista `ultimas_migraciones` (0045) se crea sin
-- `security_invoker`, así que corre con los permisos del dueño y bypasea la
-- RLS de `schema_migrations` — se le revoca SELECT a anon y authenticated
-- (nadie la consume por PostgREST: verificado con grep en js/ y admin/js/).
--
-- NUMERACIÓN: continúa la 0048 (0046 y 0047 reservados en la historia).
--
-- Aplicar a mano en el SQL Editor de Supabase. Va en begin/commit.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) TABLAS: fuera TRUNCATE / TRIGGER / REFERENCES de los roles de cliente
-- ----------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- schema_migrations: RLS sin policies ya la bloquea, pero se revoca también
-- el grant de tabla (defensa en profundidad).
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        execute 'revoke all on public.schema_migrations from anon, authenticated';
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) FUNCIONES: revoke total + re-grant explícito de las 4 usadas
-- ----------------------------------------------------------------------------
do $$
declare
    f record;
begin
    for f in
        select n.nspname,
               p.proname,
               pg_get_function_identity_arguments(p.oid) as argumentos
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prokind = 'f'
           -- Las funciones de extensiones (pgcrypto…) no son nuestras.
           and not exists (
               select 1 from pg_depend d
                where d.objid = p.oid
                  and d.classid = 'pg_proc'::regclass
                  and d.deptype = 'e'
           )
           -- Las funciones trigger quedan fuera: no son invocables por SQL
           -- y handle_new_user corre bajo supabase_auth_admin (ver cabecera).
           and not exists (
               select 1 from pg_trigger tg
                where tg.tgfoid = p.oid
           )
    loop
        -- EXECUTE: fuera el grant directo a anon y el grant por defecto a PUBLIC.
        execute format('revoke execute on function %I.%I(%s) from public, anon',
                       f.nspname, f.proname, f.argumentos);
    end loop;
end $$;

-- search_path: reset para no duplicar la entrada, y set canónico en TODAS
-- las funciones propias (incluidas las trigger: el search_path aplica en el
-- momento del disparo igual que en una llamada normal).
do $$
declare
    f record;
begin
    for f in
        select n.nspname,
               p.proname,
               pg_get_function_identity_arguments(p.oid) as argumentos
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prokind = 'f'
           and not exists (
               select 1 from pg_depend d
                where d.objid = p.oid
                  and d.classid = 'pg_proc'::regclass
                  and d.deptype = 'e'
           )
    loop
        execute format('alter function %I.%I(%s) reset search_path',
                       f.nspname, f.proname, f.argumentos);
        execute format('alter function %I.%I(%s) set search_path = public, pg_temp',
                       f.nspname, f.proname, f.argumentos);
    end loop;
end $$;

-- Re-grants explícitos (guardados por si la migración que los crea no corrió).
do $$
begin
    if to_regprocedure('public.contar_preguntas_frecuentes()') is not null then
        execute 'grant execute on function public.contar_preguntas_frecuentes() to anon, authenticated';
    end if;
    if to_regprocedure('public.es_admin()') is not null then
        execute 'grant execute on function public.es_admin() to authenticated, service_role';
    end if;
    if to_regprocedure('public.borrar_pedidos(bigint[])') is not null then
        execute 'grant execute on function public.borrar_pedidos(bigint[]) to authenticated';
    end if;
    if to_regprocedure('public.insertar_pedido(jsonb,jsonb,text,uuid)') is not null then
        execute 'grant execute on function public.insertar_pedido(jsonb,jsonb,text,uuid) to service_role';
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) DEFAULT PRIVILEGES: los objetos futuros no nacen ya abiertos
-- ----------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
-- (service_role conserva el default de 0001: es el rol del servidor.)

alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public revoke references on tables from anon;
-- (anon conserva el select de 0001:671; service_role conserva el all.)

-- ----------------------------------------------------------------------------
-- 4) Vista de migraciones: sin SELECT para anon/authenticated
--    (sin security_invoker, corre con los permisos del dueño y bypasea RLS)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.ultimas_migraciones') is not null then
        execute 'revoke select on public.ultimas_migraciones from anon, authenticated';
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5) ÍNDICES que faltaban
-- ----------------------------------------------------------------------------
-- FK de order_items sin índice: cada DELETE/UPDATE de producto hacía seq scan.
create index if not exists order_items_product_idx
    on public.order_items (product_id);

-- El home filtra por destacado (parcial: sólo las filas destacadas).
create index if not exists products_destacado_idx
    on public.products (destacado)
    where destacado;

-- 0044: la policy pública exige categoría activa en cada lectura de products.
create index if not exists products_cat_activo_idx
    on public.products (category_id, activo);

-- Anti-spam del RPC insertar_pedido: where lower(btrim(email)) = ... and created_at >= ...
create index if not exists orders_cliente_email_idx
    on public.orders (lower(btrim(cliente->>'email')), created_at);

-- ----------------------------------------------------------------------------
-- Registro en schema_migrations (si la 0045 ya creó la tabla)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0049_higiene_permisos')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — Tablas: anon y authenticated sin TRUNCATE/TRIGGER/REFERENCES.
-- ============================================================================
-- select has_table_privilege('authenticated', 'public.orders', 'truncate') as orders_truncate_auth,
--        has_table_privilege('anon', 'public.settings', 'references')      as settings_refs_anon;
-- -- Esperado: false | false

-- PASO 2 — Funciones: anon sin EXECUTE salvo contar_preguntas_frecuentes.
-- ============================================================================
-- select has_function_privilege('anon', 'public.borrar_pedidos(bigint[])', 'execute')           as anon_borrar,
--        has_function_privilege('anon', 'public.reintegrar_stock_por_pedido(bigint)', 'execute') as anon_stock,
--        has_function_privilege('anon', 'public.insertar_pedido(jsonb,jsonb,text,uuid)', 'execute') as anon_pedido,
--        has_function_privilege('anon', 'public.contar_preguntas_frecuentes()', 'execute')      as anon_faq,
--        has_function_privilege('anon', 'public.es_admin()', 'execute')                          as anon_es_admin;
-- -- Esperado: false | false | false | true | false

-- PASO 3 — search_path en todas las funciones propias.
-- ============================================================================
-- select p.proname, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.prokind = 'f'
--    and not exists (select 1 from pg_depend d
--                     where d.objid = p.oid and d.classid = 'pg_proc'::regclass
--                       and d.deptype = 'e')
--    and (p.proconfig is null
--         or not (p.proconfig @> array['search_path=public, pg_temp']));
-- -- Esperado: 0 filas

-- PASO 4 — Vista de migraciones cerrada.
-- ============================================================================
-- select has_table_privilege('anon', 'public.ultimas_migraciones', 'select') as anon_ve_vista;
-- -- Esperado: false (si la consulta tira "no existe la relación", la 0045
-- -- todavía no corrió: no hay vista que cerrar.)

-- PASO 5 — Índices creados.
-- ============================================================================
-- select indexname from pg_indexes
--  where schemaname = 'public'
--    and indexname in ('order_items_product_idx', 'products_destacado_idx',
--                      'products_cat_activo_idx', 'orders_cliente_email_idx');
-- -- Esperado: 4 filas
