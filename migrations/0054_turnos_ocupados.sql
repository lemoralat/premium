-- ============================================================================
-- LEMORA — Migración 0054: disponibilidad de turnos (ocupados por confirmados)
--
-- CONTEXTO
--   En modo turnos la solicitud de turno ofrece fecha/hora según la agenda de
--   los servicios (products.servicio_horarios, 0053), pero NADA consultaba la
--   tabla `turnos`: un horario confirmado desde el panel seguía apareciendo
--   como disponible y se podía volver a reservar. Esta migración cierra ese
--   hueco en dos planos:
--
--   1) RPC pública public.turnos_ocupados(desde, hasta) → (fecha, hora,
--      duracion): la tienda (anon key) no puede leer `turnos` por RLS, así que
--      el frontend consulta por esta RPC security definer qué horarios ya están
--      tomados. Solo expone fecha/hora/duración: nunca datos del cliente.
--
--   2) insertar_turno valida disponibilidad server-side: rechaza (409) una
--      solicitud cuyo intervalo [hora, hora + duración) se superponga con el de
--      un turno Confirmado/Realizado de la misma fecha. El filtro del frontend
--      es UX; la garantía real está acá (el servidor es la única fuente de
--      verdad, mismo criterio que insertar_pedido con el stock).
--
--   QUÉ ESTADOS OCUPAN EL HORARIO:
--     · Confirmado → ocupa (es el caso reportado: al confirmar en el panel el
--       horario debe dejar de ofrecerse).
--     · Realizado  → ocupa (pasado; se incluye por completitud).
--     · Pendiente  → NO ocupa (es solo una solicitud que el negocio coordina y
--       confirma por WhatsApp; recién ahí bloquea).
--     · Cancelado  → NO ocupa (libera el horario).
--
--   Duración de la franja ocupada: suma de products.servicio_duracion_min de
--   los servicios del turno (turnos.items). Un servicio sin duración declarada
--   o desconocido ocupa el paso de agenda (15 min, igual que PASO_TURNO_MIN
--   del frontend) para no infra-bloquear.
--
-- REEJECUTABLE: create or replace / revoke idempotente, dentro de begin/commit.
--
-- APLICACIÓN: SQL Editor del dashboard. Correr el archivo completo. Al final
-- registra su nombre en public.schema_migrations (si 0045 ya corrió).
--   IMPORTANTE: correr DESPUÉS de la 0053 (esta reemplaza la misma firma de
--   insertar_turno). Si la 0053 se re-ejecutara después de la 0054, su
--   `create or replace` volvería a la versión sin chequeo de disponibilidad:
--   en ese caso hay que volver a correr la 0054 (el panel de Supabase no
--   permite el downgrade por sí solo).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) RPC PÚBLICA turnos_ocupados — qué horarios están tomados
--    (security definer: el dueño de la función ignora la RLS de `turnos` pero
--    solo devuelve datos de agenda, jamás información del cliente).
-- ----------------------------------------------------------------------------
create or replace function public.turnos_ocupados(
    p_desde text default '',
    p_hasta text default ''
)
returns table (fecha text, hora text, duracion integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_turno record;
    v_item  jsonb;
    v_dur   integer;
begin
    for v_turno in
        select t.fecha, t.hora, t.items
          from public.turnos t
         where t.estado in ('Confirmado', 'Realizado')
           and btrim(t.fecha) <> ''
           and (btrim(p_desde) = '' or btrim(t.fecha) >= btrim(p_desde))
           and (btrim(p_hasta) = '' or btrim(t.fecha) <= btrim(p_hasta))
         order by t.fecha, t.hora
    loop
        -- Duración de la franja ocupada por el turno (suma por servicio).
        v_dur := 0;
        if jsonb_typeof(v_turno.items) = 'array' then
            for v_item in select * from jsonb_array_elements(v_turno.items) loop
                if (v_item->>'id') ~ '^[0-9]+$' then
                    v_dur := v_dur + coalesce(
                        nullif(
                            (select s.servicio_duracion_min
                               from public.products s
                              where s.id = (v_item->>'id')::int),
                            0),
                        15);
                else
                    v_dur := v_dur + 15;
                end if;
            end loop;
        end if;

        -- Sin hora puntual no hay franja que bloquear (se coordina después).
        if v_turno.hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
            fecha    := v_turno.fecha;
            hora     := v_turno.hora;
            duracion := greatest(v_dur, 1);
            return next;
        end if;
    end loop;
end;
$$;

comment on function public.turnos_ocupados(text, text) is
    'Modo turnos (0054): horarios ya tomados (Confirmado/Realizado) para que la tienda no los ofrezca. Devuelve fecha, hora y duración en minutos de cada franja ocupada. Solo expone datos de agenda, nunca información del cliente. La RLS no deja leer public.turnos a la anon key; esta RPC security definer es la única ventana de solo-agenda para el frontend.';

-- Solo lectura de agenda; revoke a public y grant a anon/authenticated.
revoke all on function public.turnos_ocupados(text, text) from public, anon, authenticated;
grant execute on function public.turnos_ocupados(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) insertar_turno — validación de disponibilidad server-side (misma firma
--    que la 0053; create or replace mantiene los grants de service_role).
-- ----------------------------------------------------------------------------
create or replace function public.insertar_turno(
    p_cliente  jsonb,
    p_fecha    text,
    p_hora     text default '',
    p_producto jsonb default null,
    p_notas    text default null,
    p_items    jsonb default null,
    p_token    uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
    v_turno_id    bigint;
    v_email       text;
    v_turnos_hora integer;
    v_prev        record;
    v_nombre      text;
    v_telefono    text;
    -- Normalización de items (servicios del carrito)
    v_items       jsonb := '[]'::jsonb;
    v_item        jsonb;
    v_id          text;
    v_nom         text;
    v_var         text;
    v_cant        integer;
    v_precio      numeric;
    v_i           integer;
    -- Disponibilidad (0054)
    v_ocupado     record;
    v_it          jsonb;
    v_inicio_nueva integer;
    v_dur_nueva    integer;
    v_inicio_ocup  integer;
    v_dur_ocup     integer;
begin
    -- 0) IDEMPOTENCIA: si el token ya dio de alta una solicitud, devolvemos
    --    esa solicitud completa (incluidos items y total).
    if p_token is not null then
        select id, numero, cliente, fecha, hora, producto_ref, notas, items, token, estado
          into v_prev
          from public.turnos
         where token = p_token;
        if found then
            return jsonb_build_object(
                'status',      'success',
                'numero',      v_prev.numero,
                'fecha',       v_prev.fecha,
                'hora',        v_prev.hora,
                'producto',    v_prev.producto_ref,
                'items',       v_prev.items,
                'total',       coalesce(
                                   (select sum((i->>'cantidad')::numeric
                                             * coalesce((i->>'precio_unitario')::numeric, 0))
                                      from jsonb_array_elements(coalesce(v_prev.items, '[]'::jsonb)) i),
                                   0),
                'token',       v_prev.token,
                'idempotente', true
            );
        end if;
    end if;

    -- 0.1) Validación server-side de la estructura (no confiar en el cliente).
    if p_cliente is null or p_fecha is null or btrim(p_fecha) = '' then
        raise exception 'Estructura de solicitud inválida';
    end if;

    v_nombre   := btrim(coalesce(p_cliente->>'nombre', ''));
    v_telefono := btrim(coalesce(p_cliente->>'telefono', ''));
    v_email    := lower(btrim(coalesce(p_cliente->>'email', '')));

    if v_nombre = '' then
        raise exception 'El nombre es obligatorio';
    end if;
    if v_telefono = ''
       or v_telefono !~ '^[0-9\s+\-()]+$'
       or length(regexp_replace(v_telefono, '\D', '', 'g')) not between 7 and 15 then
        raise exception 'Ingresá un teléfono válido (solo números, entre 7 y 15 dígitos)';
    end if;
    if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Ingresá un email válido';
    end if;

    -- 0.2) ANTI-SPAM: el mismo correo no puede registrar más de 10 solicitudes
    --      en la última hora.
    if v_email <> '' then
        select count(*) into v_turnos_hora
          from public.turnos
         where lower(btrim(cliente->>'email')) = v_email
           and created_at >= now() - interval '1 hour';
        if v_turnos_hora >= 10 then
            raise exception 'Demasiadas solicitudes desde este correo. Intentá de nuevo en unos minutos.';
        end if;
    end if;

    -- 0.3) ITEMS (servicios del carrito): se aceptan array, se normaliza cada
    --      línea a un snapshot fijo (id, nombre, variante_texto, cantidad,
    --      precio_unitario). Nada del cuerpo libre pasa a la base tal cual.
    if p_items is not null then
        if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
            raise exception 'Estructura de solicitud inválida';
        end if;

        for v_i in 0 .. jsonb_array_length(p_items) - 1 loop
            v_item := p_items -> v_i;
            if v_item is null or jsonb_typeof(v_item) <> 'object' then
                continue;
            end if;

            v_id := btrim(coalesce(v_item->>'id', ''));
            v_nom := btrim(coalesce(v_item->>'nombre', ''));
            if v_id = '' or v_nom = '' then
                continue;
            end if;

            v_var := left(btrim(coalesce(v_item->>'variante_texto', '')), 250);

            -- Cantidad: entero 1..999 (fuera de rango/inválido → 1).
            if v_item->>'cantidad' ~ '^[0-9]+$' then
                v_cant := greatest(1, least(999, (v_item->>'cantidad')::integer));
            else
                v_cant := 1;
            end if;

            -- Precio unitario: 0..1.000.000.000 (inválido → 0).
            if v_item->>'precio_unitario' ~ '^[0-9]+(\.[0-9]+)?$' then
                v_precio := greatest(0, least(1000000000, (v_item->>'precio_unitario')::numeric));
            else
                v_precio := 0;
            end if;

            v_items := v_items || jsonb_build_object(
                'id',             left(v_id, 100),
                'nombre',         left(v_nom, 200),
                'variante_texto', v_var,
                'cantidad',       v_cant,
                'precio_unitario', v_precio
            );
        end loop;
    end if;

    -- 0.4) DISPONIBILIDAD (0054): un horario Confirmado/Realizado de la misma
    --      fecha ocupa su franja y esta solicitud se rechaza. Pendiente y
    --      Cancelado no bloquean (solicitud sin confirmar / horario liberado).
    --      Sin hora puntual no hay franja que validar (se coordina después).
    if btrim(coalesce(p_hora, '')) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        -- Duración del turno solicitado: suma de la duración de los servicios
        -- del carrito (15 min por servicio sin duración declarada).
        v_dur_nueva := 0;
        if jsonb_typeof(v_items) = 'array' then
            for v_it in select * from jsonb_array_elements(v_items) loop
                if (v_it->>'id') ~ '^[0-9]+$' then
                    v_dur_nueva := v_dur_nueva + coalesce(
                        nullif(
                            (select s.servicio_duracion_min
                               from public.products s
                              where s.id = (v_it->>'id')::int),
                            0),
                        15);
                else
                    v_dur_nueva := v_dur_nueva + 15;
                end if;
            end loop;
        end if;

        v_inicio_nueva := (split_part(p_hora, ':', 1))::int * 60
                        + (split_part(p_hora, ':', 2))::int;

        -- Seria por fecha: dos solicitudes simultáneas del mismo día se
        -- serializan y la segunda ve lo que la primera dejó committeado.
        perform pg_advisory_xact_lock(hashtext('turnos-dia:' || btrim(p_fecha)));

        for v_ocupado in
            select hora, items
              from public.turnos
             where btrim(fecha) = btrim(p_fecha)
               and estado in ('Confirmado', 'Realizado')
        loop
            if v_ocupado.hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
                v_inicio_ocup := (split_part(v_ocupado.hora, ':', 1))::int * 60
                               + (split_part(v_ocupado.hora, ':', 2))::int;

                v_dur_ocup := 0;
                if jsonb_typeof(v_ocupado.items) = 'array' then
                    for v_it in select * from jsonb_array_elements(v_ocupado.items) loop
                        if (v_it->>'id') ~ '^[0-9]+$' then
                            v_dur_ocup := v_dur_ocup + coalesce(
                                nullif(
                                    (select s.servicio_duracion_min
                                       from public.products s
                                      where s.id = (v_it->>'id')::int),
                                    0),
                                15);
                        else
                            v_dur_ocup := v_dur_ocup + 15;
                        end if;
                    end loop;
                end if;

                -- Superposición de intervalos [inicio, inicio + duración).
                if v_inicio_nueva < v_inicio_ocup + greatest(v_dur_ocup, 1)
                   and v_inicio_ocup < v_inicio_nueva + greatest(v_dur_nueva, 1) then
                    raise exception 'Ese horario ya no está disponible. Elegí otro día u horario.';
                end if;
            end if;
        end loop;
    end if;

    -- 1) Insertar. producto_ref se mantiene por compatibilidad (el frontend ya
    --    no lo usa: el turno viene del carrito en items).
    insert into public.turnos (numero, cliente, fecha, hora, producto_ref, notas, items, token)
    select 'TRN-' || lpad(nextval('public.turnos_numero_seq')::text, 4, '0'),
           p_cliente,
           btrim(p_fecha),
           btrim(coalesce(p_hora, '')),
           case
               when p_producto is null or p_producto->>'id' is null then null
               else jsonb_build_object('id', p_producto->>'id', 'nombre', p_producto->>'nombre')
           end,
           btrim(coalesce(p_notas, '')),
           v_items,
           coalesce(p_token, gen_random_uuid())
    returning id into v_turno_id;

    -- 2) Respuesta: fuente de verdad para el mensaje de WhatsApp y la página
    --    de gracias (ítems normalizados + total recalculado de la base).
    return jsonb_build_object(
        'status',   'success',
        'numero',   (select numero       from public.turnos where id = v_turno_id),
        'fecha',    (select fecha        from public.turnos where id = v_turno_id),
        'hora',     (select hora         from public.turnos where id = v_turno_id),
        'producto', (select producto_ref from public.turnos where id = v_turno_id),
        'items',    (select items        from public.turnos where id = v_turno_id),
        'total',    (select coalesce(
                            (select sum((i->>'cantidad')::numeric
                                      * coalesce((i->>'precio_unitario')::numeric, 0))
                               from jsonb_array_elements(t.items) i),
                            0)
                       from public.turnos t where id = v_turno_id),
        'token',    (select token        from public.turnos where id = v_turno_id)
    );
