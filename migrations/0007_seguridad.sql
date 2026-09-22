-- ============================================================================
-- LEMORA — Migración 0007: Seguridad (auditoría Fases 1–23).
--
-- Corrige:
--   V-1 CRÍTICA: toda policy admin pasa a exigir `public.es_admin()` sobre una
--       tabla `admins` explícita (alta manual, sin auto-promoción). Se elimina
--       el `role default 'admin'` de `profiles`.
--   V-3 ALTA    : la RPC `insertar_pedido` deja de ser invocable por
--       anon/authenticated (solo service_role, vía api/pedido.js), se agrega
--       idempotencia por token (índice UNIQUE) y un tope anti-spam por correo.
--   V-4 ALTA    : las escrituras de Storage quedan restringidas a es_admin().
--   V-6 MEDIA   : `orders`/`order_items` dejan de aceptar INSERT y cambios de
--       montos por la API de Supabase; solo lectura + cambio de estado (columna
--       `estado`) por admin. El alta entra exclusivamente por la RPC serverless.
--
-- APLICACIÓN (SQL Editor del dashboard):
--   1) Correr esta migración.
--   2) Dar de alta al administrador real ANTES de cerrar la sesión actual:
--        insert into public.admins (user_id)
--        select id from auth.users where email = 'TU-EMAIL@EJEMPLO.COM';
--      (Reemplazá el correo por el de la cuenta que usás para entrar al panel.)
--   3) En Authentication → Sign In / Providers: desactivar "Allow new users
--      to sign up" (evita que cualquiera cree una cuenta; aunque la creen,
--      ya NO tendría permisos de admin sin estar en `admins`).
--
-- RE-EJECUTABLE: cada create policy dropea antes el mismo nombre y todo corre
-- dentro de una transacción (begin/commit): si algo falla, revierte completo y
-- no queda un estado parcial. Podés correrla tantas veces como necesites.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) ADMINISTRADORES EXPLÍCITOS (V-1)
-- ----------------------------------------------------------------------------
-- Tabla de quién es admin. Sin `profiles.role`: el rol por defecto deja de
-- regalar el panel a cualquier usuario registrado.
create table if not exists public.admins (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

comment on table public.admins is 'Usuarios con acceso administrativo. Alta manual: insert into public.admins (user_id) select id from auth.users where email = ...;';

-- RLS activa y SIN políticas para anon/authenticated: nadie puede leerla ni
-- autopromoverse. Solo service_role (o el dueño SQL) puede administrarla.
alter table public.admins enable row level security;

-- ¿El usuario autenticado actual es admin? (security definer: lee `admins`
-- sin exponer la tabla; el resultado depende del JWT, no de privilegios).
create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.admins where user_id = auth.uid()
    );
$$;

-- El panel la consulta vía RPC con su sesión (autenticado). También queda
-- cubierto por los default privileges (execute a anon/authenticated).
grant execute on function public.es_admin() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) PROFILES: nadie nace admin (V-1)
-- ----------------------------------------------------------------------------
alter table public.profiles alter column role set default 'cliente';
update public.profiles set role = 'cliente' where role = 'admin';

comment on column public.profiles.role is 'Rol informativo (cliente/admin). El acceso real se controla con la tabla public.admins.';

-- ----------------------------------------------------------------------------
-- 3) PEDIDOS: idempotencia por token + anti-spam (V-3) y solo-lectura (V-6)
-- ----------------------------------------------------------------------------
-- Token único en toda la tabla: un mismo token (reenvío por doble clic o
-- reintento de red) no puede crear dos pedidos.
create unique index if not exists orders_token_unique_idx on public.orders (token);

drop policy if exists "Pedidos: acceso de administrador" on public.orders;
drop policy if exists "Pedidos: lectura de administrador" on public.orders;
create policy "Pedidos: lectura de administrador"
    on public.orders for select
    to authenticated
    using (public.es_admin());

drop policy if exists "Líneas pedido: acceso de administrador" on public.order_items;
drop policy if exists "Líneas pedido: lectura de administrador" on public.order_items;
create policy "Líneas pedido: lectura de administrador"
    on public.order_items for select
    to authenticated
    using (public.es_admin());

-- Escritura directa (INSERT/UPDATE/DELETE) bloqueada a anon/authenticated:
-- el alta de pedidos entra ÚNICAMENTE por la RPC insertar_pedido (service_role),
-- que recalcula precios/cupón/stock en el servidor. Esto cierra el bypass de
-- negocio (V-6): nadie puede "inventar" un pedido con totales a medida.
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;

