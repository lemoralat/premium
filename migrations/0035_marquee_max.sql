-- ============================================================================
-- LEMORA — Migración 0035: tope de 6 mensajes en la barra marquee.
--
-- PROBLEMA: `marquee_items` no tenía ningún límite de cantidad. El panel
-- (Diseño → "Marquee promocional") dejaba crear mensajes sin freno, así que
-- un descuido —o apretar "Nuevo mensaje" varias veces—iba llenando la barra
-- de mensajes que nadie lee: la animación los recorre cada vez más lento y
-- el promo se diluye en el ruido. Tampoco había red de seguridad: la tabla
-- no tenía CHECK, ni trigger, ni nada que contara las filas.
--
-- SOLUCIÓN: un trigger BEFORE INSERT que rechaza el séptimo mensaje. El tope
-- cuenta TODAS las filas (activas e inactivas), que es lo que ve y administra
-- el admin en la tabla: inactive sigue ocupando un lugar en la lista.
--
-- POR QUÉ EN LA BD Y NO SÓLO EN EL PANEL:
-- El panel es la puerta de entrada cómoda, pero no es la única. La anon key
-- está expuesta en el bundle público (js/env.generated.js) y la policy
-- "Marquee: admin full" es `for all to authenticated`, así que un admin con
-- la sesión abierta puede insertar por API sin pasar por la UI. Un límite
-- que vive sólo en el JavaScript se esquiva con una línea de curl; el
-- trigger no. Es el mismo criterio con el que 0031 revocó el EXECUTE de sus
-- funciones al admin: la garantía va en la base, no en el cliente.
--
-- El trigger es `security invoker` (el default) a propósito: sólo hace un
-- `select count(*)`, que `authenticated` ya puede correr sobre la tabla por
-- la policy de lectura. No necesita ni debe tener definer.
--
-- QUE EL COUNT CUENTE TODAS LAS FILAS (y no sólo las activas):
-- Hay dos policies de SELECT sobre la tabla y Postgres las ORea, no las ANDea:
--   · "Marquee: lectura pública" (0017) → `using (activo = true)`
--   · "Marquee: admin full" (0026)       → `using (public.es_admin())`
-- El único rol que puede INSERTAR es el que pasa `with check (es_admin())`
-- de "Marquee: admin full", y ese mismo rol cumple la segunda policy, así
-- que para él el count ve la tabla entera (activos + inactivos), que es lo
-- que el admin ve en el panel. Un `authenticated` que no sea admin sólo
-- vería las activas, pero tampoco puede insertar: el trigger no llega a
-- corre para él. Por eso el count NO necesita definer — y no hay que
-- agregarlo: hacerlo abriría la función a `anon` sin necesidad.
--
-- QUÉ PASA SI YA HAY MÁS DE 6: esta migración NO borra nada. Si el sitio
-- llegó a tener más, el trigger los deja en paz (sólo bloquea inserts nuevos)
-- y el panel avisa que hay que borrar para volver a crear. Es deliberado:
-- una migración no debería borrar contenido del admin sin que lo pida.
-- Si querés limpiar, el PASO 2 al final te dice cómo.
--
-- NUMERACIÓN: este archivo es 0035, no 0034. El 0034 (interruptor de imágenes
-- de producto) se aplicó y después se revirtió, así que su número queda
-- libre pero ocupado en la historia de git. Reusarlo haría ambigua una
-- lista de migraciones para cualquiera que lea el repo después.
--
-- Idempotente: sólo `create or replace` + `drop trigger if exists` + `create
-- trigger`, que es re-declarable. Se puede correr las veces que haga falta.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- FUNCIÓN del tope
-- ----------------------------------------------------------------------------
create or replace function public.limitar_marquee_items()
returns trigger
language plpgsql
as $$
declare
    maximo constant integer := 6;
    actuales integer;
begin
    select count(*) into actuales from public.marquee_items;

    if actuales >= maximo then
        raise exception using
            errcode = 'check_violation',
            message = format(
                'La barra marquee admite máximo %s mensajes. Ya hay %s: borra o desactiva alguno antes de crear otro.',
                maximo, actuales
            );
    end if;

    return new;
end;
$$;

comment on function public.limitar_marquee_items() is
    'Tope de 6 mensajes en marquee_items. BEFORE INSERT: bloquea el 7mo. security invoker, no necesita definer.';

-- ----------------------------------------------------------------------------
-- TRIGGER
-- ----------------------------------------------------------------------------
drop trigger if exists trg_marquee_items_max on public.marquee_items;

create trigger trg_marquee_items_max
    before insert on public.marquee_items
    for each row execute function public.limitar_marquee_items();

-- Sin tocar los UPDATE: editar un mensaje existente no cambia la cantidad,
-- así que no tiene por qué pasar por el tope.

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — El trigger está instalado (esperado: 1 fila).
-- ============================================================================
-- select tgname, tgenabled
--   from pg_trigger
--  where tgname = 'trg_marquee_items_max';
-- -- tgenabled = 'O' = habilitado (origin). 'D' = deshabilitado.

-- ============================================================================
-- PASO 2 — Si el trigger te dice que ya hay más de 6, esto te muestra cuáles
-- son. NO borra nada: es un SELECT. Revisá y borrá desde el panel a mano.
-- ============================================================================
-- select id, position, activo, left(texto, 60) as texto
--   from public.marquee_items
--  order by position, id;

-- ============================================================================
-- PASO 3 — Probar de verdad (opcional). Con la site's Supabase pública esto
-- es un insert real; dejalo commented salvo que quieras crear un mensaje
-- de prueba y borrarlo después.
-- ============================================================================
-- insert into public.marquee_items (texto, position) values ('PRUEBA', 99);
-- -- Si ya hay 6: error "La barra marquee admite máximo 6 mensajes..."  ✓
-- -- Si hay menos de 6: se inserta. Borralo con:
-- -- delete from public.marquee_items where texto = 'PRUEBA';
