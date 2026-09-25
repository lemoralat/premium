-- ============================================================================
-- LEMORA — Migración 0003: Supabase Storage.
--
-- Buckets públicos de lectura / escritura solo para administradores.
-- Estructura de carpetas por entidad:
--   products/<producto_id>/  (imágenes de producto)
--   slider/                  (slides del hero)
--   banners/                 (imágenes y logos de banners)
--   reviews/                 (avatares de reseñas)
--   branding/                (logos/marca de la tienda)
--
-- Convención: en la BD se guarda el storage_path completo "<bucket>/<ruta>"
-- y la URL pública se deriva a render-time con storage.getPublicUrl().
--
-- Corre todo dentro de una transacción: si algo falla, no quedan buckets ni
-- policies a medias. Re-ejecutable (todo es create ... if not exists / drop
-- policy if exists / on conflict do nothing).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SEGURIDAD: tabla `admins` + función public.es_admin()
--
-- Este archivo es AUTOSUFICIENTE: crea `public.admins` antes de usarla, así la
-- 0003 se puede correr en orden numérico (0001 → 0002 → 0003 → 0004 → …) sin
-- depender de 0007.
--
-- Antes: `es_admin()` consultaba `public.admins`, tabla que solo se creaba en
-- 0007_seguridad.sql. Sobre una base vacía la 0003 fallaba con
-- `relation "public.admins" does not exist` y, al no estar en transacción,
-- dejaba los buckets y las policies a medias.
--
-- Sigue siendo idempotente y compatible con 0007: allá el
-- `create table if not exists` queda como no-op y el
-- `create or replace function` reescribe `es_admin()` con el MISMO cuerpo.
-- Mantener este cuerpo IDÉNTICO al de 0007.
-- ----------------------------------------------------------------------------

begin;

create table if not exists public.admins (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

comment on table public.admins is 'Usuarios con acceso administrativo. Alta manual: insert into public.admins (user_id) select id from auth.users where email = ...;';

-- RLS activa y SIN políticas para anon/authenticated: nadie puede leerla ni
-- autopromoverse. Solo service_role (o el dueño SQL) puede administrarla.
-- Los GRANT por defecto de 0001 permitirían leerla, pero al no haber policies
-- la RLS devuelve cero filas siempre; el revoke lo cierra en la capa de permisos.
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

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

grant execute on function public.es_admin() to authenticated, service_role;

insert into storage.buckets (id, name, public) values
    ('products', 'products', true),
    ('branding', 'branding', true),
    ('slider',   'slider',   true),
    ('banners',  'banners',  true),
    ('reviews',  'reviews',  true)
on conflict (id) do nothing;

-- ---------- Lectura pública (anon + authenticated) ----------
drop policy if exists "Imágenes: lectura pública" on storage.objects;
create policy "Imágenes: lectura pública"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews'));

-- Las escrituras requieren public.es_admin() (el usuario tiene que estar dado
-- de alta en la tabla `admins`, creada más arriba en este archivo y también en
-- 0007): estar autenticado ya no alcanza.

-- ---------- Subida: solo admin ----------
drop policy if exists "Imágenes: subida autenticada" on storage.objects;
drop policy if exists "Imágenes: subida solo admin" on storage.objects;
create policy "Imágenes: subida solo admin"
    on storage.objects for insert
    to authenticated
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews')
        and public.es_admin());

-- ---------- Actualización: solo admin ----------
drop policy if exists "Imágenes: actualización autenticada" on storage.objects;
drop policy if exists "Imágenes: actualización solo admin" on storage.objects;
create policy "Imágenes: actualización solo admin"
    on storage.objects for update
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews')
        and public.es_admin())
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews')
        and public.es_admin());

-- ---------- Eliminación: solo admin ----------
drop policy if exists "Imágenes: eliminación autenticada" on storage.objects;
drop policy if exists "Imágenes: eliminación solo admin" on storage.objects;
create policy "Imágenes: eliminación solo admin"
    on storage.objects for delete
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews')
        and public.es_admin());

commit;
