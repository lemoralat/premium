-- ============================================================================
-- 0022 — Formato de imagen para cards de catálogo
--
-- 1:1, 3:2 o 4:5. El valor se aplica a los cards de productos del catálogo,
-- búsqueda y relacionados mediante la variable CSS --product-card-aspect-ratio.
-- ============================================================================

alter table public.settings
    add column if not exists card_image_format text not null default '1:1';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'settings_card_image_format_chk'
          and conrelid = 'public.settings'::regclass
    ) then
        alter table public.settings
            add constraint settings_card_image_format_chk
            check (card_image_format in ('1:1', '3:2', '4:5'));
    end if;
end $$;

comment on column public.settings.card_image_format is
    'Formato de las imágenes en cards de catálogo: 1:1, 3:2 o 4:5.';
