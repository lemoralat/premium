-- ============================================================================
-- LEMORA — Migración 0037: tope de 12 slides del hero.
--
-- PROBLEMA: `sliders` no tenía ningún límite de cantidad en ninguna capa. La
-- tabla no tenía CHECK ni trigger, el panel dejaba "Nuevo slide" siempre
-- habilitado, y el carrusel del home consume las filas que le lleguen sin
-- recortarlas (a diferencia de `banners`, que sí hace `slice(0, 4)`). O sea:
-- 30 slides, 30 slides que rotan en la portada, y el admin sin ningún aviso de
-- que ese es el problema.
--
-- SOLUCIÓN: un trigger BEFORE INSERT que rechaza el decimotercer slide. El
-- tope cuenta TODAS las filas (activas e inactivas), que es lo que ve y
-- administra el admin en la tabla. Desactivar un slide lo saca del carrusel
-- pero no libera lugar: hay que borrarlo.
--
-- POR QUÉ EN LA BD Y NO SÓLO EN EL PANEL:
-- El panel es la puerta de entrada cómoda, pero no es la única. La anon key
-- está expuesta en el bundle público (js/env.generated.js) y la policy
-- "Slider: admin full" es `for all`, así que un admin con la sesión abierta
-- puede insertar por API sin pasar por la UI. Un límite que vive sólo en el
-- JavaScript se esquiva con una línea de curl; el trigger no. Es el mismo
-- criterio con el que 0031 revocó el EXECUTE de sus funciones, y el mismo que
-- 0035 y 0036 aplicaron al marquee y a los cupones.
--
-- QUE EL COUNT CUENTE TODAS LAS FILAS (y no sólo las activas):
-- Hay dos policies de SELECT sobre la tabla y Postgres las ORea, no las ANDea:
--   · "Slider: lectura pública" (0001) → `using (activo = true)` — o sea, la
--     tienda SÓLO ve los activos.
--   · "Slider: admin full" (0007)       → `using (public.es_admin())`
-- El único rol que puede INSERTAR es el que pasa `with check (es_admin())`,
-- y ese mismo rol cumple la segunda policy, así que para él el count ve la
-- tabla entera (inactivos incluidos), que es lo que el admin ve en el panel.
-- Un `authenticated` que no sea admin sólo vería los activos, pero tampoco
-- puede insertar: el trigger no llega a corre para él. Por eso el count NO
-- necesita definer — y no hay que agregarlo: abriría la función a `anon`.
--
-- POR QUÉ 12 Y NO 4 COMO LOS BANNERS:
-- El tope de los banners (4) es de RENDER, no de creación: el home hace
-- `slice(0, 4)` sobre los banners del inicio, así que crear más no da error
-- pero tampoco se ven. Los slides no tienen ese recorte — el carrusel rota
-- todas las filas que le lleguen—, así que acá el número es de creación y el
-- motivo es distinto: un hero con muchos slides se ve más roto y más difícil
-- de mantener que uno con pocos, no "lleno de filas invisibles". 12 deja
-- margen para cambiar campañas sin estar borrando, y sigue siendo un número
-- que un humano puede recorrer de una en el panel.
--
-- NOTA SOBRE EL PANEL: `admin/js/slider.js` tiene DOS caminos que crean filas,
-- no uno. El botón "Nuevo slide" (que abre el modal) y la acción "Duplicar"
-- de cada fila. El trigger los cubre a los dos por igual, que es justamente
-- el motivo de que el límite viva en la BD: es muy fácil proteger el botón
-- principal y olvidar el duplicado.
--
-- QUÉ PASA SI YA HAY MÁS DE 12: esta migración NO borra nada. Si el sitio
-- llegó a tener más, el trigger los deja en paz (sólo bloquea inserts nuevos)
-- y el panel avisa que hay que borrar para volver a crear. Es deliberado:
-- una migración no debería borrar contenido del admin sin que lo pida. Si
-- querés limpiar, el PASO 2 al final te dice cuáles son los que pesan.
--
-- NUMERACIÓN: continúa la de 0036. El 0034 (interruptor de imágenes de
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
create or replace function public.limitar_slides()
returns trigger
language plpgsql
as $$
declare
    maximo constant integer := 12;
    actuales integer;
begin
    select count(*) into actuales from public.sliders;

    if actuales >= maximo then
        raise exception using
            errcode = 'check_violation',
            message = format(
                'La portada admite maximo %s slides. Ya hay %s: borra alguno antes de crear o duplicar otro.',
                maximo, actuales
            );
    end if;

    return new;
end;
$$;

comment on function public.limitar_slides() is
    'Tope de 12 slides en sliders. BEFORE INSERT: bloquea el 13mo, y por lo tanto también el duplicado. security invoker, no necesita definer.';

-- ----------------------------------------------------------------------------
-- TRIGGER
-- ----------------------------------------------------------------------------
drop trigger if exists trg_sliders_max on public.sliders;

create trigger trg_sliders_max
    before insert on public.sliders
    for each row execute function public.limitar_slides();

-- Sin tocar los UPDATE: editar un slide existente no cambia la cantidad, así
-- que no tiene por qué pasar por el tope. Cambiarle el título, la imagen, el
-- orden, activarlo o desactivarlo siguen funcionando con la lista llena.

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — El trigger está instalado (esperado: 1 fila).
-- ============================================================================
-- select tgname, tgenabled
--   from pg_trigger
--  where tgname = 'trg_sliders_max';
-- -- tgenabled = 'O' = habilitado (origin). 'D' = deshabilitado.

-- ============================================================================
-- PASO 2 — Si el trigger te dice que ya hay más de 12, esto te muestra por
-- dónde empezar a limpiar. NO borra nada: es un SELECT. Los inactivos son los
-- que primero sobran, pero ojo: borrarlos es decisión tuya, no del script.
-- ============================================================================
-- select id, titulo, position, activo,
--        case when activo then 'visible' else 'oculto' end as estado
--   from public.sliders
--  order by activo desc, position, id;
-- -- Con más de 12 filas, empezá por los 'oculto'.

-- ============================================================================
-- PASO 3 — Probar de verdad (opcional). Esto es un insert real; dejalo
-- commented salvo que quieras crear un slide de prueba y borrarlo después.
-- La tabla exige `titulo`; `position` tiene default.
-- ============================================================================
-- insert into public.sliders (titulo, position)
--      values ('PRUEBA TOPE', 99);
-- -- Si ya hay 12: error "La portada admite maximo 12 slides..."  ✓
-- -- Si hay menos de 12: se inserta. Borralo con:
-- -- delete from public.sliders where titulo = 'PRUEBA TOPE';
--
-- Ojo: este insert NO lleva `storage_path` ni `external_url`, y la tabla tiene
-- `check (num_nonnulls(storage_path, external_url) <= 1)` — o sea, cero o uno
-- están bien, dos no. Por eso este insert no falla por el check, sólo por el
-- tope, que es lo que se quiere probar acá.
