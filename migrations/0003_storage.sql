-- ============================================================================
-- LEMORA — Migración 0003: Supabase Storage.
--
-- Buckets públicos de lectura / escritura solo autenticada (admin).
-- Estructura de carpetas por entidad:
--   products/<producto_id>/  (imágenes de producto)
--   slider/                  (slides del hero)
--   banners/                 (imágenes y logos de banners)
--   reviews/                 (avatares de reseñas)
--   branding/                (logos/marca de la tienda)
--
-- Convención: en la BD se guarda el storage_path completo "<bucket>/<ruta>"
-- y la URL pública se deriva a render-time con storage.getPublicUrl().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Función de seguridad public.es_admin(): se define acá porque las policies de
-- Storage de este archivo (subida/actualización/borrado) la usan. La creación
-- "canónica" histórica está en 0007_seguridad.sql, que la re-crea con el mismo
-- cuerpo (create or replace): re-aplicar cualquiera de los dos archivos no
-- cambia el estado de la BD. Mantener este cuerpo IDÉNTICO al de 0007.
-- ----------------------------------------------------------------------------

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

-- Las escrituras requieren public.es_admin() (usuario en la tabla `admins`,
-- migración 0007): estar autenticado ya no alcanza.

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