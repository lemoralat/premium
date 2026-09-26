-- ============================================================================
-- LEMORA — Migración 0038: tope de banners por destino (4 al inicio + 1 al
-- carrito).
--
-- PROBLEMA: `banners` era la última tabla de contenido de diseño sin tope, y
-- era la que peor se comportaba. El límite de 4 que se-prometía en el toolbar
-- del panel, en el comentario de la tabla y en el propio código del front NO
-- EXISTÍA como regla: era un `slice(0, 4)` en el render
-- (js/productos-categorias.js:62). O sea que el admin podía crear 30 banners
-- sin ver un solo error, y 26 quedaban invisibles sin ningún aviso. Es el
-- peor caso de los cuatro porque acá el corte es visual: las filas se
-- acumulan en el panel, ocupan lugar en la tabla y no se ven en la tienda.
--
-- SOLUCIÓN: un trigger BEFORE INSERT OR UPDATE que reparte el tope por destino
-- en vez de contar filas. El inicio admite 4 banners y el carrito 1, así que
-- el total nunca pasa de 5.
--
-- POR QUÉ NO UN TOPE PLANO DE 5 FILAS:
-- Porque no mantendría la condición 4+1, que es lo que hay que mantener. Con
-- un tope plano el admin puede crear 5 banners de inicio, el `slice(0, 4)`
-- muestra 4 y el quinto queda invisible, y el carrito sigue vacío: el mismo
-- bug de las 26 filas invisibles, en versión chica. Contando por destino no
-- hay forma de llegar a eso: si el inicio está lleno, el único lugar libre es
-- el carrito, que es justo el que el admin debe poder seguir usando.
-- Lo que sí es cierto es que el tope plano y el tope por destino coinciden en
-- el máximo (5 = 4 + 1); se diferencian en el resto de los casos, y en el
-- que importa el por destino es el correcto.
--
-- POR QUÉ INSERT **Y** UPDATE (a diferencia de 0035/0036/0037):
-- Porque acá un UPDATE puede MOVER un banner de un destino al otro, y eso
-- cambia el reparto. El caso real: tenés 4 en el inicio y 1 en el carrito, y
-- editás el del carrito desmarcando "Banner del carrito" para mandarlo al
-- inicio. Con un trigger sólo BEFORE INSERT eso pasaba sin control y el inicio
-- quedaba con 5, del que se veían 4. Con INSERT OR UPDATE el trigger lo ve.
--
-- El conteo excluye la fila que se está guardando (`id is distinct from
-- new.id`). Sin esa exclusión el trigger se dispararía en cada edición
-- ordinaria: la fila editada ya está en la tabla y contada, y con el inicio
-- lleno el count daría 4 y rechazaría hasta un cambio de título. En un
-- BEFORE INSERT la identidad ya está asignada, así que la misma exclusión no
-- descarta nada (la fila todavía no está en la tabla) y un solo camino de
-- código sirve para los dos casos.
--
-- `is distinct from` y no `<>` a propósito: si `new.id` fuera NULL, `<>`
-- devolvería NULL (no verdadero) para todas las filas y el count daría 0,
-- dejando el tope sin efecto. `is distinct from` compara NULL correctamente
-- y, como `id` nunca es NULL, en el peor caso cuenta de más: el trigger
-- bloquea, que es el lado que conviene equivocarse.
--
-- EL TOPE CUENTA ACTIVOS E INACTIVOS (como en 0035/0036/0037): el panel
-- muestra la lista completa, así que un banner oculto sigue ocupando un lugar
-- en la tabla. Ojo con la diferencia con el render: el `slice(0, 4)` del
-- inicio corre sobre los banners que le llega la tienda, y la policy de
-- lectura pública es `using (activo = true)`, así que un banner inactivo NO
-- consume un lugar de PANTALLA. Consume un lugar de CREACIÓN, que es lo que
-- este tope cuenta. Si eso molesta, la alternativa es contar sólo los activos
-- (`and activo`), y entonces hay que avisarlo en el panel: los números de
-- "inicio" y "carrito" que se muestran tienen que ser los de la tabla, o el
-- contador deja de cuadrar con lo que el admin ve.
--
-- EL CARRITO YA ESTABA TOPEADO: el índice único parcial `banners_solo_un_carrito`
-- (0030) garantiza que como máximo una fila tenga `en_carrito = true`. El
-- trigger repite ese chequeo sólo para dar un mensaje intelligible en vez de
-- un unique_violation crudo; la garantía real sigue siendo el índice. NO lo
-- borres pensando que el trigger alcanza: el índice también protege el
-- UPDATE, y el trigger sólo el INSERT.
--
-- QUE EL COUNT CUENTE TODAS LAS FILAS (y no sólo las visibles):
-- Hay dos policies de SELECT y Postgres las ORea, no las ANDea:
--   · "Banners: lectura pública" (0001) → `using (activo = true)`
--   · "Banners: admin full" (0007)       → `using (public.es_admin())`
-- El único rol que puede INSERTAR es el que pasa `with check (es_admin())`, y
-- ese mismo rol cumple la segunda policy, así que para él el count ve la
-- tabla entera, que es lo que el admin ve en el panel. Un `authenticated` que
-- no sea admin sólo vería los activos, pero tampoco puede escribir: el trigger
-- no llega a corre para él. Por eso el count NO necesita definer — y no hay
-- que agregarlo: abriría la función a `anon`.
--
-- QUE PASA CUANDO EL PANEL CAMBIA EL BANNER DEL CARRITO (leelo antes de
-- tocar el panel, porque es lo más delicado de esta migración):
-- `admin/js/banners.js` no marca el carrito en un solo paso. Desmarca el que
-- hubiera (un UPDATE) y recién después guarda el nuevo con en_carrito = true
-- (otro UPDATE), porque si lo hiciera al revés el índice único parcial lo
-- rechaza. O sea que el cambio de destino pasa por un estado intermedio.
--
-- Con el inicio en 3 y un banner en el carrito, el intercambio se acepta: el
-- estado intermedio deja el inicio en 4 (pasa, es el tope) y el final queda
-- 4 + 1.
--
-- Con el inicio en 4 y uno en el carrito, el intercambio se RECHAZA, y está
-- bien rechazado: el resultado final sería un inicio con 5 banners, que es
-- justamente lo que el `slice(0, 4)` no puede mostrar. El trigger lo frena en
-- el primer UPDATE (el que desmarca), no en el segundo, así que el error
-- aparece antes de que se toque nada: no queda estado parcial. El mensaje
-- dice "borrá alguno del inicio", que es la salida real en ese caso.
--
-- Por qué no se hace un trigger DEFERRABLE para validar sólo el estado final:
-- se podría, pero un trigger por fila no puede saber que otro UPDATE de la
-- misma operación va a compensarlo. Con DEFERRABLE el chequeo correría al
-- final de la transacción, así que el caso problemático (inicio en 4,
-- intercambio sin lugar) seguiría necesitando un rechazo, sólo que con el
-- error llegando después y sin contexto de qué campo lo disparó. El BEFORE
-- por fila rechaza antes, y el mensaje dice qué hacer.
--
-- En resumen: el trigger valida estados por fila, y el panel ya vive con un
-- paso intermedio. La combinación cierra bien en los tres casos (intercambio
-- con lugar, intercambio sin lugar, alta simple) y siempre de forma atómica
-- desde el punto de vista de la base.
--
-- QUÉ PASA SI HAY MÁS DE LOS QUE ENTRA: esta migración NO borra nada ni baja
-- los que sobran. El trigger sólo frena inserts y moves; las filas que ya
-- están siguen como están, y el `slice(0, 4)` del inicio sigue mostrando 4.
-- Es deliberado: una migración no debería borrar contenido del admin sin que
-- lo pida, y el excesso se arregla desde el panel. Si querés ver por dónde
-- empezar, el PASO 2 al final lista los banners con su destino.
--
-- NUMERACIÓN: continúa la de 0037. El 0034 (interruptor de imágenes de
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
create or replace function public.limitar_banners()
returns trigger
language plpgsql
as $$
declare
    maximo_inicio  constant integer := 4;
    maximo_carrito constant integer := 1;
    actuales integer;
begin
    -- El destino del banner nuevo decide contra qué tope se lo mide. El
    -- `is distinct from new.id` excluye la fila en edición; en un INSERT no
    -- excluye nada porque la fila todavía no existe.
    if new.en_carrito then
        select count(*) into actuales
          from public.banners
         where en_carrito
           and id is distinct from new.id;

        if actuales >= maximo_carrito then
            raise exception using
                errcode = 'check_violation',
                message = 'Ya hay un banner del carrito, y sólo puede haber uno. '
                          'Desmarcá el actual antes de marcar este.';
        end if;
    else
        select count(*) into actuales
          from public.banners
         where not en_carrito
           and id is distinct from new.id;

        if actuales >= maximo_inicio then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'El inicio admite máximo %s banners y ya hay %s. Para guardar este, borrá alguno del inicio.',
                    maximo_inicio, actuales
                );
        end if;
    end if;

    return new;
