-- ============================================================================
-- LEMORA — Migración 0026: Cierre del gap RLS en tablas creadas post-0007.
--
-- La migración 0007 endureció con public.es_admin() las políticas "admin full"
-- de todas las tablas de 0001, PERO las tablas creadas DESPUÉS quedaron con el
-- patrón viejo `to authenticated using (true) with check (true)`:
--
--   • iconos_pie            (0004)
--   • preguntas_frecuentes  (0014)
--   • marquee_items         (0017)
--
-- Con ese patrón, CUALQUIER usuario autenticado (no necesariamente admin)
-- puede insertar/modificar/borrar filas de esas tablas:
--   - defacement / intoxicación del contenido público (íconos del pie, FAQ,
--     barra marquee que se muestran en la tienda),
--   - borrado masivo (DoS de esas secciones),
--   - ruptura de la defensa en profundidad que 0007 instauró ("estar logueado
--     ya NO alcanza").
--
-- Esta migración reaplica el MISMO endurecimiento de 0007 a las tres tablas.
--
-- APLICACIÓN (SQL Editor del dashboard, después de 0025): correr este archivo.
--
-- RE-EJECUTABLE: cada create policy dropea antes el mismo nombre y todo corre
-- dentro de una transacción (begin/commit): si algo falla, revierte completo.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) ICONOS DEL PIE (migración 0004)
-- ----------------------------------------------------------------------------
drop policy if exists "Iconos: admin full" on public.iconos_pie;
create policy "Iconos: admin full"
    on public.iconos_pie for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

-- ----------------------------------------------------------------------------
-- 2) PREGUNTAS FRECUENTES (migración 0014)
-- ----------------------------------------------------------------------------
drop policy if exists "Preguntas frecuentes: admin full" on public.preguntas_frecuentes;
create policy "Preguntas frecuentes: admin full"
    on public.preguntas_frecuentes for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

-- ----------------------------------------------------------------------------
-- 3) MARQUEE (migración 0017)
-- ----------------------------------------------------------------------------
drop policy if exists "Marquee: admin full" on public.marquee_items;
create policy "Marquee: admin full"
    on public.marquee_items for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

commit;