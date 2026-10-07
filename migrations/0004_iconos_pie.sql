-- ============================================================================
-- LEMORA — Migración 0004: Sección de iconos del pie del home.
--
-- Los 3 iconos de confianza (pagos, envíos, stock) dejan de ser HTML estático
-- y pasan a la tabla public.iconos_pie, editable desde el dashboard
-- (/admin/#/iconos-pie). Se preserva el diseño actual (.iconos/.icono).
--
-- Incluye: tabla, RLS, seed idempotente con los valores reales del HTML y un
-- bucket de Storage nuevo ("iconos") con sus políticas extendidas.
--
-- ⚠️ NO re-ejecutar sobre la base viva sin correr después
--    migrations/0026_cierre_rls_admin.sql y 0021_storage_seis_buckets.sql:
--      · recrea "Iconos: admin full" con `using (true)`, la versión que 0026
--        endureció a es_admin() (mismo nombre ⇒ la pisa);
--      · recrea "Imágenes: subida/actualización/eliminación autenticada",
--        escritura de Storage para CUALQUIER usuario autenticado sobre los 6
--        buckets — políticas que 0007 pasó a "solo admin" con es_admin().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLA iconos_pie
-- ----------------------------------------------------------------------------
create table if not exists public.iconos_pie (
    id           integer generated always as identity primary key,
    titulo       text not null,
    descripcion  text not null default '',
    storage_path text,
    external_url text,
    position     integer not null default 0,
    activo       boolean not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint iconos_pie_fuente check (num_nonnulls(storage_path, external_url) <= 1)
);

comment on table public.iconos_pie is 'Iconos de confianza del pie del home (base de js/iconos-pie.json).';

create index if not exists iconos_pie_activo_idx on public.iconos_pie (activo);

-- ---------- updated_at ----------
drop trigger if exists trg_iconos_pie_updated_at on public.iconos_pie;
create trigger trg_iconos_pie_updated_at before update on public.iconos_pie
    for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.iconos_pie enable row level security;

drop policy if exists "Iconos: lectura pública" on public.iconos_pie;
create policy "Iconos: lectura pública"
    on public.iconos_pie for select
    to anon, authenticated
    using (activo = true);

drop policy if exists "Iconos: admin full" on public.iconos_pie;
create policy "Iconos: admin full"
    on public.iconos_pie for all
    to authenticated
    using (true)
    with check (true);

-- Los GRANT ya quedan cubiertos por el "alter default privileges" de 0001
-- (select/references a anon; all a authenticated y service_role).

-- ----------------------------------------------------------------------------
-- SEED: vacío a propósito.
--
-- Acá sembraban los 3 iconos del pie del home de la tienda que originó la
-- plantilla. Eran texto de ese negocio, no contenido genérico:
--   · "Trabajo con mercadopago... la villetera virtual número 1 de Argentina"
--   · "todos los pedidos salen desde Córdoba, Argentina"
--   · "yo me comunicaré contigo personalmente"
-- Un cliente que compra la plantilla no acepta Mercado Pago, no despacha desde
-- Córdoba y no es esta persona. Si la plantilla los sembraba, cada cliente
-- tenía que acordarse de borrarlos o su tienda publicaba condiciones de venta
-- que no cumplía.
--
-- Lo mismo se quitó del front: el array ICONOS_ESTATICOS de js/iconos-pie.js
-- tenía estos mismos tres textos como fallback, así que la duplicación daba
-- igual desde los dos lados.
--
-- La sección se puebla desde el panel (Banner/iconos del pie) y, si no hay
-- iconos, js/iconos-pie.js la oculta. Es el mismo criterio que el slider.
-- ----------------------------------------------------------------------------
-- La secuencia queda en 1 en vez de reventar con setval(NULL) en una base nueva.
select setval(pg_get_serial_sequence('public.iconos_pie', 'id'), greatest(coalesce(max(id), 0), 1)) from public.iconos_pie;

-- ============================================================================
-- STORAGE: bucket "iconos" + políticas extendidas
-- ============================================================================
insert into storage.buckets (id, name, public) values
    ('iconos', 'iconos', true)
on conflict (id) do nothing;

-- Se reescriben las 4 políticas de 0003 incluyendo el bucket nuevo (idempotente).
drop policy if exists "Imágenes: lectura pública" on storage.objects;
create policy "Imágenes: lectura pública"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos'));

drop policy if exists "Imágenes: subida autenticada" on storage.objects;
create policy "Imágenes: subida autenticada"
    on storage.objects for insert
    to authenticated
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos'));

drop policy if exists "Imágenes: actualización autenticada" on storage.objects;
create policy "Imágenes: actualización autenticada"
    on storage.objects for update
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos'))
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos'));

drop policy if exists "Imágenes: eliminación autenticada" on storage.objects;
create policy "Imágenes: eliminación autenticada"
    on storage.objects for delete
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos'));