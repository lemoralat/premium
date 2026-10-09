-- ============================================================================
-- LEMORA — Migración 0053: servicios (duración + horarios) e ítems del turno
--
-- CONTEXTO
--   En modo turnos la tienda deja de ser "formulario suelto": ahora se comporta
--   como una tienda normal (precios, carrito, cupón) y SOLO el paso final pasa
--   a ser la solicitud de turno. Para eso:
--
--   1) LOS PRODUCTOS PASAN A SER SERVICIOS. Cada servicio puede declarar:
--        · servicio_duracion_min  → duración estimada en minutos;
--        · servicio_horarios       → horarios disponibles por día de la semana,
--          jsonb de la forma [{ "dia": "Lunes", "desde": "09:00", "hasta": "13:00" }].
--      Estos campos los edita el panel (sección Productos/Servicios), se
--      muestran en la ficha del servicio y sirven de guía en el formulario de
--      turno. Se guardan en `products` (misma tabla, nuevas columnas).
--
--   2) EL TURNO REGISTRA LOS ÍTEMS DEL CARRITO. `turnos` gana una columna
--      `items` (snapshot jsonb: id, nombre, variante_texto, cantidad,
--      precio_unitario) y `insertar_turno` cambia de firma para recibirla,
--      normalizarla del lado del servidor y devolver `items` + `total` como
--      fuente de verdad para el mensaje de WhatsApp y la página de gracias.
--      La firma vieja (sin p_items) se elimina: solo queda la nueva.
--
--   Seguridad: la nueva firma hereda el mismo criterio que 0051/0052 —
--   EXECUTE solo para service_role (el frontend llama a api/turno.js, que usa
--   la service role key del lado servidor). items se normaliza server-side,
--   con límites de largo y de cantidad de líneas (anti-abuso).
--
-- RE-EJECUTABLE: add column if not exists / create or replace / drop if
-- exists, dentro de begin/commit.
--
-- APLICACIÓN: SQL Editor del dashboard. Correr el archivo completo.
--   IMPORTANTE: correr DESPUÉS de la 0052 (ésta dropea la firma vieja que la
--   0052 revoca; si 0053 se corriera primero, la 0052 fallaría con
--   "function does not exist"). Al final registra su nombre en
--   public.schema_migrations.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) PRODUCTS → SERVICIOS (duración + horarios por día)
-- ----------------------------------------------------------------------------
alter table public.products
    add column if not exists servicio_duracion_min integer
        not null default 0
        check (servicio_duracion_min >= 0),
    add column if not exists servicio_horarios jsonb
        not null default '[]'::jsonb;

comment on column public.products.servicio_duracion_min is
    'Modo turnos: duración estimada del servicio en minutos. 0 = sin declarar.';
comment on column public.products.servicio_horarios is
    'Modo turnos: horarios disponibles por día de la semana, [{ "dia": "Lunes", "desde": "09:00", "hasta": "13:00" }]. Vacío = sin agenda declarada.';

-- ----------------------------------------------------------------------------
-- 2) TURNOS → items (snapshot de los servicios del carrito)
-- ----------------------------------------------------------------------------
alter table public.turnos
    add column if not exists items jsonb
        not null default '[]'::jsonb;

comment on column public.turnos.items is
    'Snapshot jsonb de los servicios solicitados desde el carrito: [{ id, nombre, variante_texto, cantidad, precio_unitario }]. Se normaliza en insertar_turno (server-side).';

-- ----------------------------------------------------------------------------
-- 3) RPC insertar_turno — nueva firma con p_items
--    Se elimina la firma vieja (jsonb, text, text, jsonb, text, uuid) y se
--    crea la nueva (jsonb, text, text, jsonb, text, jsonb, uuid).
-- ----------------------------------------------------------------------------
drop function if exists public.insertar_turno(jsonb, text, text, jsonb, text, uuid);

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
    'Registra una solicitud de turno: valida nombre/teléfono/email/fecha, normaliza los items del carrito (id, nombre, variante_texto, cantidad, precio_unitario), genera el numero TRN-#### y devuelve la solicitud con items y total como fuente de verdad. Protecciones: idempotencia por token, anti-spam de 10 solicitudes/hora por correo, límites de payload sobre items y set search_path (migración 0053).';

-- ----------------------------------------------------------------------------
-- 4) Registro en schema_migrations (si 0045 ya creó la tabla)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0053_servicios_y_items_turnos')
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
-- -- Esperado: 0053_servicios_y_items_turnos en primer lugar.

-- ============================================================================
-- PASO 2 — Columnas nuevas en products y turnos.
-- ============================================================================
-- select table_name, column_name, data_type, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and ((table_name = 'products' and column_name in ('servicio_duracion_min', 'servicio_horarios'))
--      or (table_name = 'turnos' and column_name = 'items'))
--  order by table_name, column_name;
-- -- Esperado: products.servicio_duracion_min (integer, 0), products.servicio_horarios (jsonb, '[]'),
-- --           turnos.items (jsonb, '[]').

-- ============================================================================
-- PASO 3 — Permisos de la RPC nueva: EXECUTE solo service_role. La firma vieja
--          ya no existe.
-- ============================================================================
-- select has_function_privilege('anon',         'public.insertar_turno(jsonb,text,text,jsonb,text,jsonb,uuid)', 'execute') as anon_puede_invocar,
--        has_function_privilege('service_role', 'public.insertar_turno(jsonb,text,text,jsonb,text,jsonb,uuid)', 'execute') as service_role_puede_invocar;
-- -- Esperado: false | true
--
-- select count(*) as firmas_viejas
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'insertar_turno'
--    and p.pronargs = 6;
-- -- Esperado: 0 (la firma sin items se eliminó).
-- ============================================================================