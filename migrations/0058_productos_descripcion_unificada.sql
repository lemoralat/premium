-- ============================================================================
-- LEMORA — Migración 0058: unificar descripción en productos (solo descripción detallada)
--
-- CONTEXTO
--   Solicitado: eliminar descripción corta; usar solo "descripción detallada"
--   llamada simplemente "Descripción". En cards no se muestra descripción;
--   en la página de detalle solo se muestra descripción_detallada.
--
-- CAMBIOS
--   - Migración: copia descripcion → descripcion_detallada cuando esta última esté vacía
--   - Drop: column descripcion (una vez migrados los datos)
--   - No se tocan RLS ni policies
-- ============================================================================
begin;

-- 1) Migrar datos: preservar texto corto si no hay texto detallado
update public.products p
   set descripcion_detallada = coalesce(nullif(trim(p.descripcion_detallada), ''), trim(p.descripcion))
 where trim(coalesce(p.descripcion, '')) <> ''
   and trim(coalesce(p.descripcion_detallada, '')) = '';

-- 2) Eliminar columna descripcion (ahora redundante)
alter table public.products
  drop column if exists descripcion;

commit;

-- ----------------------------------------------------------------------------
-- REGISTRO DE MIGRACIÓN (complementario al patrón de 0056)
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into public.schema_migrations (nombre)
    values ('0058_productos_descripcion_unificada')
    on conflict do nothing;
  end if;
end $$;