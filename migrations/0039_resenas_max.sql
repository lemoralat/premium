-- ============================================================================
-- LEMORA — Migración 0039: tope de 10 testimonios.
--
-- PROBLEMA: `reviews` no tenía ningún límite de cantidad. La tabla no tenía
-- CHECK ni trigger, el panel dejaba "Nueva reseña" siempre habilitado y el
-- front los muestra todos los que le lleguen, sin recortar. O sea que los
-- testimonios se acumulan sin freno: el bloque del home crece a lo largo de los
-- meses, y con cuántos más hay menos se lee alguno.
--
-- SOLUCIÓN: un trigger BEFORE INSERT que rechaza el undécimo testimonio. El
-- tope cuenta TODAS las filas (activas e inactivas), que es lo que ve y
-- administra el admin en la tabla. Desactivar un testimonio lo saca del home
-- pero no lo borra, y no libera lugar: hay que borrarlo.
--
-- POR QUÉ EN LA BD Y NO SÓLO EN EL PANEL:
-- El panel es la puerta de entrada cómoda, pero no es la única. La anon key
-- está expuesta en el bundle público (js/env.generated.js) y la policy
-- "Reseñas: admin full" es `for all`, así que un admin con la sesión abierta
-- puede insertar por API sin pasar por la UI. Un límite que vive sólo en el
-- JavaScript se esquiva con una línea de curl; el trigger no. Es el mismo
-- criterio con el que 0031 revocó el EXECUTE de sus funciones, y el mismo que
-- 0035 a 0038 aplicaron al marquee, los cupones, los slides y los banners.
--
-- QUE EL COUNT CUENTE TODAS LAS FILAS (y no sólo las activas):
-- Hay dos policies de SELECT sobre la tabla y Postgres las ORea, no las ANDea:
--   · "Reseñas: lectura pública" (0001) → `using (activo = true)` — la tienda
--     SÓLO ve los activos.
--   · "Reseñas: admin full" (0007)      → `using (public.es_admin())`
-- El único rol que puede INSERTAR es el que pasa `with check (es_admin())`, y
-- ese mismo rol cumple la segunda policy, así que para él el count ve la tabla
-- entera (inactivos incluidos), que es lo que el admin ve en el panel. Un
-- `authenticated` que no sea admin sólo vería los activos, pero tampoco puede
-- escribir: el trigger no llega a corre para él. Por eso el count NO necesita
-- definer — y no hay que agregarlo: abriría la función a `anon`.
--
-- ATENCIÓN ANTES DE CORRERLA: CORRÉ EL PASO 1 PRIMERO.
-- Esta tabla es la única de las cinco con ids que dan qué esperar. Al consultar
-- la base por la policy pública se ven 2 testimonios activos, con ids 13 y
-- 14. O sea que en algún momento hubo 14 filas: 12 de ellas hoy no están
-- activas. No se puede distinguir desde afuera si fueron borradas o
-- desactivadas, y la diferencia decide todo: si están INACTIVAS, el total ya
-- puede estar en 10 o más, y el trigger bloquearía los inserts desde el primer
-- día. La migración NO borra nada (aplicarla es seguro siempre), pero conviene
-- saber el número antes. El PASO 1 te lo dice.
--
-- Si el total resultara alto y preferís que los testimonios ocultos no
-- cuenten, es agregar `and activo` al `where` del count. Con eso el tope
-- cuenta sólo los que se ven en el home, que es un criterio más blando y
-- algunas veces lo que se quiere. El costo: el panel tiene que mostrar los dos
-- números, porque si no el contador deja de cuadrar con lo que el admin ve.
-- Está anotado en el .sql para que la decisión quede explícita si algún día
-- hay que cambiarlo.
--
-- QUÉ PASA SI YA HAY MÁS DE 10: esta migración NO borra nada. Si la tabla
-- llegó a tener más, el trigger los deja en paz (sólo bloquea inserts nuevos) y
-- el panel avisa que hay que borrar para volver a crear. Es deliberado: una
-- migración no debería borrar contenido del admin sin que lo pida. El PASO 2
-- al final lista los testimonios con su estado para que borres desde el panel.
--
-- NUMERACIÓN: continúa la de 0038. El 0034 (interruptor de imágenes de
-- producto) se aplicó y después se revirtió: su número queda libre pero
-- ocupado en la historia de git, y no se reutiliza.
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
create or replace function public.limitar_resenas()
returns trigger
language plpgsql
as $$
declare
    maximo constant integer := 10;
    actuales integer;
