-- ============================================================================
-- LEMORA — Migración 0045: registro de migraciones aplicadas.
--
-- Última del lote de limpieza de residuos de la era Sheets/Drive.
--
-- ----------------------------------------------------------------------------
-- ORDEN DE APLICACIÓN — LEER ANTES DE CORRER
-- ----------------------------------------------------------------------------
-- Esta migración tiene que ir la última del lote: 0042, 0043 y 0044 PRIMERO,
-- en ese orden, y recién después 0045.
--
-- No es una cuestión de dependencias de esquema (0045 no necesita que las otras
-- tres hayan corrido para poder ejecutarse), sino de que su backfill declara
-- esas tres como aplicadas. Si corrés 0045 antes, la tabla queda diciendo que
-- 0042, 0043 y 0044 están aplicadas cuando no lo están: el registro queda
-- mintiendo justo de la forma que esta tabla existe para evitar. Y no es un
-- error que se note, porque el síntoma de una migración faltante es silencioso
-- (ver abajo) y la tabla, en cambio, va a decir que todo bien.
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
-- Es una afirmación, y hay que ser explícito sobre lo frágil que es: para este
-- proyecto es verdad —la base de producción tiene el esquema de la 0033, que
-- fue la última que cambió settings—, pero NO se pudo verificar una por una,
-- porque pg_catalog no es accesible con la anon key y este archivo se escribió
-- sin haber corrido un solo select contra la base.
--
-- Si tu base no aplicó alguna de las listadas, borrala de la lista ANTES de
-- correr esta migración:
--
--   delete from public.schema_migrations where nombre = '0031_stock_pedidos';
--
-- y después corré el archivo a mano. Es preferible un registro con un hueco
-- conocido y anotado que uno completo y mentiroso.
--
-- Para una instalación NUEVA de la plantilla: aplicá 0001 → 0045 en orden, y
-- corré el 0045 tal cual está, backfill incluido. Las 42 filas que inserta
-- corresponden a migraciones que en una instalación nueva efectivamente se
-- aplicaron, así que el registro es correcto y no hace falta editarlo. Lo que
-- sí hay que evitar es aplicar sólo una parte del bloque del backfill.
--
-- Y a partir de la 0046 cada migración se registra sola al final (ver la nota al
-- pie de este archivo sobre cómo). La 0045 es la excepción porque es la que
-- crea la tabla: no puede registrarse antes de existir.
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
--   -- ¿cuántas hay? Contra 43 si la base venía de este repo: las 42
--   -- anteriores más esta.
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
--
-- El desempate por nombre no es cosmetismo. Todas las filas del backfill
-- comparten aplicada_en: dentro de una transacción now() devuelve siempre la
-- hora de inicio, no la de cada sentencia. Ordenando sólo por aplicada_en, las
-- 42 salen en un orden arbitrario y la vista no sirve para responder "¿cuál
-- es la última?", que es justo para lo que existe. Con nombre como segundo
-- criterio el orden sale bien porque los nombres llevan cero-padding de 4
-- dígitos: '0009' ordena antes que '0010' en orden de texto.
-- ----------------------------------------------------------------------------
drop view if exists public.ultimas_migraciones;
create view public.ultimas_migraciones as
select nombre, aplicada_en, nota
  from public.schema_migrations
 order by aplicada_en desc, nombre desc
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
    ('0044_categoria_inactiva_esconde_productos')
on conflict (nombre) do nothing;

commit;

-- ----------------------------------------------------------------------------
-- Esta migración se registra a sí misma
-- ----------------------------------------------------------------------------
-- Va fuera del begin/commit de arriba a propósito. Si el insert fuera parte de
-- la transacción y algo fallara, el rollback se llevaría por delante también la
-- creación de la tabla, y el archivo entero quedaría sin aplicar. Así, o
-- quedan las 42 + esta, o no queda nada.
insert into public.schema_migrations (nombre)
values ('0045_schema_migrations')
on conflict (nombre) do nothing;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
-- ============================================================================

-- PASO 1 — Que estén las 43.
-- select count(*) from public.schema_migrations;
-- -- Esperado: 43 (las 42 anteriores + esta). Si da menos, el backfill se
-- --   cortó: revisar que se haya corrido el bloque entero y no una parte.
-- --
-- Si devuelve 42, falta el insert de "esta migración se registra a sí misma",
-- que está después del commit. No es grave: el archivo es idempotente y se
-- puede volver a correr entero sin romper nada.

-- PASO 2 — Que ni anon ni authenticated la puedan leer.
-- Acá hay que cambiar la key por la del proyecto; con la anon key la consulta
-- tiene que dar error de permission, no 0 filas.
-- select count(*) from public.schema_migrations;
-- -- Esperado: ERROR "permission denied for table schema_migrations". Con RLS
-- --   activada y sin policies, PostgREST responde 401/403. Si devuelve un
-- --   número, falta el "enable row level security" y cualquiera puede leer (y
-- --   con policy de insert, escribir) el registro.

-- PASO 3 — La vista.
-- select nombre from public.ultimas_migraciones;
-- -- Esperado: 10 filas, en este orden:
-- --   0045_schema_migrations
-- --   0044_categoria_inactiva_esconde_productos
-- --   0043_eliminar_external_url
-- --   0042_descuento_cero_y_columna_huerfana
-- --   0041_preguntas_frecuentes_max
-- --   0040_iconos_pie_max
-- --   0039_resenas_max
-- --   0038_banners_max
-- --   0037_sliders_max
-- --   0036_cupones_max
-- -- La 0045 va sola arriba porque su insert corre después del commit y por
-- -- eso tiene un aplicada_en posterior al del backfill. Si la primera fila no
-- -- es 0045, el archivo se corrió a medias (falta el insert final).
--
-- Ojo con la vista: es security_invoker = false (por defecto hasta Postgres 15),
-- o sea que consulta con los permisos del dueño de la tabla y NO con los del
-- que la llama. Es decir: la RLS de schema_migrations no la frena, porque para
-- la vista no existe. Lo único que decide si anon puede leerla es si tiene
-- permiso (GRANT) sobre la vista.
--
-- Por eso el PASO 2 alcanza con mirar la tabla y no hace falta probar la vista:
-- si anon no llega a la tabla, y la vista corre como el dueño, entonces el
-- permiso que habría que mirar es el de la vista. Verificalo una vez con:
--
--   select has_table_privilege('anon', 'public.ultimas_migraciones', 'select');
--   -- Esperado: false. Si da true, la vista es una ventana a la tabla y hay
--   --   que revocarle el permiso a anon y a authenticated.
--
-- En el peor caso lo que se filtra son nombres de migración, que además están
-- en el repositorio público. O sea que no es una fuga grave, pero es
-- incoherente con el resto del esquema y no cuesta nada dejarla cerrada.
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
