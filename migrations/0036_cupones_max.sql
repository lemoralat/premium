-- ============================================================================
-- LEMORA — Migración 0036: tope de 10 cupones de descuento.
--
-- PROBLEMA: `coupons` no tenía ningún límite de cantidad. El panel
-- (Descuentos → "Cupones") dejaba crear cupones sin freno, así que la tabla
-- se iba llenando de códigos viejos —vencidos, inactivos, de campañas que
-- ya pasaron— sin que nada lo indicara. El problema es peor en cupones que en
-- el marquee: acá cada fila es ruido que el admin tiene que leer para
-- encontrar el cupón vigente, y los cupones vencidos se acumulan solos con
-- el paso del tiempo.
--
-- SOLUCIÓN: un trigger BEFORE INSERT que rechaza el undécimo cupón. El tope
-- cuenta TODAS las filas (vigentes, inactivas y vencidas), que es lo que ve
-- y administra el admin en la tabla: una fila vencida sigue ocupando un
-- lugar en la lista, y es justamente la que hay que borrar para liberar.
--
-- POR QUÉ EN LA BD Y NO SÓLO EN EL PANEL:
-- El panel es la puerta de entrada cómoda, pero no es la única. La anon key
-- está expuesta en el bundle público (js/env.generated.js) y la policy
-- "Cupones: admin full" es `for all`, así que un admin con la sesión abierta
-- puede insertar por API sin pasar por la UI. Un límite que vive sólo en el
-- JavaScript se esquiva con una línea de curl; el trigger no. Es el mismo
-- criterio con el que 0031 revocó el EXECUTE de sus funciones, y el mismo
-- que 0035 aplicó al marquee.
--
-- El trigger es `security invoker` (el default) a propósito: sólo hace un
-- `select count(*)`, que el rol administrador ya puede correr sobre la tabla.
-- No necesita ni debe tener definer.
--
-- QUE EL COUNT CUENTE TODAS LAS FILAS (y no sólo las vigentes):
-- Hay dos policies de SELECT sobre la tabla y Postgres las ORea, no las ANDea:
--   · "Cupones: lectura pública vigentes" (0001) → `using (activo = true and
--     expira >= current_date)` — o sea, la tienda SÓLO ve los vigentes.
--   · "Cupones: admin full" (0007)              → `using (public.es_admin())`
-- El único rol que puede INSERTAR es el que pasa `with check (es_admin())`,
-- y ese mismo rol cumple la segunda policy, así que para él el count ve la
-- tabla entera (vencidos incluidos), que es lo que el admin ve en el panel.
-- Un `authenticated` que no sea admin sólo vería los vigentes, pero tampoco
-- puede insertar: el trigger no llega a corre para él. Por eso el count NO
-- necesita definer — y no hay que agregarlo: abriría la función a `anon`.
--
-- NOTA SOBRE LOS CUPONES VENCIDOS: el tope no los exime. Contar sólo los
-- vigentes parecería más amable, pero el panel muestra la lista completa, y
-- un botón que dice "podés crear" mientras la tabla tiene 30 filas se lee
-- como un bug. Contar todo hace la regla predecible: si llegaste al tope,
-- borrá los que ya no sirven. El panel lo dice explícitamente en el hint.
--
-- QUÉ PASA SI YA HAY MÁS DE 10: esta migración NO borra nada. Si el sitio
-- llegó a tener más, el trigger los deja en paz (sólo bloquea inserts nuevos)
-- y el panel avisa que hay que borrar para volver a crear. Es deliberado:
-- una migración no debería borrar contenido del admin sin que lo pida.
-- Si querés limpiar, el PASO 2 al final te dice cuáles son los que pesan.
--
-- NUMERACIÓN: continúa la de 0035. El 0034 (interruptor de imágenes de
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
create or replace function public.limitar_cupones()
returns trigger
language plpgsql
as $$
declare
    maximo constant integer := 10;
    actuales integer;
begin
    select count(*) into actuales from public.coupons;

    if actuales >= maximo then
        raise exception using
            errcode = 'check_violation',
            message = format(
                'La lista admite maximo %s cupones. Ya hay %s: borra los vencidos o inactivos antes de crear otro.',
                maximo, actuales
            );
    end if;

    return new;
end;
$$;

comment on function public.limitar_cupones() is
    'Tope de 10 cupones en coupons. BEFORE INSERT: bloquea el 11mo. security invoker, no necesita definer.';

-- ----------------------------------------------------------------------------
-- TRIGGER
-- ----------------------------------------------------------------------------
drop trigger if exists trg_cupones_max on public.coupons;

create trigger trg_cupones_max
    before insert on public.coupons
    for each row execute function public.limitar_cupones();

-- Sin tocar los UPDATE: editar un cupón existente no cambia la cantidad, así
-- que no tiene por qué pasar por el tope. Renombrar un código, cambiarle el
-- porcentaje o reactivarlo siguen funcionando con la lista llena.

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — El trigger está instalado (esperado: 1 fila).
-- ============================================================================
-- select tgname, tgenabled
--   from pg_trigger
--  where tgname = 'trg_cupones_max';
-- -- tgenabled = 'O' = habilitado (origin). 'D' = deshabilitado.

-- ============================================================================
-- PASO 2 — Si el trigger te dice que ya hay más de 10, esto te muestra por
-- dónde empezar a limpiar. NO borra nada: es un SELECT. Los vencidos y los
-- inactivos son los que no sirven; los borrás desde el panel.
-- ============================================================================
-- select id, codigo, porcentaje, expira, activo,
--        case when expira < current_date then 'vencido' else 'vigente' end as estado
--   from public.coupons
--  order by expira, id;
-- -- Con más de 10 filas, empezá por los 'vencido'.

-- ============================================================================
-- PASO 3 — Probar de verdad (opcional). Con la site's Supabase pública esto
-- es un insert real; dejalo commented salvo que quieras crear un cupón de
-- prueba y borrarlo después.
--
-- Ojo: `codigo` es UNIQUE. Si el de prueba ya existe, el error va a ser de
-- duplicado y no del tope — usá un código raro.
-- ============================================================================
-- insert into public.coupons (codigo, porcentaje, expira)
--      values ('PRUEBA_TOPE', 5, current_date + 30);
-- -- Si ya hay 10: error "La lista admite maximo 10 cupones..."  ✓
-- -- Si hay menos de 10: se inserta. Borralo con:
-- -- delete from public.coupons where codigo = 'PRUEBA_TOPE';
