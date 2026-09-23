-- ============================================================================
-- LEMORA — Migración 0019: Mostrar slides según dispositivo (Slider).
--
-- Agrega un selector por slide para controlar si se muestra en móvil, escritorio
-- o en ambos dispositivos. La tienda filtra los slides al renderizar el hero
-- según el breakpoint (max-width: 768px).
--
--   - sliders.mostrar_en: 'ambos' | 'mobile' | 'desktop'. Default 'ambos'.
--     Sin la migración aplicada, la tienda no lee la columna (comportamiento
--     conservador: se muestran en ambos) y guardar desde el panel falla con
--     "columna inexistente" hasta ejecutar esta migración.
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

alter table public.sliders
    add column if not exists mostrar_en text not null default 'ambos';

alter table public.sliders
    drop constraint if exists sliders_mostrar_en_chk;
alter table public.sliders
    add constraint sliders_mostrar_en_chk
        check (mostrar_en in ('ambos','mobile','desktop'));

comment on column public.sliders.mostrar_en
    is 'Dónde se muestra el slide: ambos | mobile | desktop.';
