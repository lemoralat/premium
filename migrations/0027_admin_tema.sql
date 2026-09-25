-- ============================================================================
-- 0027_admin_tema.sql — Tema del panel admin (dark mode global).
--
-- Hallazgo / decisión (feature): el panel de administración ganó un modo
-- oscuro que se activa desde Configuración → "Apariencia del panel". La
-- preferencia es GLOBAL (afecta a todos los admins), así que vive en la fila
-- única de public.settings, no en localStorage.
--
-- Reglas del front según lo pedido:
--   - El panel SIEMPRE arranca en claro (light) por defecto.
--   - No detecta preferencia del dispositivo (matchMedia) en el panel.
--   - 'oscuro' solo cuando el admin lo elige explícitamente en Configuración.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

alter table public.settings
    add column if not exists admin_tema text not null default 'claro';

-- Valores permitidos: claro (default) u oscuro. Restricción defensiva.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.settings'::regclass
          and conname = 'settings_admin_tema_check'
    ) then
        alter table public.settings
            add constraint settings_admin_tema_check
            check (admin_tema in ('claro', 'oscuro'));
    end if;
end $$;

comment on column public.settings.admin_tema is
    'Tema del panel admin: claro (default) u oscuro. Global para todos los admins.';