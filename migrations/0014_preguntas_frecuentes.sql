-- ============================================================================
-- LEMORA — Migración 0014: Preguntas frecuentes administrables.
--
-- La página faq.html deja de ser solo HTML estático: el contenido (pregunta +
-- respuesta + ícono FontAwesome opcional) se administra desde el dashboard
-- (nueva sección #/preguntas-frecuentes) con un repeater field.
--
--   - Sin seed: la sección empieza vacía (ninguna fila por defecto). Mientras
--     la tabla esté vacía, la tienda mantiene el contenido estático actual
--     como fallback.
--   - icono text NULL → clase Font Awesome (ej. 'fa-solid fa-truck'). NULL =
--     la pregunta se muestra sin ícono.
--   - RLS: lectura pública solo de las activas; administración autenticada.
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLA preguntas_frecuentes
-- ----------------------------------------------------------------------------
create table if not exists public.preguntas_frecuentes (
    id          integer generated always as identity primary key,
    icono       text,
    pregunta    text not null,
    respuesta   text not null default '',
    position    integer not null default 0,
    activo      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table public.preguntas_frecuentes
    is 'Preguntas frecuentes de la página faq.html (base del contenido dinámico).';
comment on column public.preguntas_frecuentes.icono
    is 'Clase Font Awesome (ej. fa-solid fa-truck). NULL = sin ícono.';

create index if not exists preguntas_frecuentes_activo_idx
    on public.preguntas_frecuentes (activo);

-- ---------- updated_at ----------
drop trigger if exists trg_preguntas_frecuentes_updated_at on public.preguntas_frecuentes;
create trigger trg_preguntas_frecuentes_updated_at
    before update on public.preguntas_frecuentes
    for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.preguntas_frecuentes enable row level security;

drop policy if exists "Preguntas frecuentes: lectura pública" on public.preguntas_frecuentes;
create policy "Preguntas frecuentes: lectura pública"
    on public.preguntas_frecuentes for select
    to anon, authenticated
    using (activo = true);

drop policy if exists "Preguntas frecuentes: admin full" on public.preguntas_frecuentes;
create policy "Preguntas frecuentes: admin full"
    on public.preguntas_frecuentes for all
    to authenticated
    using (true)
    with check (true);

-- Los GRANT ya quedan cubiertos por el "alter default privileges" de 0001
-- (select/references a anon; all a authenticated y service_role).