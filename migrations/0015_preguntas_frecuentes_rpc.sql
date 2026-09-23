-- ============================================================================
-- LEMORA — Migración 0015: RPC de conteo para preguntas frecuentes.
--
-- La tienda (faq.html) debe distinguir tres estados de la página de ayuda:
--   1) Supabase caído            -> se mantiene el HTML estático actual.
--   2) Tabla vacía (total = 0)   -> fallback al HTML estático (el admin aún
--                                   no cargó preguntas).
--   3) Hay preguntas, todas ocultas (activo=false) -> se oculta la sección.
--
-- La RLS de 0007/0014 solo deja ver a anon/authenticated las filas con
-- activo=true, así que la tienda no puede distinguir 2 de 3 por SELECT.
-- Esta función security definer devuelve SOLO el total de filas (un entero),
-- sin exponer el contenido de las preguntas ocultas.
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

create or replace function public.contar_preguntas_frecuentes()
returns integer
language sql
security definer
set search_path = public
as $$
    select count(*)::int from public.preguntas_frecuentes;
$$;

comment on function public.contar_preguntas_frecuentes()
    is 'Total de filas de preguntas_frecuentes (incluye ocultas). Solo devuelve un entero: no filtra contenido.';

-- La tienda pública (anon) y el panel (authenticated) pueden consultarla.
revoke all on function public.contar_preguntas_frecuentes() from public;
grant execute on function public.contar_preguntas_frecuentes() to anon, authenticated;