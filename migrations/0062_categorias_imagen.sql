-- ============================================================================
-- LEMORA — Migración 0062: imagen de fondo por categoría.
--
-- Cada categoría puede tener una imagen de fondo que la tienda usa como banner
-- de su página individual (categoria.html?slug=…). Es OPCIONAL (nullable): sin
-- imagen, el banner usa el color de marca de la tienda, así que ninguna
-- categoría existente cambia.
--
-- La ruta se guarda con el mismo formato que el resto de las imágenes
-- administradas: "<bucket>/<ruta>", por ejemplo
-- "branding/categorias/img-1729000000000-ab12cd.webp".
--
-- RLS y permisos NO cambian: es una columna más de una tabla ya protegida
-- (lectura pública de categorías activas + escritura admin, migración 0001).
-- El bucket de Storage reutilizado es "branding", incluido en las policies de
-- storage.objects (0021 / 0050).
-- ============================================================================

begin;

alter table public.categories
    add column if not exists imagen_path text;

comment on column public.categories.imagen_path is
    'Imagen de fondo del banner de la página de la categoría. Ruta de Storage "<bucket>/<ruta>" (ej. "branding/categorias/img-...webp"). NULL = el banner usa el color de marca. Migración 0062.';

-- Registro en schema_migrations (si 0045 ya creó la tabla) -------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0062_categorias_imagen')
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
--      and table_name   = 'categories'
--      and column_name  = 'imagen_path';
--   -- Categorías con imagen de banner:
--   select id, name, slug, imagen_path
--     from public.categories
--    where imagen_path is not null;
