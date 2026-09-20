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

-- ---------- Subida: solo autenticado (admin) ----------
drop policy if exists "Imágenes: subida autenticada" on storage.objects;
create policy "Imágenes: subida autenticada"
    on storage.objects for insert
    to authenticated
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews'));

-- ---------- Actualización: solo autenticado ----------
drop policy if exists "Imágenes: actualización autenticada" on storage.objects;
create policy "Imágenes: actualización autenticada"
    on storage.objects for update
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews'))
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews'));

-- ---------- Eliminación: solo autenticado ----------
drop policy if exists "Imágenes: eliminación autenticada" on storage.objects;
create policy "Imágenes: eliminación autenticada"
    on storage.objects for delete
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews'));