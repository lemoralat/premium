-- ============================================================================
-- LEMORA — Migración 0045: registro de migraciones aplicadas.
--
-- Última del lote de limpieza de residuos de la era Sheets/Drive.
--
-- ----------------------------------------------------------------------------
-- EL PROBLEMA QUE RESUELVE
-- ----------------------------------------------------------------------------
-- No hay runner de migraciones. Supabase lo que ofrece es un tablero donde se
-- pega SQL a mano, y así se armaron las 42 migraciones de este proyecto. El
-- resultado es que la base y el repositorio pueden divergir sin que nada lo
-- diga: una migración olvidada no falla en el deploy, no aparece en el build y
-- no rompe la página. Simplemente una columna que el código espera no existe, y
-- el síntoma es un `ok: false` en la consola o una sección vacía.
--
-- Peor: el síntoma puede aparecer días o semanas después, y para entonces es
-- difícil saber que la causa fue una migración que no se corrió. Esta tabla
-- convierte "algo no anda" en "falta la 0043".
--
-- ----------------------------------------------------------------------------
-- POR QUÉ NO SE PUEDE EMPEZAR DE CERO
-- ----------------------------------------------------------------------------
-- La tabla arranca con las 42 migraciones anteriores marcadas como aplicadas.
-- Es una afirmación, y hay que ser explícito sobre su shaky: para este proyecto
-- es verdad para este proyecto (la base de producción tiene el esquema de la
-- 0033, que fue la última que cambió settings), pero NO se pudo verificar una
-- por una: pg_catalog no es accesible con la anon key y esta migración se
-- escribe sin haber corrido un solo select contra la base. Si tu base no aplicó alguna de las listadas,
-- borrala de la lista ANTES de correr esta migración:
--
--   delete from public.schema_migrations where nombre = '0031_stock_pedidos';
--
-- y después corré el archivo a mano. Es preferible un registro con un hueco
-- conocido y anotado que uno completo y mentiroso.
--
-- Para una instalación NUEVA de la plantilla el planteo es al revés: no
-- apliques el backfill. Apliques 0001 → 0045 en orden, y a partir de 0046 cada
-- migración se registra sola (ver la nota al pie de este archivo sobre cómo).
-- En una base nueva, correr este 0045 después de 0001..0044 con el backfill ya
-- aplicado no molesta: el `on conflict do nothing` no pisa lo que haya.
--
-- ----------------------------------------------------------------------------
-- CÓMO SE USA
-- ----------------------------------------------------------------------------
--   -- ¿qué se aplicó y cuándo?
--   select nombre, aplicada_en from public.ultimas_migraciones;
--
--   -- ¿se aplicó algo dos veces?
--   select nombre, count(*) from public.schema_migrations
--    group by nombre having count(*) > 1;
--   -- Vacío siempre: nombre es primary key.
--
--   -- ¿cuántas hay? Contra 42 si la base venía de este repo.
--   select count(*) from public.schema_migrations;
--
-- LO QUE ESTA TABLA NO PUEDE HACER
--
-- Avisar cuál de los archivos del repositorio falta. Eso requiere ver el
-- contenido del repo, que desde Postgres no se puede: no hay forma de que una
-- tabla diga "el archivo 0044 existe en GitHub y en tu base no". Lo que sí
-- permite es comparar el `ls migrations/` con un `select nombre`, que son dos
-- comandos. Para el caso de siempre —"¿cuál me falta?"— esa comparación es
-- igual de rápida que cualquier vista que se inventara, y no depende de que
-- alguien la mantenga al día.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ NO ES write-only
-- ----------------------------------------------------------------------------
-- RLS activada y sin policies: igual que settings, es tabla de servidor. La
-- anon key está en el bundle público (js/env.generated.js), así que sin RLS
-- cualquiera podría meter filas falsas y hacer que el chequeo dé verde. Con
-- `enable row level security` y cero policies, ni anon ni authenticated ven ni
-- una fila; service_role los ve todos, y las serverless no usan esto igual.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Tabla
-- ----------------------------------------------------------------------------
create table if not exists public.schema_migrations (
    nombre       text        primary key,
    aplicada_en  timestamptz not null default now(),
    -- Nota libre para dejar asentado algo que no se deduce del nombre.
    nota         text
);

comment on table public.schema_migrations is
    'Registro de migraciones aplicadas. RLS activada y sin policies: es tabla de servidor, escriben las migraciones y el service_role. Para una instalación nueva se aplican los archivos en orden y cada uno se registra al final con un INSERT ON CONFLICT DO NOTHING.';