exception
    when unique_violation then
        -- Carrera de doble envío: el mismo token ya existe. Devolvemos la
        -- solicitud previa sin duplicar nada.
        if p_token is not null then
            select id, numero, cliente, fecha, hora, producto_ref, notas, items, token, estado
              into v_prev
              from public.turnos
             where token = p_token;
            if found then
                return jsonb_build_object(
                    'status',      'success',
                    'numero',      v_prev.numero,
                    'fecha',       v_prev.fecha,
                    'hora',        v_prev.hora,
                    'producto',    v_prev.producto_ref,
                    'items',       v_prev.items,
                    'total',       coalesce(
                                       (select sum((i->>'cantidad')::numeric
                                                 * coalesce((i->>'precio_unitario')::numeric, 0))
                                          from jsonb_array_elements(coalesce(v_prev.items, '[]'::jsonb)) i),
                                       0),
                    'token',       v_prev.token,
                    'idempotente', true
                );
            end if;
        end if;
        raise;
    when others then
        raise;
end;
$$;

-- La RPC solo la invoca api/turno.js (Vercel) con la service_role key.
revoke all on function public.insertar_turno(jsonb, text, text, jsonb, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.insertar_turno(jsonb, text, text, jsonb, text, jsonb, uuid) to service_role;

comment on function public.insertar_turno(jsonb, text, text, jsonb, text, jsonb, uuid) is
    'Registra una solicitud de turno: valida nombre/teléfono/email/fecha, normaliza los items del carrito (id, nombre, variante_texto, cantidad, precio_unitario), rechaza los horarios ocupados por un turno Confirmado/Realizado de la misma fecha (0054), genera el numero TRN-#### y devuelve la solicitud con items y total como fuente de verdad. Protecciones: idempotencia por token, anti-spam de 10 solicitudes/hora por correo, límites de payload sobre items, serialización por fecha con advisory lock y set search_path (migración 0054).';

-- ----------------------------------------------------------------------------
-- 3) Registro en schema_migrations (si 0045 ya creó la tabla)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0054_turnos_ocupados')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (correr por separado, después del commit).
--
-- PASO 1 — La migración quedó registrada.
-- ============================================================================
-- select nombre, aplicada_en from public.ultimas_migraciones
--  order by aplicada_en desc limit 3;
-- -- Esperado: 0054_turnos_ocupados en primer lugar.

