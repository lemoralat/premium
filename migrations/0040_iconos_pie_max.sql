-- ============================================================================
-- LEMORA — Migración 0040: tope de 3 iconos de confianza del pie.
--
-- PROBLEMA: `iconos_pie` no tenía ningún límite de cantidad. La tabla no tenía
-- CHECK ni trigger, el panel dejaba "Nuevo icono" siempre habilitado, y el
-- front los muestra todos los que le lleguen, sin recortar.
--
-- SOLUCIÓN: un trigger BEFORE INSERT que rechaza el cuarto icono. El tope
-- cuenta TODAS las filas (activas e inactivas), que es lo que ve y administra
-- el admin en la tabla. Desactivar un icono lo saca del home pero no lo borra,
-- y no libera lugar: hay que borrarlo.
--
-- POR QUÉ 3 Y NO UN NÚMERO ARBITRARIO: porque el CSS lo pide. El bloque del
-- pie es un grid de tres columnas:
--
--     .iconos { display: grid; grid-template-columns: repeat(3, 1fr); }
--
-- Con 3 iconos el bloque llena exactamente una fila. Con 4, el cuarto cae a una
-- segunda fila y deja una fila con un solo elemento y dos huecos: se ve roto,
-- y no es un problema de contenido sino de layout. En móvil el grid pasa a
-- `1fr` (una columna) y el bloque se apila bien con cualquier cantidad, así que
-- el límite de 3 responde a cómo se ve en escritorio, que es donde se nota.
-- Por eso este tope SÍ es de creación y no de recorte: no hay `slice` en el
-- front, y con el grid de 3 columnas un cuarto ícono no se puede mostrar bien.
--
-- POR QUÉ EN LA BD Y NO SÓLO EN EL PANEL:
-- El panel es la puerta de entrada cómoda, pero no es la única. La anon key
-- está expuesta en el bundle público (js/env.generated.js) y la policy
-- "Iconos: admin full" es `for all`, así que un admin con la sesión abierta
-- puede insertar por API sin pasar por la UI. Un límite que vive sólo en el
-- JavaScript se esquiva con una línea de curl; el trigger no. Es el mismo
-- criterio con el que 0031 revocó el EXECUTE de sus funciones, y el mismo que
-- 0035 a 0039 aplicaron al marquee, los cupones, los slides, los banners y los
-- testimonios.
--
-- QUE EL COUNT CUENTE TODAS LAS FILAS (y no sólo las activas):
-- Hay dos policies de SELECT sobre la tabla y Postgres las ORea, no las ANDea:
--   · "Iconos: lectura pública" (0004) → `using (activo = true)` — la tienda
--     SÓLO ve los activos.
--   · "Iconos: admin full" (0026)      → `using (public.es_admin())`
-- Ojo: esta tabla endureció sus policies en 0026, no en 0007 como las otras.
-- El resultado es el mismo: el único rol que puede INSERTAR es el que pasa
-- `with check (es_admin())`, y ese mismo rol cumple la segunda policy, así que
-- para él el count ve la tabla entera. Un `authenticated` que no sea admin sólo
-- vería los activos, pero tampoco puede escribir: el trigger no llega a corre
-- para él. Por eso el count NO necesita definer — y no hay que agregarlo:
-- abriría la función a `anon`.
--
-- ATENCIÓN ANTES DE CORRERLA: CORRÉ EL PASO 1 PRIMERO.
-- Por la policy pública se ve 1 icono activo, con id 5. O sea que en algún
-- momento hubo 5 filas. No se puede distinguir desde afuera si las otras 4
-- fueron borradas o desactivadas, y la diferencia decide todo: si están
-- INACTIVAS, el total ya puede estar en 3 o más y el trigger bloquearía los
-- inserts desde el primer día. Con un tope tan bajo conviene mirarlo antes. La
-- migración NO borra nada (aplicarla es seguro siempre). El PASO 1 te lo dice.
--
-- QUÉ PASA SI YA HAY MÁS DE 3: esta migración NO borra nada. Si la tabla llegó
-- a tener más, el trigger los deja en paz (sólo bloquea inserts nuevos) y el
-- panel avisa que hay que borrar para volver a crear. Es deliberado: una
-- migración no debería borrar contenido del admin sin que lo pida. Ojo con
-- esto: con más de 3, el bloque del pie YA se está viendo mal hoy, porque el
-- grid es de 3 columnas. Borrar los que sobren no es sólo para poder crear
-- otro: es para arreglar lo que ya se ve.
--
-- NUMERACIÓN: continúa la de 0039. El 0034 (interruptor de imágenes de
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
create or replace function public.limitar_iconos_pie()
returns trigger
language plpgsql
as $$
declare
    maximo constant integer := 3;
    actuales integer;
begin
    select count(*) into actuales from public.iconos_pie;

    if actuales >= maximo then
        raise exception using
            errcode = 'check_violation',
            message = format(
                'El pie del inicio admite máximo %s iconos (uno por columna del grid). Ya hay %s: borrá alguno antes de crear otro.',
                maximo, actuales
            );
    end if;

    return new;
end;
$$;

comment on function public.limitar_iconos_pie() is
    'Tope de 3 iconos en iconos_pie. BEFORE INSERT: bloquea el 4to. El 3 viene del grid repeat(3, 1fr) de .iconos en desktop. security invoker, no necesita definer.';

-- ----------------------------------------------------------------------------
-- TRIGGER
-- ----------------------------------------------------------------------------
drop trigger if exists trg_iconos_pie_max on public.iconos_pie;

create trigger trg_iconos_pie_max
    before insert on public.iconos_pie
    for each row execute function public.limitar_iconos_pie();

-- Sin tocar los UPDATE: editar un icono existente no cambia la cantidad, así
-- que no tiene por qué pasar por el tope. Cambiarle el título, la descripción,
-- la imagen o el orden siguen funcionando con la lista llena.

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — CORRER ESTO ANTES DE APLICAR LA MIGRACIÓN. Con un tope de 3 este
-- número es el que decide si el bloque del pie se está viendo bien hoy.
-- ============================================================================
-- select count(*)                       as total,
--        count(*) filter (where activo)  as activos,
--        count(*) filter (where not activo) as ocultos
--   from public.iconos_pie;
-- -- Referencia: la policy pública muestra 1 activo (id 5).
-- --   activos <= 3 -> el bloque se ve bien (una fila del grid).
-- --   activos  > 3 -> hay una segunda fila con huecos: se ve roto HOY, más
-- --                  allá de que el tope bloquee crear nuevos. Borrá los que
-- --                  sobren.
-- --   total > 3    -> al aplicar, los inserts nuevos quedan bloqueados hasta
-- --                  que borres algo.

-- ============================================================================
-- PASO 2 — El detalle, para saber por dónde empezar a limpiar. NO borra nada.
-- ============================================================================
-- select id, titulo, position, activo
--   from public.iconos_pie
--  order by activo desc, position, id;
-- -- Los `activo = false` son los que primero sobran: no se ven en el pie y
-- -- siguen ocupando lugar en el tope.

-- ============================================================================
-- PASO 3 — El trigger está instalado (esperado: 1 fila).
-- ============================================================================
-- select tgname, tgenabled
--   from pg_trigger
--  where tgname = 'trg_iconos_pie_max';
-- -- tgenabled = 'O' = habilitado (origin). 'D' = deshabilitado.

-- ============================================================================
-- PASO 4 — Probar de verdad (opcional). Es un insert real; dejalo commented
-- salvo que quieras crear un ícono de prueba y borrarlo después.
-- `titulo` es not null. La tabla tiene `check (num_nonnulls(storage_path,
-- external_url) <= 1)`, así que cero o una fuente de imagen están bien.
-- ============================================================================
-- insert into public.iconos_pie (titulo, descripcion)
--      values ('PRUEBA TOPE', 'Icono de prueba para verificar el tope.');
-- -- Si ya hay 3: error "El pie del inicio admite máximo 3 iconos..."  ✓
-- -- Si hay menos de 3: se inserta. Borralo con:
-- -- delete from public.iconos_pie where titulo = 'PRUEBA TOPE';