-- ----------------------------------------------------------------------------
-- RLS: sin policies, como settings.
-- ----------------------------------------------------------------------------
alter table public.schema_migrations enable row level security;

-- ----------------------------------------------------------------------------
-- Vista de ayuda: cuántas migraciones hay registradas y cuáles son las
-- últimas. Pensada para pegar en el SQL Editor y ver el estado de un vistazo.
-- ----------------------------------------------------------------------------
drop view if exists public.ultimas_migraciones;
create view public.ultimas_migraciones as
select nombre, aplicada_en, nota
  from public.schema_migrations
 order by aplicada_en desc
 limit 10;

-- ----------------------------------------------------------------------------
-- Backfill: las 42 anteriores (0016 nunca existió, 0034 quedó reservado).
-- ----------------------------------------------------------------------------
insert into public.schema_migrations (nombre) values
    ('0001_schema'),
    ('0002_seed'),
    ('0003_storage'),
    ('0004_iconos_pie'),
    ('0005_enlace_target'),
    ('0006_productos_destacado'),
    ('0007_seguridad'),
    ('0008_higiene'),
    ('0009_diseno'),
    ('0010_color_principal_negro'),
    ('0011_redes_sociales'),
    ('0012_iconos_fontawesome'),
    ('0013_popup_salida'),
    ('0014_preguntas_frecuentes'),
    ('0015_preguntas_frecuentes_rpc'),
    ('0017_marquee'),
    ('0018_logo_tamano'),
    ('0019_slider_mostrar_en'),
    ('0020_compra_minima'),
    ('0021_imagenes_storage'),
    ('0022_formato_cards'),
    ('0023_compra_minima_dual'),
    ('0024_plantilla_sin_datos_lemora'),
    ('0025_borrar_pedidos'),
    ('0026_cierre_rls_admin'),
    ('0027_admin_tema'),
    ('0028_pedido_items_fiables'),
    ('0029_resenas_red'),
    ('0030_banners_carrito'),
    ('0031_stock_pedidos'),
    ('0032_gracias_info_dinamico'),
    ('0033_meta_descripcion'),
    ('0035_marquee_max'),
    ('0036_cupones_max'),
    ('0037_sliders_max'),
    ('0038_banners_max'),
    ('0039_resenas_max'),
    ('0040_iconos_pie_max'),
    ('0041_preguntas_frecuentes_max'),
    ('0042_descuento_cero_y_columna_huerfana'),
    ('0043_eliminar_external_url'),
    ('0044_categoria_inactiva_esconde_productos'),on conflict (nombre) do nothing;

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
-- ============================================================================

-- PASO 1 — Que estén las 42.
-- select count(*) from public.schema_migrations;
-- -- Esperado: 42. Si da menos, el backfill se cortó (sin transaction implícita,
-- --   el on conflict no impide eso: revisar que se haya corrido el bloque
-- --   entero y no una parte).
--
-- Si devuelve 42, la 0045 no se registró a sí misma: eso es a propósito, para
-- que la fila se agregue con la 0046 y la convención sea "se registra la
-- siguiente, no la propia". Registrala a mano si preferís que figure:
--   insert into public.schema_migrations (nombre) values ('0045_schema_migrations');

-- PASO 2 — Que ni anon ni authenticated la puedan leer.
-- Acá hay que cambiar la key por la del proyecto; con la anon key la consulta
-- tiene que dar error de permission, no 0 filas.
-- select count(*) from public.schema_migrations;
-- -- Esperado: ERROR "permission denied for table schema_migrations". Con RLS
-- --   activada y sin policies, PostgREST responde 401/403. Si devuelve un
-- --   número, falta el "enable row level security" y cualquiera puede leer (y
-- --   con policy de insert, escribir) el registro.

-- PASO 3 — La vista.
-- select * from public.ultimas_migraciones;
-- -- Esperado: 10 filas, la primera siendo 0044.
--
-- Ojo: la vista es security_invoker = false (por defecto en Postgres hasta 15),
-- o sea que consulta con los permisos del dueño, no los del que la llama. Por
-- eso el service_role la ve pero anon recibe el mismo error de la tabla: no
-- hay una vía para saltarse la RLS de abajo a través de la vista.
-- ============================================================================
--
-- NOTA PARA LAS MIGRACIONES SIGUIENTES (0046 en adelante)
--
-- Al final de cada archivo, después del commit, agregar:
--
--   insert into public.schema_migrations (nombre)
--   values ('0046_nombre_de_la_migracion')
--   on conflict (nombre) do nothing;
--
-- Y una línea en SUPABASE_MIGRATION.md con el nombre. Así el "¿qué falta?" se
-- responde con un select y no con memoria.
-- ============================================================================