-- ============================================================================
-- PASO 2 — Permisos: turnos_ocupados la puede llamar la anon key (frontend);
--          insertar_turno sigue cerrada a service_role.
-- ============================================================================
-- select has_function_privilege('anon',         'public.turnos_ocupados(text,text)', 'execute')           as anon_puede_consultar_ocupados,
--        has_function_privilege('service_role', 'public.turnos_ocupados(text,text)', 'execute')           as sr_puede_consultar_ocupados,
--        has_function_privilege('anon',         'public.insertar_turno(jsonb,text,text,jsonb,text,jsonb,uuid)', 'execute') as anon_puede_insertar;
-- -- Esperado: true | true | false

-- ============================================================================
-- PASO 3 — Comportamiento: un turno Confirmado aparece en turnos_ocupados y
--          una segunda solicitud del mismo horario se rechaza.
-- ============================================================================
-- -- (insertar un turno Confirmado a mano solo para probar, con service_role o el owner):
-- -- insert into public.turnos (numero, cliente, fecha, hora, items, estado)
-- -- select 'TRN-TEST', '{"nombre":"Prueba","telefono":"1111111111","email":""}',
-- --        '2026-12-01', '10:00', '[{"id":"' || (select id::text from public.products limit 1) || '","nombre":"Test","cantidad":1,"precio_unitario":0}]',
-- --        'Confirmado';
-- -- select * from public.turnos_ocupados('2026-12-01', '2026-12-01');
-- -- -- Esperado: 1 fila con fecha=2026-12-01, hora=10:00.
-- -- select public.insertar_turno(
-- --     '{"nombre":"Otro","telefono":"2222222222","email":""}', '2026-12-01', '10:00',
-- --     null, null, '[{"id":"' || (select id::text from public.products limit 1) || '","nombre":"Test","cantidad":1,"precio_unitario":0}]', null);
-- -- -- Esperado: raise 'Ese horario ya no está disponible. Elegí otro día u horario.'
-- ============================================================================