-- ============================================================================
-- LEMORA — Migración 0043: se va la segunda fuente de imágenes.
--
-- Sigue a la 0042 (descuento). En el mismo cambio se sacaron del panel y del
-- front los campos para pegar URLs y la función imagenOptimizada() que
-- reescribía las URLs de Drive. Esta migración saca las columnas del otro
-- lado de ese mismo acuerdo.
--
-- ----------------------------------------------------------------------------
-- EL MODELO DE DOS FUENTES Y POR QUÉ SE TERMINA
-- ----------------------------------------------------------------------------
-- product_images, sliders, banners, reviews e iconos_pie tenían DOS columnas de
-- imagen: storage_path (Supabase Storage) y external_url / imagen_url /
-- logo_url (una URL cualquiera, casi siempre de Google Drive). Más un CHECK,
-- num_nonnulls(...) <= 1, que obligaba a usar una o la otra pero no las dos.
--
-- Ese segundo camino era el puente de la migración desde Drive: en V1 las fotos
-- vivían en carpetas de Google y el JSON traía URLs de lh3.googleusercontent.com.
-- Al bajarlas a Supabase se dejaron con las dos columnas para no tener que
-- re-subir las 74 fotos en el primer día.
--
-- El problema es que el puente nunca se cerró. Un año después el "temporal" era
-- el estado normal: el panel seguía ofreciendo el campo para pegar una URL
-- (con el placeholder que decía textualmente "ej: de googleusercontent.com"),
-- y la CSP necesitaba img-src https: para que las URLs pegadas cargaran. Cada
-- decisión de diseño del modelo de Drive terminó siendo también una
-- concesión permanente.
--
-- En una plantilla reutilizable el compromiso es al revés: el modelo es
-- simple, una sola fuente, y las imágenes se suben desde el panel. Un cliente
-- que quiera una foto alojada afuera la sube a su propio Storage o la deja
-- para un caso puntual que se decida a conciencia, no como residuo de otra
-- herramienta.
--
-- ----------------------------------------------------------------------------
-- QUÉ PASA CON LAS FILAS QUE SOLO TENÍAN external_url
-- ----------------------------------------------------------------------------
-- Se quedan con storage_path NULL: la imagen desaparece de la tienda y el
-- admin tiene que volver a subir el archivo desde el panel. No se intenta
-- copiar nada a Storage porque no se puede: el endpoint público de Drive exige
-- la API key de la cuenta de Google que subió el archivo, y una plantilla
-- distribuida no tiene acceso a los Drive de sus clientes.
--
-- En la base de este proyecto la operación no hace nada: la tabla está vacía
-- (ver el PASO 1). En una base donde sí hubiera filas, el PASO 1 dice cuántas
-- quedan sin imagen ANTES de que corras esto, para que la decisión sea
-- informada y no un sorpresa después.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ HAY QUE TIRAR LOS CHECK ANTES QUE LAS COLUMNAS
-- ----------------------------------------------------------------------------
-- Postgres no tira una columna que un CHECK referencia: responde "cannot drop
-- column ... because other objects depend on it". Los cuatro constraints se
-- fueron a `num_nonnulls(una, otra) <= 1`, o sea que no tienen sentido sin la
-- columna y además dejaban de proteger algo (ya no hay dos fuentes entre las
-- que elegir). Se los tira primero y después las columnas.
--
-- Idempotente: todo es `if exists`. Se puede correr dos veces.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- PASO 1 — Informativo. Correrlo ANTES del begin de abajo.
-- ----------------------------------------------------------------------------
-- Dice cuántas filas se quedarían sin imagen si se corre esta migración.
-- Todas en cero = no hay nada que perder.
--
-- select 'product_images' as tabla, count(*) from public.product_images
--   where storage_path is null or storage_path = ''
-- union all
-- select 'sliders', count(*) from public.sliders
--   where storage_path is null or storage_path = ''
-- union all
-- select 'banners (fondo)', count(*) from public.banners
--   where imagen_path is null or imagen_path = ''
-- union all
-- select 'banners (logo)', count(*) from public.banners
--   where logo_path is null or logo_path = ''
-- union all
-- select 'reviews', count(*) from public.reviews
--   where storage_path is null or storage_path = ''
-- union all
-- select 'iconos_pie', count(*) from public.iconos_pie
--   where storage_path is null or storage_path = '';
--
-- Ojo: esto cuenta las filas SIN imagen, no las que la pierden. Para ver
-- exactamente cuántas habría que recuperar, apuntar a la columna que esta
-- migración todavía no dropeó:
--
-- select 'product_images' as tabla, count(*) as quedan_sin_imagen
--   from public.product_images where external_url is not null and external_url <> ''
-- union all
-- select 'sliders', count(*) from public.sliders where external_url is not null and external_url <> ''
-- union all
-- select 'banners (fondo)', count(*) from public.banners where imagen_url is not null and imagen_url <> ''
-- union all
-- select 'banners (logo)', count(*) from public.banners where logo_url is not null and logo_url <> ''
-- union all
-- select 'reviews', count(*) from public.reviews where external_url is not null and external_url <> ''
-- union all
-- select 'iconos_pie', count(*) from public.iconos_pie where external_url is not null and external_url <> '';