begin
    -- Sin `and activo`: el tope cuenta también los testimonios ocultos, que
    -- siguen ocupando lugar en la tabla del panel. Ver la nota del encabezado
    -- sobre cómo cambiarlo si se prefiere lo otro.
    select count(*) into actuales from public.reviews;

    if actuales >= maximo then
        raise exception using
            errcode = 'check_violation',
            message = format(
                'La lista admite máximo %s testimonios. Ya hay %s: borrá alguno antes de crear otro.',
                maximo, actuales
            );
    end if;

    return new;
end;
$$;

comment on function public.limitar_resenas() is
    'Tope de 10 testimonios en reviews. BEFORE INSERT: bloquea el 11mo. El count incluye los inactivos. security invoker, no necesita definer.';

-- ----------------------------------------------------------------------------
-- TRIGGER
-- ----------------------------------------------------------------------------
drop trigger if exists trg_resenas_max on public.reviews;

create trigger trg_resenas_max
    before insert on public.reviews
    for each row execute function public.limitar_resenas();

-- Sin tocar los UPDATE: editar un testimonio existente no cambia la cantidad,
-- así que no tiene por qué pasar por el tope. Corregir un texto, cambiarle la
-- valoración, la foto o la fecha siguen funcionando con la lista llena.

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — CORRER ESTO ANTES DE APLICAR LA MIGRACIÓN. Dice cuántos testimonios
-- hay en total y cuántos están ocultos. Si `total` ya es 10 o más, el trigger
-- va a bloquear los inserts desde el primer día: no es un error, pero tenés
-- que saberlo antes de crear el trigger y no después.
-- ============================================================================
-- select count(*)                                          as total,
--        count(*) filter (where activo)                     as activos,
--        count(*) filter (where not activo)                 as ocultos
--   from public.reviews;
-- -- Referencia: la policy pública muestra 2 activos (ids 13 y 14).
-- --   total < 10  -> hay lugar, aplicá la migración sin más.
-- --   total >= 10 -> aplicá igual (no borra nada) y borrá los que sobren
-- --                  desde el panel antes de crear nuevos.

-- ============================================================================
-- PASO 2 — El detalle, para saber por dónde empezar a limpiar. NO borra nada.
-- ============================================================================
-- select id, nombre, fecha, position, activo
--   from public.reviews
--  order by activo desc, position, id;
-- -- Los `activo = false` son los que primero sobran: no se ven en el home y
-- -- siguen ocupando lugar en el tope.

-- ============================================================================
-- PASO 3 — El trigger está instalado (esperado: 1 fila).
-- ============================================================================
-- select tgname, tgenabled
--   from pg_trigger
--  where tgname = 'trg_resenas_max';
-- -- tgenabled = 'O' = habilitado (origin). 'D' = deshabilitado.

-- ============================================================================
-- PASO 4 — Probar de verdad (opcional). Es un insert real; dejalo commented
-- salvo que quieras crear un testimonio de prueba y borrarlo después.
-- `nombre` es not null y `valoracion` tiene check between 1 and 5.
-- ============================================================================
-- insert into public.reviews (nombre, valoracion, resena)
--      values ('PRUEBA TOPE', 5, 'Testimonio de prueba para verificar el tope.');
-- -- Si ya hay 10: error "La lista admite máximo 10 testimonios..."  ✓
-- -- Si hay menos de 10: se inserta. Borralo con:
-- -- delete from public.reviews where nombre = 'PRUEBA TOPE';
