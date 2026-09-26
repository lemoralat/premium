-- ============================================================================
-- LEMORA — Migración 0002: fila de configuración inicial.
--
-- ANTES ACÁ ESTABA EL CATÁLOGO DE LA TIENDA QUE ORIGINÓ LA PLANTILLA.
-- 345 líneas con 12 categorías, ~20 productos con sus precios y stock, sus
-- variantes, 74 fotos de Google Drive, cupones, sliders, banners y reseñas.
-- Todo era de ese negocio: los nombres de los productos, los precios, los
-- textos de los banners ("Recibí tus compras estés donde estés, llegamos a
-- cada rincón de Argentina") y las fotos en lh3.googleusercontent.com.
--
-- ESTE ARCHIVO YA NO SEMILLA CATÁLOGO, A PROPÓSITO.
-- La plantilla se vende a clientes y se instala vacía a propósito: el admin
-- carga sus productos, sus banners y sus reseñas desde el panel. Un cliente que
-- compra la plantilla no tiene por qué heredar 20 productos de otra tienda, y
-- uno que se olvide de borrar el seed se encuentra con una tienda ajena en
-- producción.
--
-- Por qué el archivo sigue existiendo en vez de borrarse: la numeración de las
-- migraciones es la cadena de aplicación y hay huecos con historia (0016 nunca
-- existió; 0034 se aplicó y se revirtió). Renumerar 40 archivos para tapar un
-- hueco es una forma de romper la instalación de todos los clientes a los que
-- ya se les entregó la versión anterior. El número queda reservado.
--
-- Si querés una demo para probar, cargala desde el panel: es más honesto que
-- dejarla en el repositorio, y las secciones sin datos se ocultan solas.
--
-- ----------------------------------------------------------------------------
-- LO QUE SÍ QUEDA: la fila id = 1 de settings.
-- ----------------------------------------------------------------------------
--settings es de fila única y TODA la configuración la cuelga de la fila 1:
--   · admin/js/configuracion.js hace .select('*').eq('id', 1).single() → con 0
--     filas el .single() tira error y la pestaña Configuración no abre.
--   · el guardado es .update(payload).eq('id', 1) → con 0 filas actualiza 0
--     filas y no avisa: el admin creería que guardó y no guardó nada.
--   · insertar_pedido hace "select discount_threshold, discount_percent
--     from settings where id = 1".
-- O sea: sin esta fila la instalación no es administrable. Se crea vacía de
-- contenido, con los valores por defecto que significan "nada configurado".
--
-- Valores y por qué:
--   site_name         'Mi Tienda Online' — genérico, el admin lo cambia en el panel.
--   whatsapp_*        ''  — sin número no hay botón de WhatsApp (el template.js
--                        lo esconde solo si está vacío).
--   transfer_*        ''  — datos bancarios vacíos, se completan por cliente.
--   social_*          ''  — el input del panel ya trae su propio placeholder.
--   discount_*        0 / 0 — descuento automático DESACTIVADO.
--
-- Sobre el 0 del descuento: antes esta línea sembraba 100000 y 10, que son los
-- mismos números que quedaron hardcodeados en js/utils.js. Con el `||` que
-- tenía el front, el 0 del admin se descartaba y la tienda anunciaba 10% en todo
-- pedido de $100.000 o más sin cobrar ese descuento. Corregido en la 0042
-- (lado servidor) y en js/utils.js (lado front, con numeroOVacio). Sembrar 0/0
-- es lo coherente con esa corrección: una tienda nueva arranca sin descuentos
-- hasta que el admin los configure.
-- ============================================================================

insert into public.settings (
    id, site_name, whatsapp_number, whatsapp_default_message,
    discount_threshold, discount_percent,
    transfer_alias, transfer_entity, transfer_holder,
    social_facebook, social_instagram, social_tiktok
) values (
    1, 'Mi Tienda Online', '', '',
    0, 0,
    '', '', '',
    '', '', ''
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Secuencias identity
-- ----------------------------------------------------------------------------
-- El greatest(coalesce(max(id), 0), 1) no es cosmético: `setval` con NULL tira
-- "value NULL is not allowed", así que la forma directa que usaba este archivo
-- antes (setval(seq, (select max(id) from tabla))) revienta en una base nueva,
-- que es justamente el caso de uso de una plantilla. Con este envoltorio una
-- tabla vacía deja la secuencia en 1 (el primer id real será el 2: se pierde un
-- número, no importa) y una tabla con datos queda en el máximo, como siempre.
--
-- La migración existe también para esto: aunque no siembre nada, deja las
-- secuencias en un estado conocido para que el primer producto que cargue el
-- admin no choque con un id ya usado.
select setval(pg_get_serial_sequence('public.categories', 'id'),             greatest(coalesce(max(id), 0), 1)) from public.categories;
select setval(pg_get_serial_sequence('public.products', 'id'),               greatest(coalesce(max(id), 0), 1)) from public.products;
select setval(pg_get_serial_sequence('public.product_options', 'id'),        greatest(coalesce(max(id), 0), 1)) from public.product_options;
select setval(pg_get_serial_sequence('public.product_option_values', 'id'),  greatest(coalesce(max(id), 0), 1)) from public.product_option_values;
select setval(pg_get_serial_sequence('public.product_images', 'id'),         greatest(coalesce(max(id), 0), 1)) from public.product_images;
select setval(pg_get_serial_sequence('public.sliders', 'id'),                 greatest(coalesce(max(id), 0), 1)) from public.sliders;
select setval(pg_get_serial_sequence('public.banners', 'id'),                 greatest(coalesce(max(id), 0), 1)) from public.banners;
select setval(pg_get_serial_sequence('public.reviews', 'id'),                 greatest(coalesce(max(id), 0), 1)) from public.reviews;
