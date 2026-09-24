-- ============================================================================
-- LEMORA — Migración 0004: Sección de iconos del pie del home.
--
-- Los 3 iconos de confianza (pagos, envíos, stock) dejan de ser HTML estático
-- y pasan a la tabla public.iconos_pie, editable desde el dashboard
-- (/admin/#/iconos-pie). Se preserva el diseño actual (.iconos/.icono).
--
-- Incluye: tabla, RLS, seed idempotente con los valores reales del HTML y un
-- bucket de Storage nuevo ("iconos") con sus políticas extendidas.
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
-- SEED: los 3 iconos actuales del home.
-- La migración 0021 reemplaza las fuentes locales retiradas por Font Awesome.
-- ----------------------------------------------------------------------------
insert into public.iconos_pie (titulo, descripcion, external_url, position, activo)
select * from (values
('Muchas formas de pago',
 'Trabajo con mercadopago, lo cuál se aceptan todos los medios de pagos de la villetera virtual número 1 de Argentina, para que compres con total confianza.',
 '', 0, true),
('Envíos a toda Argentina',
 'Envío a toda la Argentina de norte a sur, todos los pedidos salen desde Córdoba, Argentina y pueden variar dependiendo tu ubicación.',
 '', 1, true),
('Stock siempre disponible',
 'Toda la web opera bajo pedido, compra con total confianza, yo me comunicaré contigo personalmente para asegurar que llegue lo que pidas.',
 '', 2, true)
) as v(titulo, descripcion, external_url, position, activo)
where not exists (select 1 from public.iconos_pie);

select setval(pg_get_serial_sequence('public.iconos_pie', 'id'), (select max(id) from public.iconos_pie));

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