-- ============================================================================
-- 0033 — Descripción del negocio para el meta description del sitio
--
-- PROBLEMA: las 8 páginas públicas tenían el meta description hardcodeado en
-- el HTML, y 6 de 8 eran literalmente el mismo texto genérico: "Tienda online
-- con los mejores productos. Envíos a todo el país." No había forma de
-- cambiarlo sin tocar el HTML y redesplegar, así que cada página que se
-- agregaba heredaba un texto que no describía nada del negocio. Para SEO eso
-- es lo peor que se puede tener en la página principal.
--
-- SOLUCIÓN: una columna en `settings` que el panel edita (Configuración →
-- "Datos generales", junto al nombre y el correo) y que el sitio aplica por JS
-- a las metas marcadas con data-desde-config en el HTML.
--
-- ALCANCE, a tener en cuenta al usarla:
--
--   · El sitio es HTML estático servido por Vercel, sin render en servidor. La
--     meta llega al navegador recién con el JS de template.js. Google ejecuta
--     JS y la indexa, pero los previews de WhatsApp, Facebook y Slack NO
--     ejecutan JS: leen el og:description estático del HTML, que queda como
--     valor por defecto.
--   · Por eso sólo se marcaron con data-desde-config las metas que eran
--     genéricas: el meta description de 6 páginas (home, producto, carrito,
--     faq, gracias, contacto) y el og/twitter description de la home. El
--     og/twitter de las otras 5 YA tenía texto propio y mejor ("Revisá tu
--     pedido y finalizá tu compra", "Encontrá respuestas a tus dudas sobre
--     envíos…", "Ponete en contacto con nosotros…") y se dejó intacto: en un
--     preview de WhatsApp eso vale más que la descripción genérica del
--     negocio. 404 y favoritos también quedan fuera, con su texto propio.
--   · Para cambiar lo que ven los previews de redes hay que editar el HTML, o
--     migrar la tienda a un render en servidor.
--
-- El default de la columna es EXACTAMENTE el texto que las metas ya tenían, así
-- que la fila existente no cambia a la vista al aplicar la migración.
--
-- NO hay backfill, a propósito: el `add column ... not null default` ya llena
-- la fila existente con ese default, y un `update` de relleno pisaría la
-- decisión del admin si lo deja vacío (vacío = se conserva el texto genérico
-- del HTML). Sin backfill, re-aplicar 0033 no destruye nada.
--
-- Idempotente: sólo `add column if not exists` + `comment on`, que es
-- re-declarable. Se puede correr las veces que haga falta.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

begin;

alter table public.settings
    add column if not exists site_description text not null default
        'Tienda online con los mejores productos. Envíos a todo el país.';

comment on column public.settings.site_description is
    'Descripción del negocio: meta description del sitio (Configuración → Datos generales). Se aplica por JS a las metas con data-desde-config. Máximo útil ~160 caracteres (Google corta alrededor de ahí). Vacío = se conserva el texto genérico del HTML.';

commit;

-- ===========================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — La columna existe con el default correcto.
--   Esperado: 1 fila.
-- ===========================================================================
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'settings'
--    and column_name = 'site_description';

-- ===========================================================================
-- PASO 2 — Cuántas metas quedan marcadas para tomar la config.
--   Esperado: 8 (meta description en 6 páginas + og/twitter description en
--   la home). 404 y favoritos NO deben aparecer: tienen texto propio.
--   Si aparece una página que no esperabas, revisá el HTML antes de guardar.
-- ===========================================================================
-- grep -rc 'data-desde-config' *.html

-- ===========================================================================
-- PASO 3 — El default NO debe quedar como '' (significaría que se aplicó con
--   la columna ya creada y vacía, y el sitio perdería la descripción).
--   Esperado: site_description = 'Tienda online con los mejores productos...'
-- ===========================================================================
-- select site_description from public.settings where id = 1;
