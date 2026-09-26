-- ============================================================================
-- LEMORA — Migración 0041: tope de 20 preguntas frecuentes.
--
-- PROBLEMA: `preguntas_frecuentes` no tenía ningún límite de cantidad. La
-- tabla no tenía CHECK ni trigger, el panel dejaba "Nueva pregunta" siempre
-- habilitado, y el acordeón de faq.html los muestra todos los que le lleguen,
-- sin recortar. Es la de tope más alto de las cinco y a propósito: 20
-- preguntas cubren un FAQ de tienda con holgura, y frena el caso de usar la
-- tabla como un block de notas en vez de como un FAQ.
--
-- SOLUCIÓN: un trigger BEFORE INSERT que rechaza la vigésimoprimera pregunta.
-- El tope cuenta TODAS las filas (activas e inactivas), que es lo que ve y
-- administra el admin en la tabla. Desactivar una pregunta la saca del acordeón
-- pero no la borra, y no libera lugar: hay que borrarla.
--
-- POR QUÉ EN LA BD Y NO SÓLO EN EL PANEL:
-- El panel es la puerta de entrada cómoda, pero no es la única. La anon key
-- está expuesta en el bundle público (js/env.generated.js) y la policy
-- "Preguntas frecuentes: admin full" es `for all`, así que un admin con la
-- sesión abierta puede insertar por API sin pasar por la UI. Un límite que vive
-- sólo en el JavaScript se esquiva con una línea de curl; el trigger no. Es el
-- mismo criterio con el que 0031 revocó el EXECUTE de sus funciones, y el
-- mismo que 0035 a 0040 aplicaron a las otras cinco tablas.
--
-- QUE EL COUNT CUENTE TODAS LAS FILAS (y no sólo las activas):
-- Hay dos policies de SELECT sobre la tabla y Postgres las ORea, no las ANDea:
--   · "Preguntas frecuentes: lectura pública" (0014) → `using (activo = true)`
--   · "Preguntas frecuentes: admin full" (0026)      → `using (public.es_admin())`
-- Ojo: esta tabla endureció sus policies en 0026, no en 0007 como las otras.
-- El único rol que puede INSERTAR es el que pasa `with check (es_admin())`, y
-- ese mismo rol cumple la segunda policy, así que para él el count ve la tabla
-- entera. Un `authenticated` que no sea admin sólo vería los activos, pero
-- tampoco puede escribir: el trigger no llega a corre para él. Por eso el count
-- NO necesita definer — y no hay que agregarlo: abriría la función a `anon`.
--
-- ESTA TABLA YA TIENE UNA FUNCIÓN DE CONTEO, Y NO HAY QUE REUSARLA:
-- `public.contar_preguntas_frecuentes()` (0015) es `security definer` y hace
-- exactamente `select count(*) from public.preguntas_frecuentes`, o sea que
-- cuenta lo mismo que este trigger. Existe por otro motivo: el front la usa
-- para distinguir "tabla vacía" (cae al FAQ estático) de "todas ocultas"
-- (se oculta la sección), algo que la RLS no permite resolver con un SELECT
-- porque `activo = true` ya filtró las ocultas.
--
-- El trigger NO la llama, y conviene que siga así. Si la usara, el trigger
-- seguiría funcionando (no cambia el número), pero pasaría de depender de las
-- policies de RLS a depender de los permisos de EXECUTE: 0031 ya revocó el
-- EXECUTE de las funciones de esa tabla, y ampliar quién puede llamar a un
-- definer para un chequeo que el propio admin puede hacer con un select es
-- volver a abrir lo que 0031 cerró. Un `count(*)` con security invoker no
-- necesita permiso ninguno: el rol administrador ya puede correrlo.
--
-- ATENCIÓN ANTES DE CORRERLA: el total acá se puede verificar sin panel.
-- `contar_preguntas_frecuentes` se puede llamar con la anon key y cuenta
-- TODAS las filas, incluidas las ocultas. Al consultarla dio 1, o sea que hay
-- una sola pregunta y el id 1 fue borrado (no ocultado). Con 20 de tope hay
-- lugar de sobra y no hace falta mirar nada más. Queda anotado igual el PASO
-- 1, que es el que confirma el número desde la base.
--
-- QUÉ PASA SI YA HUBIERA MÁS DE 20: esta migración NO borra nada. Si la tabla
-- llegó a tener más, el trigger los deja en paz (sólo bloquea inserts nuevos) y
-- el panel avisa que hay que borrar para volver a crear. Es deliberado: una
-- migración no debería borrar contenido del admin sin que lo pida.
--
-- NUMERACIÓN: continúa la de 0040. El 0034 (interruptor de imágenes de
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
create or replace function public.limitar_preguntas_frecuentes()
returns trigger
language plpgsql
as $$
declare
    maximo constant integer := 20;
    actuales integer;
begin
    -- `select count(*)`, no `public.contar_preguntas_frecuentes()`. Ver la
    -- nota del encabezado: la función de 0015 es security definer y no hace
    -- falta para esto.
    select count(*) into actuales from public.preguntas_frecuentes;

    if actuales >= maximo then
        raise exception using
            errcode = 'check_violation',
            message = format(
                'El FAQ admite máximo %s preguntas. Ya hay %s: borrá alguna antes de crear otra.',
                maximo, actuales
            );
    end if;

    return new;
end;
$$;

comment on function public.limitar_preguntas_frecuentes() is
    'Tope de 20 preguntas en preguntas_frecuentes. BEFORE INSERT: bloquea la 21ra. No usa contar_preguntas_frecuentes() (0015) a propósito: es security definer y el count no lo necesita. security invoker.';

-- ----------------------------------------------------------------------------
-- TRIGGER
-- ----------------------------------------------------------------------------
drop trigger if exists trg_preguntas_frecuentes_max on public.preguntas_frecuentes;

create trigger trg_preguntas_frecuentes_max
    before insert on public.preguntas_frecuentes
    for each row execute function public.limitar_preguntas_frecuentes();

-- Sin tocar los UPDATE: editar una pregunta existente no cambia la cantidad, así
-- que no tiene por qué pasar por el tope. Corregir la respuesta, cambiarla el
-- ícono o el orden siguen funcionando con la lista llena.

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — Cuántas hay en total. Con 20 de tope y 1 fila, no hay apuro, pero
-- es el número que decide si el trigger bloquea inserts desde el primer día.
-- ============================================================================
-- select count(*)                          as total,
--        count(*) filter (where activo)     as activos,
--        count(*) filter (where not activo) as ocultas
--   from public.preguntas_frecuentes;
-- -- Referencia: la policy pública muestra 1 activa (id 2), y
-- -- contar_preguntas_frecuentes() da 1 en total, o sea que no hay ocultas.
-- --   total < 20 -> hay lugar, aplicá sin más.

-- ============================================================================
-- PASO 2 — El detalle, para saber por dónde empezar a limpiar si hiciera
-- falta. NO borra nada.
-- ============================================================================
-- select id, position, activo, left(pregunta, 60) as pregunta
--   from public.preguntas_frecuentes
--  order by activo desc, position, id;
-- -- Las `activo = false` son las que primero sobran: no se ven en el acordeón
-- -- y siguen ocupando lugar en el tope.

-- ============================================================================
-- PASO 3 — El trigger está instalado (esperado: 1 fila).
-- ============================================================================
-- select tgname, tgenabled
--   from pg_trigger
--  where tgname = 'trg_preguntas_frecuentes_max';
-- -- tgenabled = 'O' = habilitado (origin). 'D' = deshabilitado.

-- ============================================================================
-- PASO 4 — Probar de verdad (opcional). Es un insert real; dejalo commented
-- salvo que quieras crear una pregunta de prueba y borrarla después.
-- `pregunta` es not null.
-- ============================================================================
-- insert into public.preguntas_frecuentes (pregunta, respuesta)
--      values ('PRUEBA TOPE', 'Respuesta de prueba para verificar el tope.');
-- -- Si ya hay 20: error "El FAQ admite máximo 20 preguntas..."  ✓
-- -- Si hay menos de 20: se inserta. Borralo con:
-- -- delete from public.preguntas_frecuentes where pregunta = 'PRUEBA TOPE';