-- El panel necesita cambiar el ESTADO del pedido (Pendiente → Procesando...).
-- Le devolvemos SOLO esa columna a `authenticated` y solo si es admin:
-- no puede tocar cliente, montos, cupón ni token (privilegio a nivel columna).
grant update (estado) on public.orders to authenticated;
drop policy if exists "Pedidos: cambio de estado por administrador" on public.orders;
create policy "Pedidos: cambio de estado por administrador"
    on public.orders for update
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

-- RPC con idempotencia y tope anti-spam
create or replace function public.insertar_pedido(
    p_cliente jsonb,
    p_items   jsonb,
    p_cupon   text default null,
    p_token   uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
    v_subtotal      numeric := 0;
    v_descuento     numeric := 0;
    v_porcentaje    numeric := 0;
    v_total         numeric := 0;
    v_threshold     numeric;
    v_discount_pct  numeric;
    v_cupon_final   text := 'NINGUNO';
    v_cupon_monto   numeric := 0;
    v_cupon_pct     numeric;
    v_item          jsonb;
    v_product       record;
    v_qty           integer;
    v_pedido_id     bigint;
    v_email         text;
    v_pedidos_hora  integer;
    v_prev          record;
begin
    -- 0) IDEMPOTENCIA: si el token ya dio de alta un pedido, devolvemos ese
    --    pedido sin validar stock ni tocar stock (reenvío, doble clic).
    if p_token is not null then
        select numero, subtotal, descuento, porcentaje, cupon, total, token
          into v_prev
          from public.orders
         where token = p_token;
        if found then
            return jsonb_build_object(
                'status',       'success',
                'numero',       v_prev.numero,
                'subtotal',     v_prev.subtotal,
                'descuento',    v_prev.descuento,
                'porcentaje',   v_prev.porcentaje,
                'total',        v_prev.total,
                'cupon',        v_prev.cupon,
                'token',        v_prev.token,
                'idempotente',  true
            );
        end if;
    end if;

    -- 0.1) ANTI-SPAM: el mismo correo no puede registrar más de 10 pedidos en
    --      la última hora. (La defensa principal es la idempotencia por token;
    --      este tope frena el abuso de "comprar" en ráfaga contra el stock.)
    v_email := lower(btrim(coalesce(p_cliente->>'email', '')));
    if v_email <> '' then
        select count(*) into v_pedidos_hora
          from public.orders
         where lower(btrim(cliente->>'email')) = v_email
           and created_at >= now() - interval '1 hour';
        if v_pedidos_hora >= 10 then
            raise exception 'Demasiados pedidos desde este correo. Intentá de nuevo en unos minutos.';
        end if;
    end if;

    select discount_threshold, discount_percent
      into v_threshold, v_discount_pct
      from public.settings where id = 1;

    if p_cliente is null or p_items is null or jsonb_array_length(p_items) = 0 then
        raise exception 'Estructura de pedido inválida';
    end if;

    -- 1) Validar productos, stock y acumular subtotal (precios de la BD)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := coalesce((v_item->>'quantity')::int, 0);
        if v_qty <= 0 then
            raise exception 'Cantidad inválida para un producto';
        end if;

        select id, nombre, precio, stock, activo
          into v_product
          from public.products
          where id = (v_item->>'product_id')::int
          for update;

        if not found or v_product.activo is false then
            raise exception 'Producto no encontrado o inactivo (id: %)', (v_item->>'product_id')::int;
        end if;
        if v_product.stock < v_qty then
            raise exception 'Stock insuficiente para "%" (quedan %)', v_product.nombre, v_product.stock;
        end if;

        update public.products set stock = stock - v_qty where id = v_product.id;

        v_subtotal := v_subtotal + (v_product.precio * v_qty);
    end loop;

    -- 2) Descuento automático por umbral (regla actual de la tienda)
    if v_subtotal >= v_threshold then
        v_descuento  := round(v_subtotal * (v_discount_pct / 100), 2);
        v_porcentaje := v_discount_pct;
    end if;

    -- 3) Cupón manual: solo si supera el descuento automático (no acumulables)
    if p_cupon is not null and btrim(p_cupon) <> '' then
        select porcentaje into v_cupon_pct
          from public.coupons
         where codigo = upper(btrim(p_cupon))
           and activo = true
           and expira >= current_date;

        if found then
            v_cupon_monto := round(v_subtotal * (v_cupon_pct / 100), 2);
            if v_cupon_monto > v_descuento then
                v_descuento   := v_cupon_monto;
                v_porcentaje  := v_cupon_pct;
                v_cupon_final := upper(btrim(p_cupon));
            end if;
        end if;
    end if;

    v_total := v_subtotal - v_descuento;

    -- 4) Insertar pedido (token: el del cliente si es válido, si no uno nuevo)
    insert into public.orders (cliente, subtotal, descuento, porcentaje, cupon, total, token)
    values (p_cliente, v_subtotal, v_descuento, v_porcentaje, v_cupon_final, v_total,
            coalesce(p_token, gen_random_uuid()))
    returning id into v_pedido_id;

    -- 5) Insertar líneas (snapshot)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := (v_item->>'quantity')::int;
        insert into public.order_items (order_id, product_id, nombre, variante_texto, quantity, precio_unitario)
        select v_pedido_id, p.id, p.nombre, coalesce(v_item->>'variante_texto', ''), v_qty, p.precio
          from public.products p
         where p.id = (v_item->>'product_id')::int;
    end loop;

    return jsonb_build_object(
        'status',      'success',
        'numero',      (select numero from public.orders where id = v_pedido_id),
        'subtotal',    v_subtotal,
        'descuento',   v_descuento,
        'porcentaje',  v_porcentaje,
        'total',       v_total,
        'cupon',       v_cupon_final,
        'token',       (select token from public.orders where id = v_pedido_id)
    );
