-- ============================================================================
-- 0021 — Consistencia de imágenes y Storage
--
-- 1) Incluye el bucket `iconos` en las policies finales de Storage.
-- 2) Sustituye los iconos del seed que apuntaban a assets locales eliminados
--    por clases Font Awesome configurables desde el panel.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Storage: lectura pública y escritura solo para administradores
-- ----------------------------------------------------------------------------
drop policy if exists "Imágenes: lectura pública" on storage.objects;
create policy "Imágenes: lectura pública"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos'));

drop policy if exists "Imágenes: subida solo admin" on storage.objects;
create policy "Imágenes: subida solo admin"
    on storage.objects for insert
    to authenticated
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos')
        and public.es_admin());

drop policy if exists "Imágenes: actualización solo admin" on storage.objects;
create policy "Imágenes: actualización solo admin"
    on storage.objects for update
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos')
        and public.es_admin())
    with check (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos')
        and public.es_admin());

drop policy if exists "Imágenes: eliminación solo admin" on storage.objects;
create policy "Imágenes: eliminación solo admin"
    on storage.objects for delete
    to authenticated
    using (bucket_id in ('products', 'branding', 'slider', 'banners', 'reviews', 'iconos')
        and public.es_admin());

-- ----------------------------------------------------------------------------
-- 2) Iconos del pie: eliminar URLs locales retiradas y usar Font Awesome
-- ----------------------------------------------------------------------------
update public.iconos_pie
set storage_path = null,
    external_url = null,
    icono = case
        when titulo ilike '%pago%' then 'fa-solid fa-credit-card'
        when titulo ilike '%env%' then 'fa-solid fa-truck'
        when titulo ilike '%stock%' then 'fa-solid fa-box'
        else coalesce(icono, 'fa-regular fa-image')
    end
where external_url ilike 'https://supabase.lemora.lat/img/icons/%'
   or external_url ilike 'img/icons/%'
   or external_url = '';

commit;
