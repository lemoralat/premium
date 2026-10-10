-- ============================================================================
-- LEMORA — Migración 0055: popup de salida desactivado por defecto
--
-- CONTEXTO
--   Hasta acá el popup de salida arrancaba ACTIVO: la migración 0013 agregó
--   settings.popup_activo con `default true`, así que toda tienda nueva (y la
--   fila existente id=1, por el NOT NULL con default) quedaba con el popup
--   encendido aunque el dueño nunca lo hubiera configurado.
--
--   A partir de esta migración el default es DESACTIVADO: el popup solo se
--   muestra cuando el dueño lo activa explícitamente en Configuración → Popup
--   de salida. Este archivo apaga el popup en las filas que quedaron con el
--   valor que dejó el default de 0013 (popup_activo = true sin decisión del
--   dueño detrás).
--
--   Capas que acompañan este cambio (repos, no requieren SQL):
--     · migrations/0013: default de la columna pasa a `false` (tiendas nuevas).
--     · js/utils.js: CONFIG_APP.popupActivo = false y se lee con `=== true`
--       (solo un valor explícito enciende), mismo criterio conservador que
--       marqueeActivo.
--     · js/salida-popup.js: fallback pre-config con `activo: c.activo === true`.
--     · admin/js/configuracion.js: el checkbox "Popup activo" arranca
--       desmarcado.
--
-- REEJECUTABLE: update idempotente dentro de begin/commit. OJO: si se
--   re-ejecuta DESPUÉS de que el dueño haya activado el popup, lo volvería a
--   apagar. Aplicar UNA sola vez: es un cambio de default, no una regla de
--   negocio en vigor.
--
-- APLICACIÓN: SQL Editor del dashboard. Correr el archivo completo. Al final
-- registra su nombre en public.schema_migrations (si 0045 ya corrió).
-- ============================================================================

begin;

-- Apaga el popup en las filas que quedaron con el default de 0013.
update public.settings
   set popup_activo = false
 where popup_activo = true;

-- ----------------------------------------------------------------------------
-- Registro en schema_migrations (si 0045 ya creó la tabla)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0055_popup_activo_default_false')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN (correr por separado, después del commit).
-- ============================================================================
-- select popup_activo from public.settings where id = 1;
-- -- Esperado: false (el popup queda apagado; se enciende en el panel).
-- select nombre, aplicada_en from public.ultimas_migraciones
--  order by aplicada_en desc limit 3;
-- -- Esperado: 0055_popup_activo_default_false en primer lugar.
-- ============================================================================