exception
    when unique_violation then
        -- Carrera de doble envío: el mismo token ya existe. La excepción
        -- revierte TODO lo hecho en el bloque (incluida la bajada de stock),
        -- así que devolvemos el pedido previo sin duplicar nada.
        if p_token is not null then
            select numero, subtotal, descuento, porcentaje, cupon, total, token
              into v_prev
              from public.orders
             where token = p_token;
            if found then
                return jsonb_build_object(
                    'status',      'success',
                    'numero',      v_prev.numero,
                    'subtotal',    v_prev.subtotal,
                    'descuento',   v_prev.descuento,
                    'porcentaje',  v_prev.porcentaje,
                    'total',       v_prev.total,
                    'cupon',       v_prev.cupon,
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

-- La RPC solo la invoca api/pedido.js (Vercel) con la service_role key.
-- anon/authenticated ya NO pueden ejecutarla desde el navegador.
revoke execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) from anon, authenticated;
grant execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4) POLICIES ADMIN: todas exigen es_admin() (V-1)
-- ----------------------------------------------------------------------------
-- Reemplaza los antiguos `to authenticated using (true) with check (true)` de
-- 0001_schema.sql: estar logueado ya NO alcanza; hay que estar en `public.admins`.

drop policy if exists "Categorías: admin full" on public.categories;
create policy "Categorías: admin full"
    on public.categories for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Productos: admin full" on public.products;
create policy "Productos: admin full"
    on public.products for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Variantes: admin full" on public.product_options;
create policy "Variantes: admin full"
    on public.product_options for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Valores variante: admin full" on public.product_option_values;
create policy "Valores variante: admin full"
    on public.product_option_values for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Imágenes: admin full" on public.product_images;
create policy "Imágenes: admin full"
    on public.product_images for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Cupones: admin full" on public.coupons;
create policy "Cupones: admin full"
    on public.coupons for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Slider: admin full" on public.sliders;
create policy "Slider: admin full"
    on public.sliders for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Banners: admin full" on public.banners;
create policy "Banners: admin full"
    on public.banners for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Reseñas: admin full" on public.reviews;
create policy "Reseñas: admin full"
    on public.reviews for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

drop policy if exists "Configuración: admin full" on public.settings;
create policy "Configuración: admin full"
    on public.settings for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

-- ----------------------------------------------------------------------------
-- 5) STORAGE: subida/actualización/borrado solo admin (V-4)
-- ----------------------------------------------------------------------------
drop policy if exists "Imágenes: subida autenticada" on storage.objects;
drop policy if exists "Imágenes: subida solo admin" on storage.objects;
create policy "Imágenes: subida solo admin"
    on storage.objects for insert
    to authenticated
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews')
        and public.es_admin());

drop policy if exists "Imágenes: actualización autenticada" on storage.objects;
drop policy if exists "Imágenes: actualización solo admin" on storage.objects;
create policy "Imágenes: actualización solo admin"
    on storage.objects for update
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews')
        and public.es_admin())
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews')
        and public.es_admin());

drop policy if exists "Imágenes: eliminación autenticada" on storage.objects;
drop policy if exists "Imágenes: eliminación solo admin" on storage.objects;
create policy "Imágenes: eliminación solo admin"
    on storage.objects for delete
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews')
        and public.es_admin());

commit;