-- ----------------------------------------------------------------------------
-- Constraints de "una o la otra fuente"
-- ----------------------------------------------------------------------------
alter table public.product_images drop constraint if exists product_images_fuente;
alter table public.sliders      drop constraint if exists sliders_fuente;
alter table public.banners      drop constraint if exists banners_imagen_fuente;
alter table public.banners      drop constraint if exists banners_logo_fuente;
alter table public.reviews      drop constraint if exists reviews_fuente;
alter table public.iconos_pie   drop constraint if exists iconos_pie_fuente;

-- ----------------------------------------------------------------------------
-- Las columnas
-- ----------------------------------------------------------------------------
alter table public.product_images drop column if exists external_url;
alter table public.sliders      drop column if exists external_url;
alter table public.banners      drop column if exists imagen_url;
alter table public.banners      drop column if exists logo_url;
alter table public.reviews      drop column if exists external_url;
alter table public.iconos_pie   drop column if exists external_url;

-- ----------------------------------------------------------------------------
-- Comentarios de tabla que nombraban la columna eliminada
-- ----------------------------------------------------------------------------
-- El de product_images decía "...; external_url se usa para migrar datos que
-- siguen en Google Drive." Quedaría describiendo algo que ya no existe, y un
-- comentario de `comment on table` es lo primero que se lee cuando alguien
-- inspecciona el esquema en Supabase.
comment on table public.product_images is
    'Imágenes de un producto. storage_path apunta a Supabase Storage con la convención products/<id>/<archivo> y es la única fuente: la columna external_url del puente con Google Drive se eliminó en la 0043.';

-- ----------------------------------------------------------------------------
-- Valores por defecto de las columnas de path
-- ----------------------------------------------------------------------------
-- Ninguna de estas columnas es not null, así que una fila sin imagen es válida
-- y el front la maneja (mapaProducto devuelve imagen: '' y sale el placeholder).
-- No se agrega NOT NULL a propósito: el admin puede crear un producto y subirle
-- las fotos después, y la regla de "toda imagen viene de Storage" la hace el
-- panel, no el esquema.

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
-- ============================================================================

-- PASO 2 — Que no quede ninguna de las columnas.
-- select table_name, column_name
--   from information_schema.columns
--  where table_schema = 'public'
--    and column_name in ('external_url', 'imagen_url', 'logo_url');
-- -- Esperado: 0 filas.

-- PASO 3 — Que tampoco queden los CHECK.
-- select conname from pg_constraint
--  where conname in ('product_images_fuente', 'sliders_fuente',
--                    'banners_imagen_fuente', 'banners_logo_fuente',
--                    'reviews_fuente', 'iconos_pie_fuente');
-- -- Esperado: 0 filas.

-- PASO 4 — Que el front no esté pidiendo columnas que ya no existen.
-- No se puede probar desde acá, pero conviene abrir la tienda y el panel: si
-- algún select() todavía nombrara external_url, PostgREST responde 42703
-- "column does not exist" y la sección queda vacía sin mensaje.
--
-- En el repo ya no queda ninguna: `grep -rn "external_url" js/ admin/js/` no
-- devuelve nada, y urlImagen() ya no acepta el segundo argumento.
