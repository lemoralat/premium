-- ============================================================================
-- LEMORA — Migración 0060: SKU automático en las variantes de producto
--
-- ----------------------------------------------------------------------------
-- QUÉ HACE
-- ----------------------------------------------------------------------------
--   · `product_variants.sku` pasa a generarse SOLO: si queda vacío, un trigger
--     lo completa con 'P<producto>-<hash8>'. El hash es estable (depende de
--     product_id + combinación), así que la MISMA combinación siempre obtiene
--     el MISMO SKU y nunca se repite entre variantes.
--   · El panel dejó de pedir SKU a mano (0059); esta migración garantiza que
--     ninguna variante quede sin SKU, venga del panel o de un CSV.
--   · Un SKU que YA tenga valor NO se pisa: solo se completa cuando está vacío.
--
-- `set search_path = public, pg_temp` (igual que el resto de las funciones
-- propias, 0049): la 0064 lo reafirma sobre la base viva, y queda acá para que
-- re-ejecutar esta migración no reintroduzca el aviso 0011 del linter.
--
-- ORDEN: aplicar DESPUÉS de 0059 (usa public.product_variants).
-- ============================================================================

begin;

-- 1) Función de generación ---------------------------------------------------
-- Estable y única: la combinación es única por producto (índice de 0059) y el
-- prefijo lleva el product_id.
create or replace function public.generar_sku_variante()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if new.sku is null or btrim(new.sku) = '' then
        new.sku := 'P' || new.product_id || '-'
                 || upper(substr(md5(coalesce(new.combinacion::text, '')), 1, 8));
    end if;
    return new;
end;
$$;

comment on function public.generar_sku_variante() is
    'Completa product_variants.sku cuando queda vacío (SKU automático, migración 0060).';

-- 2) Trigger -----------------------------------------------------------------
-- BEFORE INSERT OR UPDATE: también cubre los updates que el panel hace sin sku
-- (así el SKU existente se conserva y solo se completa si estaba vacío).
drop trigger if exists trg_product_variants_sku on public.product_variants;
create trigger trg_product_variants_sku
    before insert or update on public.product_variants
    for each row execute function public.generar_sku_variante();

-- 3) Backfill de las variantes que ya existan sin SKU ------------------------
update public.product_variants
   set sku = 'P' || product_id || '-'
           || upper(substr(md5(coalesce(combinacion::text, '')), 1, 8))
 where sku is null or btrim(sku) = '';

-- 4) Registro en schema_migrations (si 0045 ya creó la tabla) ----------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0060_sku_variantes_automatico')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (opcional)
-- ----------------------------------------------------------------------------
--   -- Todas las variantes deberían tener SKU no vacío:
--   select count(*) as sin_sku from public.product_variants where btrim(sku) = '';
--   -- Ver el SKU generado:
--   select id, product_id, combinacion, sku from public.product_variants order by id;
--   -- Triggers de la tabla:
--   select tgname from pg_trigger where tgrelid = 'public.product_variants'::regclass;
