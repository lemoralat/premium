-- ============================================================================
-- LEMORA — Migración 0005: comportamiento de enlace de banners y sliders.
--
-- Nuevo campo "target" para indicar cómo se abre el enlace (link):
--   interno (default) → target="_self"  (misma pestaña)
--   externo           → target="_blank" (nueva pestaña)
--
-- Idempotente: add column if not exists. Las filas existentes quedan en
-- "interno" (comportamiento actual), sin migración de datos.
-- ============================================================================

-- ---------- SLIDERS ----------
alter table public.sliders
    add column if not exists target text not null default 'interno'
    check (target in ('interno', 'externo'));

comment on column public.sliders.target is
    'Comportamiento del enlace del slide: interno (self) o externo (blank). Default: interno.';

-- ---------- BANNERS ----------
alter table public.banners
    add column if not exists target text not null default 'interno'
    check (target in ('interno', 'externo'));

comment on column public.banners.target is
    'Comportamiento del enlace del banner: interno (self) o externo (blank). Default: interno.';