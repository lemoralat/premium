-- ============================================================================
-- LEMORA — Migración 0051: tipo de web (venta / turnos) + solicitudes de turno
--
-- Nueva función de producto: el dueño elige, desde Configuración → "Tipo de
-- web", si su web es para COMPRAR (comportamiento actual) o para SOLICITAR
-- TURNOS. En modo turnos:
--   · /carrito deja de ser checkout y pasa a ser un formulario de solicitud;
--   · la solicitud se registra en la tabla nueva public.turnos;
--   · el panel administra los turnos desde una sección "Turnos".
--
-- QUÉ CREA ESTA MIGRACIÓN
--  1) settings.modo_web  ('venta' | 'turnos', default 'venta': ninguna base
--     existente cambia de comportamiento hasta que el dueño lo elija).
--  2) Secuencia turnos_numero_seq + tabla public.turnos con RLS al estilo de
--     orders (migración 0007): solo lectura + cambio de estado por admin; el
--     alta entra ÚNICAMENTE por la RPC insertar_turno (service_role).
--  3) RPC insertar_turno con el mismo estándar de insertar_pedido (0048):
--     idempotencia por token, anti-spam de 10 solicitudes/hora por correo,
--     validaciones server-side, set search_path, y sin EXECUTE para
--     anon/authenticated.
--
-- RE-EJECUTABLE: todo es `create ... if not exists` / `create or replace` /
-- `drop policy if exists`, dentro de begin/commit. Si algo falla, revierte.
--
-- APLICACIÓN: SQL Editor del dashboard. Correr el archivo completo. Al final
-- registra su nombre en public.schema_migrations (si 0045 ya corrió).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) TIPO DE WEB (settings.modo_web)
-- ----------------------------------------------------------------------------
alter table public.settings
    add column if not exists modo_web text not null default 'venta'
    check (modo_web in ('venta', 'turnos'));

comment on column public.settings.modo_web is
    'Tipo de web: venta (tienda, comportamiento actual) o turnos (agenda). En modo turnos /carrito es un formulario de solicitud y la tienda no muestra carrito, cantidades ni totales. Default venta: ninguna base cambia hasta elegirlo.';

-- ----------------------------------------------------------------------------
-- 2) TABLA public.turnos (espejo del modelo de orders, cf. 0001_schema.sql)
-- ----------------------------------------------------------------------------
create sequence if not exists public.turnos_numero_seq;

create table if not exists public.turnos (
    id           bigint generated always as identity primary key,
    -- Numeración TRN-#### secuencial (misma idea que orders_numero_seq).
    numero       text not null unique,
    -- Token único para idempotencia (reenvío / doble clic / reintento de red).
    token        uuid not null default gen_random_uuid(),
    -- Snapshot del cliente: nombre, telefono, email.
    cliente      jsonb not null,
    -- Fecha y hora preferidas. Se guardan como texto (date/time del cliente o
    -- texto libre): la agenda es del negocio, el sistema solo registra.
    fecha        text not null,
    hora         text not null default '',
    -- Servicio solicitado (null si el turno no vino de una ficha de producto).
    producto_ref jsonb,
    notas        text not null default '',
    estado       text not null default 'Pendiente'
                 check (estado in ('Pendiente', 'Confirmado', 'Realizado', 'Cancelado')),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.turnos is
    'Solicitudes de turno. cliente es un snapshot jsonb (nombre, telefono, email); fecha/hora preferidas; producto_ref es el servicio desde el que se pidio (opcional); estado lo administra el panel. El alta entra solo por la RPC insertar_turno (service_role).';

-- Idempotencia por token: un mismo token no puede crear dos solicitudes.
create unique index if not exists turnos_token_unique_idx on public.turnos (token);

-- RLS al estilo de orders (0007, V-6): lectura + cambio de estado solo por
-- admin; escritura directa revocada (el alta entra por RPC con service_role).
alter table public.turnos enable row level security;

drop policy if exists "Turnos: lectura de administrador" on public.turnos;
create policy "Turnos: lectura de administrador"
    on public.turnos for select
    to authenticated
    using (public.es_admin());

revoke insert, update, delete on public.turnos from anon, authenticated;

-- El panel administra el ESTADO del turno (Pendiente → Confirmado/Realizado/
-- Cancelado). Solo esa columna a `authenticated` y solo si es admin.
grant update (estado) on public.turnos to authenticated;
drop policy if exists "Turnos: cambio de estado por administrador" on public.turnos;
create policy "Turnos: cambio de estado por administrador"
    on public.turnos for update
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

-- ----------------------------------------------------------------------------
-- 3) RPC insertar_turno (única vía de alta; la invoca api/turno.js con
--    service_role). Mismo estándar que insertar_pedido (0048): idempotencia
--    por token, anti-spam por correo, validaciones server-side y
--    set search_path.
-- ----------------------------------------------------------------------------
create or replace function public.insertar_turno(
    p_cliente  jsonb,
    p_fecha    text,
    p_hora     text default '',
    p_producto jsonb default null,
    p_notas    text default null,
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
begin
    -- 0) IDEMPOTENCIA: si el token ya dio de alta una solicitud, devolvemos
    --    esa solicitud (reenvío, doble clic, reintento de red).
    if p_token is not null then
        select id, numero, cliente, fecha, hora, producto_ref, notas, token, estado
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

    -- 1) Insertar (token: el del cliente si es válido, si no uno nuevo).
    --    producto_ref se normaliza a id + nombre (nada del cuerpo libre).
    insert into public.turnos (numero, cliente, fecha, hora, producto_ref, notas, token)
    select 'TRN-' || lpad(nextval('public.turnos_numero_seq')::text, 4, '0'),
           p_cliente,
           btrim(p_fecha),
           btrim(coalesce(p_hora, '')),
           case
               when p_producto is null or p_producto->>'id' is null then null
               else jsonb_build_object('id', p_producto->>'id', 'nombre', p_producto->>'nombre')
           end,
           btrim(coalesce(p_notas, '')),
           coalesce(p_token, gen_random_uuid())
    returning id into v_turno_id;

    -- 2) Respuesta: la fuente de verdad para el mensaje de WhatsApp y para la
    --    página de gracias (mismo criterio que 0028/0048).
    return jsonb_build_object(
        'status',   'success',
        'numero',   (select numero       from public.turnos where id = v_turno_id),
        'fecha',    (select fecha        from public.turnos where id = v_turno_id),
        'hora',     (select hora         from public.turnos where id = v_turno_id),
        'producto', (select producto_ref from public.turnos where id = v_turno_id),
        'token',    (select token        from public.turnos where id = v_turno_id)
    );
