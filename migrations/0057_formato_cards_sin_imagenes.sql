-- ============================================================================
-- LEMORA — Migración 0057: opción "Sin imágenes" en el formato de cards
--
-- CONTEXTO
--   El CHECK de settings.card_image_format (0022) solo admite '1:1', '3:2' y
--   '4:5'. Agregamos 'sin_imagenes' para tiendas sin fotos: los cards dejan de
--   mostrar imagen, el detalle deja de mostrar la galería y el formulario del
--   panel deja de mostrar el bloque "Imágenes" (no se pueden subir fotos).
--
--   No mueve ni borra datos: las imágenes cargadas siguen en Storage/DB y
--   reaparecen si se vuelve a un formato con foto. El default sigue '1:1'.
-- ============================================================================

begin;

alter table public.settings
    drop constraint if exists settings_card_image_format_chk;

alter table public.settings
    add constraint settings_card_image_format_chk
    check (card_image_format in ('1:1', '3:2', '4:5', 'sin_imagenes'));

comment on column public.settings.card_image_format is
    'Formato de las imágenes en cards de catálogo: 1:1, 3:2 o 4:5; sin_imagenes oculta las imágenes de la tienda (cards, galería del detalle) y desactiva la subida en el formulario del panel (0057).';

commit;