-- ============================================================================
-- 00_VERIFICAR_ANTES.sql — CORRER PRIMERO. Solo SELECT, no cambia nada.
--
-- Ejecutalo en el SQL Editor ANTES de aplicar la limpieza. Sirve para saber
-- qué se va a perder y confirmar que las migraciones 0046/0046b/0047 están
-- efectivamente aplicadas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) ¿Las 3 migraciones están aplicadas?
--    Las 6 funciones de 0046b: si tiene_privilegio = true para PUBLIC, la
--    anon key puede llamarlas (crítico). Si son false, 0046b no corrió.
-- ---------------------------------------------------------------------------
select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as argumentos,
    has_function_privilege('public', p.oid, 'EXECUTE') as public_puede_ejecutar,
    has_function_privilege('anon', p.oid, 'EXECUTE')     as anon_puede_ejecutar,
    p.prosecdef as es_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
        'get_category_inventory',
        'bulk_update_variants_by_category',
        'bulk_set_stock_delta_by_category',
        'bulk_toggle_active_by_category',
        'bulk_generate_variants_by_category',
        'export_category_inventory_csv')
order by p.proname;

-- ---------------------------------------------------------------------------
-- B) ¿Cuántas variantes hay? Esto es lo que se pierde al dropear.
--    Si hay VARIANTES TOTALES > que productos sin opciones, el excedente son
--    variantes creadas a mano desde el panel → NO se recuperan.
-- ---------------------------------------------------------------------------
select
    (select count(*) from public.product_variants)                  as variantes_totales,
    (select count(*) from public.product_variants pv
      where exists (select 1 from public.product_variant_option_values ov
                     where ov.variant_id = pv.id))                   as variantes_con_mapeo,
    (select count(*) from public.product_variant_images)              as imagenes_variante,
    (select count(*) from public.product_variants where activo = false) as variantes_inactivas;

-- ---------------------------------------------------------------------------
-- C) ¿Hay pedidos que YA usaron una variante?
--    api/pedido.js descartaba variant_id, así que lo esperable es 0. Si sale
--    distinto de 0, al dropear la columna se pierde el rastro de qué SKU se
--    vendió en esos pedidos.
-- ---------------------------------------------------------------------------
select
    count(*) filter (where variant_id is not null) as lineas_con_variant_id,
    count(*)                                        as lineas_totales
from public.order_items;

-- ---------------------------------------------------------------------------
-- D) Umbral de stock bajo configurado (0046 añadió la columna; se pierde).
-- ---------------------------------------------------------------------------
select
    count(*) filter (where low_stock_threshold is distinct from 5) as categorias_con_umbral_personalizado,
    count(*)                                                          as categorias_totales
from public.categories;

-- ---------------------------------------------------------------------------
-- E) Confirmar que la función actual es la de 0047 (tiene el texto de variante).
--    Si aparece 0047aquí, la limpieza tiene sentido correrla.
-- ---------------------------------------------------------------------------
select
    case
        when prosrc like '%variant_id%' then '0047 (variantes) — hay que limpiar'
        when prosrc like '%idempotente%' then '0028/0023 (con idempotencia) — estado raro'
        else 'otra versión'
    end as version_actual,
    prosrc like '%search_path%' as tiene_search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'insertar_pedido';