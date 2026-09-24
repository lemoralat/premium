-- ============================================================================
-- LEMORA — Migración 0001: Esquema completo (tablas, restricciones, índices,
-- triggers y Row Level Security).
--
-- Modelo de infraestructura: UNA TIENDA = UN PROYECTO = UNA BASE DE DATOS.
-- No hay tenant_id ni aislamiento multi-tienda (decisión arquitectónica).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensiones
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- CATEGORÍAS
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
    id         integer generated always as identity primary key,
    name       text not null unique,
    slug       text not null unique,
    position   integer not null default 0,
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.categories is 'Categorías de productos de la tienda';

-- ----------------------------------------------------------------------------
-- PRODUCTOS
-- ----------------------------------------------------------------------------
create table if not exists public.products (
    id                   integer generated always as identity primary key,
    category_id          integer references public.categories(id) on delete set null,
    nombre               text not null,
    descripcion          text not null default '',
    descripcion_detallada text not null default '',
    precio               numeric(12, 2) not null check (precio >= 0),
    precio_anterior      numeric(12, 2) check (precio_anterior is null or precio_anterior >= 0),
    stock                integer not null default 0 check (stock >= 0),
    caracteristicas      jsonb not null default '[]'::jsonb,
    activo               boolean not null default true,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table public.products is 'Productos del catálogo. El id es numérico porque la tienda pública usa URLs producto.html?id=N.';
comment on column public.products.caracteristicas is 'Lista de textos de características (jsonb array of strings).';

-- ----------------------------------------------------------------------------
-- VARIANTES (normalizadas: grupos de opción -> valores)
-- ----------------------------------------------------------------------------
create table if not exists public.product_options (
    id         integer generated always as identity primary key,
    product_id integer not null references public.products(id) on delete cascade,
    opcion     text not null,
    position   integer not null default 0
);

comment on table public.product_options is 'Grupo de variante de un producto (ej: "Talles", "Estilo").';

create table if not exists public.product_option_values (
    id                integer generated always as identity primary key,
    product_option_id integer not null references public.product_options(id) on delete cascade,
    valor             text not null,
    position          integer not null default 0
);

comment on table public.product_option_values is 'Valores permitidos de un grupo de variante (ej: "40", "Cuero").';

-- ----------------------------------------------------------------------------
-- IMÁGENES DE PRODUCTO
-- ----------------------------------------------------------------------------
create table if not exists public.product_images (
    id           integer generated always as identity primary key,
    product_id   integer not null references public.products(id) on delete cascade,
    storage_path text,
    external_url text,
    es_principal boolean not null default false,
    position     integer not null default 0,
    created_at   timestamptz not null default now(),
    -- Al menos una de las dos fuentes, nunca ambas (los dos dejan hueco permitido).
    constraint product_images_fuente check (num_nonnulls(storage_path, external_url) <= 1)
);

comment on table public.product_images is 'Imágenes de un producto. storage_path apunta a Supabase Storage (products/<id>/...); external_url se usa para migrar datos que siguen en Google Drive.';
comment on column public.product_images.storage_path is 'Ruta dentro del bucket, incluye bucket: "products/<producto>/archivo.ext".';

-- Restricción: un solo "principal" por producto
create unique index if not exists product_images_una_principal_idx
    on public.product_images (product_id) where es_principal;

-- ----------------------------------------------------------------------------
-- CUPONES
-- ----------------------------------------------------------------------------
create table if not exists public.coupons (
    id         integer generated always as identity primary key,
    codigo     text not null unique,
    porcentaje numeric(5, 2) not null check (porcentaje > 0 and porcentaje <= 100),
    expira     date not null,
    activo     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.coupons is 'Cupones de descuento manuales (base de js/cupones.json).';

-- ----------------------------------------------------------------------------
-- SLIDER (hero)
-- ----------------------------------------------------------------------------
create table if not exists public.sliders (
    id            integer generated always as identity primary key,
    titulo        text not null,
    texto_soporte text not null default '',
    storage_path  text,
    external_url  text,
    link          text not null default '',
    position      integer not null default 0,
    activo        boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint sliders_fuente check (num_nonnulls(storage_path, external_url) <= 1)
);

comment on table public.sliders is 'Slides del hero slider del inicio (base de js/slider.json).';

-- ----------------------------------------------------------------------------
-- BANNERS
-- ----------------------------------------------------------------------------
create table if not exists public.banners (
    id          integer generated always as identity primary key,
    imagen_path text,
    imagen_url  text,
    logo_path   text,
    logo_url    text,
    badge       text not null default '',
    titulo      text not null default '',
    boton       text not null default '',
    link        text not null default '',
    position    integer not null default 0,
    activo      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint banners_imagen_fuente check (num_nonnulls(imagen_path, imagen_url) <= 1),
    constraint banners_logo_fuente   check (num_nonnulls(logo_path, logo_url) <= 1)
);

comment on table public.banners is 'Banners promocionales (base de js/banners.json). El último banner de la lista es el del carrito.';
comment on column public.banners.badge  is 'Etiqueta superior (ej: "Promociona"). Vacío = no se muestra.';
comment on column public.banners.titulo is 'Título del banner. Vacío + sin logo/badge/boton = banner solo imagen.';

-- ----------------------------------------------------------------------------
-- RESEÑAS
-- ----------------------------------------------------------------------------
create table if not exists public.reviews (
    id           integer generated always as identity primary key,
    nombre       text not null,
    valoracion   integer not null check (valoracion between 1 and 5),
    resena       text not null default '',
    fecha        date not null default current_date,
    storage_path text,
    external_url text,
    position     integer not null default 0,
    activo       boolean not null default true,
    created_at   timestamptz not null default now(),
    constraint reviews_fuente check (num_nonnulls(storage_path, external_url) <= 1)
);

comment on table public.reviews is 'Testimonios de clientes (base de js/resenas.json).';

-- ----------------------------------------------------------------------------
-- PEDIDOS
-- ----------------------------------------------------------------------------
-- Secuencia para la numeración PED-#### secuencial (comportamiento actual).
create sequence if not exists public.orders_numero_seq;

create table if not exists public.orders (
    id         bigint generated always as identity primary key,
    numero     text not null unique,
    token      uuid not null default gen_random_uuid(),
    cliente    jsonb not null,
    subtotal   numeric(12, 2) not null check (subtotal >= 0),
    descuento  numeric(12, 2) not null default 0 check (descuento >= 0),
    porcentaje numeric(5, 2)  not null default 0,
    cupon      text not null default 'NINGUNO',
    total      numeric(12, 2) not null check (total >= 0),
    estado     text not null default 'Pendiente'
               check (estado in ('Pendiente', 'Procesando', 'Enviado', 'Entregado', 'Cancelado')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.orders is 'Pedidos de clientes. cliente es un snapshot jsonb (nombre, email, telefono, direccion, ciudad, provincia, codigoPostal, notas).';

create table if not exists public.order_items (
    id              bigint generated always as identity primary key,
    order_id        bigint not null references public.orders(id) on delete cascade,
    product_id      integer references public.products(id) on delete set null,
    nombre          text not null,
    variante_texto  text not null default '',
    quantity        integer not null check (quantity > 0),
    precio_unitario numeric(12, 2) not null check (precio_unitario >= 0)
);

comment on table public.order_items is 'Líneas de un pedido (snapshot de nombre/precio al momento de comprar).';

-- ----------------------------------------------------------------------------
-- CONFIGURACIÓN (fila única)
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
    id                     integer primary key default 1 check (id = 1),
    site_name              text not null default 'Mi Tienda Online',
    whatsapp_number        text not null default '',
    whatsapp_default_message text not null default 'Hola, quería consultar ',
    discount_threshold     numeric(12, 2) not null default 100000,
    discount_percent       numeric(5, 2)  not null default 10,
    transfer_alias         text not null default '',
    transfer_entity        text not null default '',
    transfer_holder        text not null default '',
    email_contact          text not null default '',
    address                text not null default '',
    social_facebook        text not null default '',
    social_instagram       text not null default '',
    social_tiktok          text not null default '',
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now()
);

comment on table public.settings is 'Configuración global de la tienda (fila única, id=1). Reemplaza las constantes hoy hardcodeadas en js/utils.js.';

-- ----------------------------------------------------------------------------
-- PERFILES (admin)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
    id         uuid primary key references auth.users(id) on delete cascade,
    email      text,
    full_name  text,
    -- El acceso administrativo real se controla con la tabla public.admins
    -- (migración 0007). Nadie nace admin: el rol por defecto es solo informativo.
    role       text not null default 'cliente',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil del usuario de la tienda (autenticado con Supabase Auth).';
comment on column public.profiles.role is 'Rol informativo (cliente/admin). El acceso real se controla con la tabla public.admins.';

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------
-- updated_at genérico
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at before update on public.categories
    for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
    for each row execute function public.set_updated_at();

drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at before update on public.coupons
    for each row execute function public.set_updated_at();

drop trigger if exists trg_sliders_updated_at on public.sliders;
create trigger trg_sliders_updated_at before update on public.sliders
    for each row execute function public.set_updated_at();

drop trigger if exists trg_banners_updated_at on public.banners;
create trigger trg_banners_updated_at before update on public.banners
    for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at before update on public.settings
    for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
    for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();

-- Numeración secuencial PED-#### (mismo formato que la hoja Pedidos actual)
create or replace function public.asignar_numero_pedido()
returns trigger
language plpgsql
as $$
begin
    new.numero := 'PED-' || lpad(nextval('public.orders_numero_seq')::text, 4, '0');
    return new;
end;
$$;

drop trigger if exists trg_orders_numero on public.orders;
create trigger trg_orders_numero before insert on public.orders
    for each row execute function public.asignar_numero_pedido();

-- Crear perfil automáticamente cuando se da de alta un usuario de Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- ÍNDICES
-- ----------------------------------------------------------------------------
create index if not exists products_category_id_idx    on public.products (category_id);
create index if not exists products_activo_idx         on public.products (activo);
create index if not exists product_options_product_idx on public.product_options (product_id);
create index if not exists product_option_values_group_idx on public.product_option_values (product_option_id);
create index if not exists product_images_product_idx  on public.product_images (product_id);
create index if not exists coupons_activo_idx          on public.coupons (activo);
create index if not exists sliders_activo_idx          on public.sliders (activo);
create index if not exists banners_activo_idx          on public.banners (activo);
create index if not exists reviews_activo_idx          on public.reviews (activo);
create index if not exists orders_estado_idx           on public.orders (estado);
create index if not exists orders_creado_idx           on public.orders (created_at desc);
create index if not exists order_items_order_idx       on public.order_items (order_id);

-- ----------------------------------------------------------------------------
-- FUNCIÓN: registro de pedido (transacción única)
-- ----------------------------------------------------------------------------
-- La usa api/pedido.js (Vercel serverless) con la service_role key.
-- Recalcula montos contra la BD, valida cupones y stock, descuenta stock e
-- inserta pedido + líneas de forma atómica. Reemplaza el doPost de Apps Script.
create or replace function public.insertar_pedido(
    p_cliente jsonb,
    p_items   jsonb,
    p_cupon   text default null,
    p_token   uuid default null
)
returns jsonb
language plpgsql
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
begin
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
    when others then
        raise;
end;
$$;

-- Solo la función serverless (api/pedido.js, Vercel) invoca esta RPC con la
-- service_role key. anon/authenticated no pueden ejecutarla desde el navegador.
grant execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) to service_role;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.product_options    enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_images     enable row level security;
alter table public.coupons            enable row level security;
alter table public.sliders            enable row level security;
alter table public.banners            enable row level security;
alter table public.reviews            enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.settings           enable row level security;
alter table public.profiles           enable row level security;

-- ---------- CATEGORÍAS ----------
drop policy if exists "Categorías: lectura pública" on public.categories;
create policy "Categorías: lectura pública"
    on public.categories for select
    to anon, authenticated
    using (active = true);

drop policy if exists "Categorías: admin full" on public.categories;
create policy "Categorías: admin full"
    on public.categories for all
    to authenticated
    using (true)
    with check (true);

-- ---------- PRODUCTOS ----------
drop policy if exists "Productos: lectura pública activos" on public.products;
create policy "Productos: lectura pública activos"
    on public.products for select
    to anon, authenticated
    using (activo = true);

drop policy if exists "Productos: admin full" on public.products;
create policy "Productos: admin full"
    on public.products for all
    to authenticated
    using (true)
    with check (true);

-- ---------- VARIANTES ----------
drop policy if exists "Variantes: lectura pública" on public.product_options;
create policy "Variantes: lectura pública"
    on public.product_options for select
    to anon, authenticated
    using (true);

drop policy if exists "Variantes: admin full" on public.product_options;
create policy "Variantes: admin full"
    on public.product_options for all
    to authenticated
    using (true)
    with check (true);

drop policy if exists "Valores variante: lectura pública" on public.product_option_values;
create policy "Valores variante: lectura pública"
    on public.product_option_values for select
    to anon, authenticated
    using (true);

drop policy if exists "Valores variante: admin full" on public.product_option_values;
create policy "Valores variante: admin full"
    on public.product_option_values for all
    to authenticated
    using (true)
    with check (true);

-- ---------- IMÁGENES ----------
drop policy if exists "Imágenes: lectura pública" on public.product_images;
create policy "Imágenes: lectura pública"
    on public.product_images for select
    to anon, authenticated
    using (true);

drop policy if exists "Imágenes: admin full" on public.product_images;
create policy "Imágenes: admin full"
    on public.product_images for all
    to authenticated
    using (true)
    with check (true);

-- ---------- CUPONES ----------
drop policy if exists "Cupones: lectura pública vigentes" on public.coupons;
create policy "Cupones: lectura pública vigentes"
    on public.coupons for select
    to anon, authenticated
    using (activo = true and expira >= current_date);

drop policy if exists "Cupones: admin full" on public.coupons;
create policy "Cupones: admin full"
    on public.coupons for all
    to authenticated
    using (true)
    with check (true);

-- ---------- SLIDER ----------
drop policy if exists "Slider: lectura pública" on public.sliders;
create policy "Slider: lectura pública"
    on public.sliders for select
    to anon, authenticated
    using (activo = true);

drop policy if exists "Slider: admin full" on public.sliders;
create policy "Slider: admin full"
    on public.sliders for all
    to authenticated
    using (true)
    with check (true);

-- ---------- BANNERS ----------
drop policy if exists "Banners: lectura pública" on public.banners;
create policy "Banners: lectura pública"
    on public.banners for select
    to anon, authenticated
    using (activo = true);

drop policy if exists "Banners: admin full" on public.banners;
create policy "Banners: admin full"
    on public.banners for all
    to authenticated
    using (true)
    with check (true);

-- ---------- RESEÑAS ----------
drop policy if exists "Reseñas: lectura pública" on public.reviews;
create policy "Reseñas: lectura pública"
    on public.reviews for select
    to anon, authenticated
    using (activo = true);

drop policy if exists "Reseñas: admin full" on public.reviews;
create policy "Reseñas: admin full"
    on public.reviews for all
    to authenticated
    using (true)
    with check (true);

-- ---------- PEDIDOS (sin acceso anónimo; el alta entra por la RPC serverless) ----------
drop policy if exists "Pedidos: acceso de administrador" on public.orders;
create policy "Pedidos: acceso de administrador"
    on public.orders for all
    to authenticated
    using (true)
    with check (true);

drop policy if exists "Líneas pedido: acceso de administrador" on public.order_items;
create policy "Líneas pedido: acceso de administrador"
    on public.order_items for all
    to authenticated
    using (true)
    with check (true);

-- ---------- CONFIGURACIÓN ----------
drop policy if exists "Configuración: lectura pública" on public.settings;
create policy "Configuración: lectura pública"
    on public.settings for select
    to anon, authenticated
    using (true);

drop policy if exists "Configuración: admin full" on public.settings;
create policy "Configuración: admin full"
    on public.settings for all
    to authenticated
    using (true)
    with check (true);

-- ---------- PERFILES (solo lectura/edición del propio perfil) ----------
drop policy if exists "Perfiles: lectura del propio" on public.profiles;
create policy "Perfiles: lectura del propio"
    on public.profiles for select
    to authenticated
    using (id = auth.uid());

drop policy if exists "Perfiles: edición del propio" on public.profiles;
create policy "Perfiles: edición del propio"
    on public.profiles for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- ============================================================================
-- PERMISOS DE ACCESO (habilita los roles de Supabase además de las políticas RLS)
-- Las políticas sirven para FILTRAR filas; el GRANT habilita la operación a nivel
-- tabla. Sin estos permisos anon/authenticated reciben `permission denied`.
-- RLS sigue siendo la barrera real: anon solo SELECT y authenticated CRUD admin.
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, references on all tables in schema public to anon;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Se aplica también a tablas/secuencias/funciones creadas a futuro
alter default privileges in schema public
    grant select, references on tables to anon;
alter default privileges in schema public
    grant all on tables to authenticated, service_role;
alter default privileges in schema public
    grant all on sequences to authenticated, service_role;
alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;