exception
    when unique_violation then
        -- Carrera de doble envío: el mismo token ya existe. Devolvemos la
        -- solicitud previa sin duplicar nada.
        if p_token is not null then
            select id, numero, cliente, fecha, hora, producto_ref, notas, token, estado
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
revoke execute on function public.insertar_turno(jsonb, text, text, jsonb, text, uuid) from anon, authenticated;
grant execute on function public.insertar_turno(jsonb, text, text, jsonb, text, uuid) to service_role;

comment on function public.insertar_turno(jsonb, text, text, jsonb, text, uuid) is
    'Registra una solicitud de turno en una transacción: valida nombre/teléfono/email/fecha, genera el numero TRN-####, registra el turno y devuelve la solicitud como fuente de verdad. Protecciones: idempotencia por token, anti-spam de 10 solicitudes/hora por correo y set search_path (migración 0051).';

-- ----------------------------------------------------------------------------
-- 3.1) RPC borrar_turnos (el panel elimina solicitudes; espejo de
--      borrar_pedidos, 0025). La escritura directa sobre `turnos` está
--      bloqueada, así que el borrado entra por esta RPC security definer con
--      validación de es_admin() contra el JWT.
-- ----------------------------------------------------------------------------
create or replace function public.borrar_turnos(p_ids bigint[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_borrados bigint;
begin
    if not public.es_admin() then
        raise exception 'Acceso denegado: se requiere sesión de administrador';
    end if;

    if p_ids is null or array_length(p_ids, 1) is null then
        return 0;
    end if;

    delete from public.turnos where id = any (p_ids);
    get diagnostics v_borrados = row_count;
    return v_borrados;
end;
$$;

comment on function public.borrar_turnos(bigint[]) is
    'Borra una o varias solicitudes de turno. Solo administradores: valida public.es_admin() con el JWT. Devuelve cuántas se borraron.';

-- Solo `authenticated` (el check de es_admin() adentro lo restringe a admin).
revoke all on function public.borrar_turnos(bigint[]) from public;
grant execute on function public.borrar_turnos(bigint[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Registro en schema_migrations (si 0045 ya creó la tabla)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0051_tipo_web_turnos')
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
-- -- Esperado: 0051_tipo_web_turnos en primer lugar.

-- ============================================================================
-- PASO 2 — La columna existe con default 'venta' (no cambia tiendas actuales).
-- ============================================================================
-- select column_name, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'settings'
--    and column_name = 'modo_web';
-- -- Esperado: modo_web | 'venta'::text | NO

-- ============================================================================
-- PASO 3 — Turnos: escritura directa bloqueada; solo la columna estado; y la
--          anon key no puede invocar la RPC (solo service_role).
-- ============================================================================
-- select has_table_privilege('authenticated','public.turnos','insert')   as turnos_insert,
--        has_table_privilege('authenticated','public.turnos','update')   as turnos_update,
--        has_table_privilege('authenticated','public.turnos','delete')   as turnos_delete,
--        has_column_privilege('authenticated','public.turnos','estado','update') as turnos_estado;
-- -- Esperado: false | false | false | true
--
-- select has_function_privilege('anon',         'public.insertar_turno(jsonb,text,text,jsonb,text,uuid)', 'execute') as anon_puede_invocar,
--        has_function_privilege('service_role', 'public.insertar_turno(jsonb,text,text,jsonb,text,uuid)', 'execute') as service_role_puede_invocar;
-- -- Esperado: false | true
--
-- select has_function_privilege('anon', 'public.borrar_turnos(bigint[])', 'execute')   as anon_puede_borrar,
--        has_function_privilege('authenticated', 'public.borrar_turnos(bigint[])', 'execute') as auth_puede_borrar;
-- -- Esperado: false | true

-- ============================================================================
-- PASO 4 — Policies de turnos (debe haber lectura y cambio de estado, ambas
--          con es_admin(); ninguna permisiva).
-- ============================================================================
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public' and tablename = 'turnos'
--  order by policyname;
-- -- Esperado: "Turnos: lectura de administrador" (SELECT, es_admin()) y
-- --           "Turnos: cambio de estado por administrador" (UPDATE, es_admin()).
-- ============================================================================