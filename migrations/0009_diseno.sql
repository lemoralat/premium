-- ============================================================================
-- LEMORA — Migración 0009: Sección "Diseño" (branding de la tienda).
--
-- Agrega a la fila única `settings` los recursos de identidad visual que
-- administra el panel (#/diseno):
--   logo_path / favicon_path / og_image_path  → storage_path en el bucket
--       `branding` (convención "<bucket>/<ruta>", la URL pública se deriva a
--       render-time con getPublicUrl / urlImagen).
--   color_principal  → color hex #RRGGBB aplicado como --primary-color.
--   estilo_bordes    → redondeado (actual, 8px) | circular | recto.
--
-- Columnas nulas = la tienda sigue usando los recursos por defecto
-- (img/logo.svg, img/lemora.svg, img/imagen-preview.jpg).
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

alter table public.settings
    add column if not exists logo_path       text,
    add column if not exists favicon_path    text,
    add column if not exists og_image_path   text,
    add column if not exists color_principal text not null default '#000000',
    add column if not exists estilo_bordes   text not null default 'redondeado';

-- Check de estilo (idempotente: no se duplica si se reaplica la migración).
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'settings_estilo_bordes_chk'
          and conrelid = 'public.settings'::regclass
    ) then
        alter table public.settings
            add constraint settings_estilo_bordes_chk
            check (estilo_bordes in ('redondeado', 'circular', 'recto'));
    end if;
end $$;

-- La policy existente "Configuración: admin full" (es_admin en 0007) ya cubre
-- el UPDATE de estas columnas y la lectura pública sigue devolviendo la fila
-- completa: no hace falta tocar RLS.