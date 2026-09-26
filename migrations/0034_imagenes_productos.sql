-- ============================================================================
-- 0034 — Interruptor de carga de imágenes de productos
--
-- PROBLEMA: la tienda descarga la foto de cada producto en el catálogo, en el
-- detalle, en favoritos, en la búsqueda y en el carrito. Con un catálogo
-- grande son decenas (o cientos) de requests a Storage, y la tienda se vuelve
-- lenta justo en la conexión mala, que es cuando más se nota. El admin no
-- tenía ninguna forma de desactivarlo: sólo podía subir fotos o no subirlas.
--
-- SOLUCIÓN: una columna booleana en `settings` que el panel edita (Diseño →
-- "Identidad visual") y que la tienda pública respeta antes de armar cada
-- <img> de producto. Con el interruptor apagado NO se pide ninguna foto: se
-- pinta el mismo placeholder que ya se usaba para los productos sin imagen,
-- así que el catálogo queda prolijo y no se ve "roto".
--
-- Default: TRUE (sí carga). Es lo que se comportaba el sitio desde el inicio,
-- así que aplicar la migración no cambia nada a la vista.
--
-- ALCANCE, deliberadamente acotado a las fotos de PRODUCTO:
--
--   · Se apagan: catálogo, relacionados, detalle (imagen principal, galería de
--     miniaturas y el zoom), favoritos, resultados de búsqueda, carrito y el
--     sidemenu del carrito.
--   · NO se apagan: banners, hero slider, fotos de testimonios, íconos del
--     pie, logo, favicon y la imagen de OpenGraph. Son diseño de la tienda, no
--     catálogo, y el logo/favicon son justamente lo que se cambia desde la
--     MISMA tarjeta de Diseño.
--   · El panel admin NO se ve afectado: sigue mostrando todas las fotos, que
--     es lo que hace falta para cargarlas y borrarlas. El panel no importa el
--     utils.js público, así que el interruptor no puede apagarle las suyas.
--
-- La lectura es tolerante a que la columna no exista (cargarConfiguracionGlobal
-- usa `!== false`), así que el sitio funciona igual antes de aplicar esto.
--
-- Idempotente: sólo `add column if not exists` + `comment on`, que es
-- re-declarable. Se puede correr las veces que haga falta.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

begin;

alter table public.settings
    add column if not exists cargar_imagenes_productos boolean not null default true;

comment on column public.settings.cargar_imagenes_productos is
    'Diseño → Identidad visual. Si es false, la tienda pública no pide ninguna foto de producto y pinta el placeholder neutro. No afecta al panel admin, ni a banners, hero, testimonios, logo ni favicon.';

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — La columna existe y el default es "sí carga".
--   Esperado: 1 fila, data_type boolean, column_default true.
-- ============================================================================
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'settings'
--    and column_name = 'cargar_imagenes_productos';

-- ============================================================================
-- PASO 2 — El valor de la fila. Tiene que ser true: si el panel guardó
--   diseño antes de aplicar la migración, la columna no estaría y este SELECT
--   no devolvería nada (0 filas = falta correr 0034).
-- ============================================================================
-- select id, cargar_imagenes_productos from public.settings where id = 1;

-- ============================================================================
-- PASO 3 — Que el apagado no rompa el guardado de Diseño.
--   Apagá el interruptor en el panel y guardá. Si tira error de columna, es
--   que falta aplicar 0034 (el panel filtra la columna del UPDATE, pero el
--   aviso igual te dice cuál falta).
-- ============================================================================
