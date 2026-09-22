-- ============================================================================
-- LEMORA — Migración 0008: Higiene de permisos (repaso de seguridad).
--
-- PROFILES: la edición por la API de Supabase queda limitada a la columna
-- `full_name` — el único campo que escribe el panel (admin/js/cuenta.js).
--
-- Por qué es seguro y necesario:
--   - El rol dejó de ser la puerta del panel (esa es `public.admins` desde la
--     migración 0007), así que un usuario jamás debería poder alterar
--     `profiles.role` por la API.
--   - El alta de perfiles al registrarse NO se ve afectada: `handle_new_user`
--     es security definer (migración 0001) y no depende de estos grants.
--   - La lectura del propio perfil se mantiene (policy RLS "Perfiles: lectura
--     del propio").
-- ============================================================================

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Verificación esperada: el rol autenticado solo puede UPDATE sobre full_name.
-- select * from information_schema.role_column_grants
--  where table_schema = 'public' and table_name = 'profiles';