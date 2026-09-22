-- ============================================================================
-- LEMORA — Migración 0010: Color principal negro por defecto.
--
-- La sección "Diseño" (#/diseno) administra `settings.color_principal` como
-- --primary-color de la tienda. El default pasa de azul (#2563eb) a negro (#000000):
--   - El DEFAULT de la columna se actualiza (afecta inserciones futuras).
--   - La fila existente (id=1) que conserve el antiguo default se actualiza a
--     negro; si el admin ya eligió otro color, se respeta.
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

alter table public.settings
    alter column color_principal set default '#000000';

update public.settings
    set color_principal = '#000000'
    where color_principal = '#2563eb';