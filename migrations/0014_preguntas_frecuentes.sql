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
-- Idempotente para una instalación nueva: se puede reaplicar sin error.
-- ⚠️ SOBRE LA BASE VIVA re-aplicarla SÍ cambia el estado: recrea
--    "Preguntas frecuentes: admin full" con `using (true)`, la versión que
--    0026 endureció a es_admin() (mismo nombre ⇒ la pisa). Desde la auditoría
--    2026-10-08 este archivo tiene una GUARDA AL INICIO que aborta si ya está
--    registrado en schema_migrations; si lo forzás igual, corré después
--    migrations/0050_rls_endurecida.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- GUARDA ANTI-DEGRADACIÓN (Error 3 — auditoría 2026-10-08)
--
-- Re-ejecutar este archivo sobre una base viva REABRE la RLS que 0026 endureció
-- con es_admin(). Si la base ya tiene la tabla de registro (0045) con esta
-- migración anotada, abortamos antes de ejecutar nada. Para forzarla (no
-- recomendado): delete from public.schema_migrations
-- where nombre = '0014_preguntas_frecuentes';
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.schema_migrations') is not null
       and exists (select 1 from public.schema_migrations where nombre = '0014_preguntas_frecuentes') then
        raise exception
            '0014_preguntas_frecuentes.sql ya está registrada en schema_migrations: re-ejecutarla degradaría la RLS (Error 3). Abortada a propósito. Si de verdad necesitás re-aplicarla, borrá antes su fila de schema_migrations.';
    end if;
end $$;

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