end;
$$;

comment on function public.limitar_banners() is
    'Reparte el tope de banners por destino: 4 al inicio (en_carrito = false) y 1 al carrito. BEFORE INSERT OR UPDATE, con la fila en edición excluida del count. security invoker, no necesita definer.';

-- ----------------------------------------------------------------------------
-- TRIGGER
-- ----------------------------------------------------------------------------
drop trigger if exists trg_banners_max on public.banners;

create trigger trg_banners_max
    before insert or update on public.banners
    for each row execute function public.limitar_banners();

-- Los UPDATE también pasan, a propósito: un banner puede pasar del inicio al
-- carrito o al revés, y ese movimiento cambia el reparto. Editar el título, la
-- imagen o `activo` no lo cambia y no tropieza: la fila se excluye del count.

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — El trigger está instalado (esperado: 1 fila).
-- ============================================================================
-- select tgname, tgenabled
--   from pg_trigger
--  where tgname = 'trg_banners_max';
-- -- tgenabled = 'O' = habilitado (origin). 'D' = deshabilitado.

-- ============================================================================
-- PASO 2 — Cómo está repartido hoy. NO borra nada: es un SELECT.
-- Esto es el mismo reparto que ve el panel, y dice si hay lugar para otro.
-- ============================================================================
-- select
--     case when en_carrito then 'carrito' else 'inicio' end as destino,
--     count(*) filter (where activo)     as activos,
--     count(*) filter (where not activo) as inactivos,
--     count(*)                           as total
--   from public.banners
--  group by 1
--  order by 1;
-- -- Destino 'inicio':   total > 4 = hay banners de inicio de más.
-- -- Destino 'carrito':  total > 1 = no debería pasar (el índice parcial
-- --   'banners_solo_un_carrito' lo impide), pero si aparece, es dato viejo.
-- -- Ojo: el tope cuenta inactivos, así que 'total' es el número que importa,
-- -- no 'activos'. Para ver el detalle, el listado de abajo.

