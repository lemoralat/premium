-- ============================================================================
-- LEMORA — Migración 0012: íconos FontAwesome en la sección Iconos.
--
-- Cada ícono de confianza (tabla iconos_pie) se representa o bien con una
-- imagen (storage_path / external_url, como hasta ahora) o bien con un ícono
-- de Font Awesome (seleccionable desde el dashboard con buscador + grilla).
--
-- Nueva columna:
--   icono text NULL  → clase Font Awesome completa (ej. 'fa-solid fa-truck').
--                      NULL = el ícono usa imagen (comportamiento actual).
--
-- No se toca la constraint iconos_pie_fuente (aplica solo a storage_path y
-- external_url; en modo ícono ambos quedan NULL, lo cual ya está permitido).
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

alter table public.iconos_pie
    add column if not exists icono text;

comment on column public.iconos_pie.icono
    is 'Clase Font Awesome (ej. fa-solid fa-truck). NULL = el ícono usa imagen.';