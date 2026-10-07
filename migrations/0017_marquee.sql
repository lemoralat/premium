-- ============================================================================
-- LEMORA — Migración 0017: Marquee promocional administrable.
--
-- La barra marquee (banner animado sobre el encabezado) estaba comentada en el
-- código con textos hardcodeados. Ahora se administra desde el dashboard
-- (sección "Diseño") con un repeater field de mensajes.
--
--   - marquee_items: cada fila = un mensaje de la barra. `position` ordena y
--     `activo` controla la visibilidad individual.
--   - settings.marquee_activo: muestra/oculta la barra completa.
--   - settings.marquee_color_fondo: color de fondo de la barra (#RRGGBB); el
--     texto se mantiene blanco (diseño original).
--   - Sin seed: sin filas activas la barra no se muestra (nada hardcodeado).
--
-- RLS: lectura pública solo de los activos; administración autenticada
-- (mismo patrón que preguntas_frecuentes, migración 0014).
--
-- Idempotente para una instalación nueva: se puede reaplicar sin error.
-- ⚠️ SOBRE LA BASE VIVA re-aplicarla SÍ cambia el estado: recrea
--    "Marquee: admin full" con `using (true)`, la versión que 0026 endureció
--    a es_admin() (mismo nombre ⇒ la pisa). Si se re-ejecuta, correr después
--    migrations/0026_cierre_rls_admin.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLA marquee_items
-- ----------------------------------------------------------------------------
create table if not exists public.marquee_items (
    id          integer generated always as identity primary key,
    texto       text not null,
    position    integer not null default 0,
    activo      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table public.marquee_items
    is 'Mensajes de la barra marquee (base del contenido dinámico del marquee).';
comment on column public.marquee_items.texto
    is 'Mensaje promocional. Se muestra como ítem de la barra (duplicado para el loop infinito).';

create index if not exists marquee_items_activo_idx
    on public.marquee_items (activo);

drop trigger if exists trg_marquee_items_updated_at on public.marquee_items;
create trigger trg_marquee_items_updated_at before update on public.marquee_items
    for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- COLUMNAS en settings (sección "Diseño" del panel)
-- ----------------------------------------------------------------------------
alter table public.settings
    add column if not exists marquee_activo      boolean not null default true,
    add column if not exists marquee_color_fondo text    not null default '#000000';

comment on column public.settings.marquee_activo
    is 'Si la barra marquee se muestra en la tienda (sección Diseño). Con la migración aplicada, la barra requiere además mensajes activos.';
comment on column public.settings.marquee_color_fondo
    is 'Color de fondo de la barra marquee (#RRGGBB). El texto de la barra es blanco.';

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.marquee_items enable row level security;

drop policy if exists "Marquee: lectura pública" on public.marquee_items;
create policy "Marquee: lectura pública"
    on public.marquee_items for select
    to anon, authenticated
    using (activo = true);

drop policy if exists "Marquee: admin full" on public.marquee_items;
create policy "Marquee: admin full"
    on public.marquee_items for all
    to authenticated
    using (true)
    with check (true);