-- select id, position, activo, en_carrito, titulo
--   from public.banners
--  order by en_carrito, position, id;
-- -- Para limpiar banners de inicio de más, empezá por los inactivos.

-- ============================================================================
-- PASO 3 — Probar de verdad (opcional). Son inserts reales; dejalos
-- commented salvo que quieras crear banners de prueba y borrarlos después.
--
-- Ojo: la tabla exige `num_nonnulls(imagen_path, imagen_url) <= 1`, o sea
-- que cero o una fuente de imagen están bien. Estos inserts no llevan
-- ninguna, así que no fallan por el check: sólo por el tope, que es lo que
-- se quiere probar.
--
-- `titulo` y `position` tienen default (`''` y `0`), así que no hace falta
-- pasarlos; los paso igual para que el banner de prueba sea reconocible.
-- ============================================================================
-- insert into public.banners (titulo, position) values ('PRUEBA TOPE INICIO', 90);
-- -- Si el inicio ya tiene 4: error "El inicio admite máximo 4 banners..."  ✓
-- -- Si tiene menos: se inserta. Borralo con:
-- -- delete from public.banners where titulo = 'PRUEBA TOPE INICIO';
--
-- -- Con el inicio lleno, esto tiene que SÍ entrar: es el otro destino, y es
-- -- el caso que un tope plano de 5 habría tapado.
-- insert into public.banners (titulo, position, en_carrito)
--      values ('PRUEBA TOPE CARRITO', 91, true);
-- -- Si el carrito ya tiene uno: error "Ya hay un banner del carrito..."  ✓
-- -- Si no: se inserta. Borralo con:
-- -- delete from public.banners where titulo = 'PRUEBA TOPE CARRITO';
--
-- -- Y por último el caso del UPDATE, que es el que no existe en 0035/0036/0037:
-- -- con el inicio lleno, mover el banner del carrito al inicio tiene que ser
-- -- RECHAZADO, porque el inicio pasa a 5 y eso es justo lo que rompe el
-- -- slice(0, 4). Ojo que esto deja el carrito sin banner, así que dejalo
-- -- para el final y volvé a marcar el que correspondía.
-- -- update public.banners set en_carrito = false where en_carrito;
-- -- -- Con 4 en el inicio: error "El inicio admite máximo 4 banners..."  ✓
-- -- -- Con menos de 4 en el inicio: se mueve, y ahí el carrito queda vacío.
