-- ============================================================================
-- LEMORA — Migración 0018: Tamaño del logotipo del encabezado.
--
-- La sección "Diseño" del panel suma un selector segmentado junto a la
-- subida del logo: Small, Medium o Large. La tienda lo aplica en el CSS del
-- encabezado como `width: auto; height: <40|60|80>px` (clase `logo--<tamaño>`,
-- css/styles.css).
--
--   - settings.logo_tamano: 'small' | 'medium' | 'large'. Default 'small'
--     (40 px, el más discreto). Sin la migración aplicada, la tienda usa
--     'small' (lectura conservadora en js/utils.js) pero guardar Diseño
--     falla con "columna inexistente" (misma cola de pendientes que 0017).
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

alter table public.settings
    add column if not exists logo_tamano text not null default 'small';

comment on column public.settings.logo_tamano
    is 'Tamaño del logotipo en el encabezado de la tienda: small (40 px), medium (60 px) o large (80 px).';

