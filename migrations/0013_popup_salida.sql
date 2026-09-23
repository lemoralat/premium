-- ============================================================================
-- LEMORA — Migración 0013: Popup de salida configurable.
--
-- La ventana que aparece al intentar abandonar la tienda (js/salida-popup.js)
-- tenía el texto fijo en el código. Ahora se edita desde el dashboard
-- (Configuración → Popup de salida) y la tienda lo lee de settings:
--   popup_titulo      → título de la ventana
--   popup_descripcion → texto debajo del título
--   popup_cta         → texto del botón principal (CTA)
--   popup_cta_url     → destino del CTA (página interna o URL externa)
--   popup_activo      → true muestra el popup, false lo desactiva
--
-- Los defaults replica el contenido que la tienda mostraba hasta ahora.
-- Al agregar columnas NOT NULL con default, la fila existente (id=1) recibe
-- automáticamente los valores por defecto.
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

alter table public.settings
    add column if not exists popup_titulo      text    not null default '¿Te vas tan pronto?',
    add column if not exists popup_descripcion text    not null default 'Antes de irte: envíos a todo el país y ofertas en la tienda. ¿Quieres echar un vistazo?',
    add column if not exists popup_cta         text    not null default 'Ver productos',
    add column if not exists popup_cta_url     text    not null default 'index.html#tienda',
    add column if not exists popup_activo      boolean not null default true;

comment on column public.settings.popup_titulo
    is 'Título del popup de salida';
comment on column public.settings.popup_descripcion
    is 'Descripción del popup de salida';
comment on column public.settings.popup_cta
    is 'Texto del botón principal del popup de salida';
comment on column public.settings.popup_cta_url
    is 'Destino del botón del popup de salida (página interna o URL externa)';
comment on column public.settings.popup_activo
    is 'true = el popup de salida se muestra; false = desactivado';