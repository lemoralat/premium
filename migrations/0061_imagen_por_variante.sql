-- ============================================================================
-- LEMORA — Migración 0061: imagen individual por variación de producto
--
-- ----------------------------------------------------------------------------
-- QUÉ HACE
-- ----------------------------------------------------------------------------
--   · Agrega `product_variants.imagen_storage_path`: la foto propia de cada
--     combinación (Color → Rojo / Talle → S puede tener su propia foto).
--   · Es OPCIONAL (nullable). Cuando está vacía, la tienda sigue mostrando la
--     galería del producto: ningún producto variable existente cambia.
--   · En la tienda pública, al elegir una combinación con foto propia la
--     galería del detalle cambia sola a esa imagen (js/producto-detalle.js).
--
-- La ruta se guarda con el mismo formato que product_images.storage_path:
-- "<bucket>/<ruta>", por ejemplo "products/products/12/variantes/img-....webp".
--
-- RLS y permisos NO cambian: es una columna más de una tabla ya protegida
-- (lectura pública + escritura admin, migración 0059).
-- ============================================================================

begin;

alter table public.product_variants
    add column if not exists imagen_storage_path text;

comment on column public.product_variants.imagen_storage_path is
    'Foto propia de la variación, ruta de Storage "<bucket>/<ruta>" (ej. "products/products/12/variantes/img-...webp"). Si es NULL, la tienda muestra la galería del producto. Migración 0061.';

-- Registro en schema_migrations (si 0045 ya creó la tabla) -------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0061_imagen_por_variante')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (opcional)
-- ----------------------------------------------------------------------------
--   -- La columna debería existir:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'product_variants'
--      and column_name = 'imagen_storage_path';
--   -- Variantes con foto propia:
--   select id, product_id, combinacion, imagen_storage_path
--     from public.product_variants
--    where imagen_storage_path is not null;
