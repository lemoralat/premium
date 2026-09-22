-- ============================================================================
-- LEMORA — Migración 0006: productos destacados.
--
-- Nuevo campo "destacado" en products:
--   false (default) → el producto aparece solo dentro de su categoría.
--   true            → se muestra primero en el home, mezclando categorías,
--                     seguido del banner 1.
--
-- Idempotente: add column if not exists. Las filas existentes quedan en false.
-- ============================================================================

alter table public.products
    add column if not exists destacado boolean not null default false;

comment on column public.products.destacado is
    'Producto destacado: se muestra primero en el home, mezclando categorías. Default: no.';