-- ============================================================================
-- 0024: Plantilla reutilizable — DEFAULTS de settings sin datos de Lemora
-- ============================================================================
-- La plantilla (un repo por cliente) no debe nacer con el número de WhatsApp ni
-- los datos de transferencia de Lemora como DEFAULTS de configuración.
--
-- Este script es IDEMPOTENTE y SOLO cambia DEFAULTS: no toca los valores
-- existentes de la fila settings (id=1). Aplicar en cada proyecto (incluido el
-- de Lemora) para que un futuro insert con defaults no resucite datos viejos.
--
-- Nota: whatsapp_default_message se mantiene por ser un mensaje genérico.
-- ============================================================================
alter table public.settings alter column whatsapp_number set default '';
alter table public.settings alter column transfer_alias set default '';
alter table public.settings alter column transfer_entity set default '';
alter table public.settings alter column transfer_holder set default '';