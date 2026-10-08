-- ============================================================================
-- LEMORA — Migración 0052: cierre de EXECUTE a PUBLIC en insertar_turno
--
-- CONTEXTO
--   0051 creó la RPC insertar_turno y revocó el EXECUTE de `anon` y
--   `authenticated`, pero NO de `public`. Postgres otorga EXECUTE a PUBLIC por
--   defecto a toda función nueva, y `anon` la hereda vía su membresía en PUBLIC:
--   con la anon key (pública) cualquiera podía invocar la RPC directo,
--   saltándose el honeypot y los límites de payload de api/turno.js.
--
--   Es la misma clase de hallazgo que cerró la auditoría en el resto de las RPC
--   (0046, 0049, 0025, 0031): todas revocan `from public`, no solo de
--   anon/authenticated. Esta migración aplica el mismo criterio a insertar_turno.
--
--   `borrar_turnos` ya revocó `from public` (0051, sección 3.1) y no se toca.
--
-- RE-EJECUTABLE: `revoke` idempotente dentro de begin/commit. Registra su nombre
-- en schema_migrations (si 0045 ya corrió).
--
-- APLICACIÓN: SQL Editor del dashboard. Correr el archivo completo.
-- ============================================================================

begin;

revoke execute on function public.insertar_turno(jsonb, text, text, jsonb, text, uuid) from public;

-- El grant a service_role (0051) es explícito e independiente de PUBLIC: el
-- revoke de arriba no lo afecta. Se reafirma igual por idempotencia.
grant execute on function public.insertar_turno(jsonb, text, text, jsonb, text, uuid) to service_role;

do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0052_cierre_public_turnos')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (correr por separado, después del commit).
-- ============================================================================
-- select nombre, aplicada_en from public.ultimas_migraciones
--  order by aplicada_en desc limit 3;
-- -- Esperado: 0052_cierre_public_turnos en primer lugar.
--
-- select has_function_privilege('anon',         'public.insertar_turno(jsonb,text,text,jsonb,text,uuid)', 'execute') as anon_puede_invocar,
--        has_function_privilege('service_role', 'public.insertar_turno(jsonb,text,text,jsonb,text,uuid)', 'execute') as service_role_puede_invocar;
-- -- Esperado: false | true
-- ============================================================================