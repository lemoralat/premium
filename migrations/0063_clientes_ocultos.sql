-- ============================================================================
-- LEMORA — Migración 0063: clientes ocultos (sección Clientes del panel).
--
-- ----------------------------------------------------------------------------
-- QUÉ RESUELVE
-- ----------------------------------------------------------------------------
-- La sección Clientes arma su listado agrupando orders.cliente (la tienda no
-- tiene tabla de clientes). "Eliminar un cliente" NO debe borrar sus pedidos:
-- sólo sacarlo de la vista. Para eso se guarda acá su clave de identidad (la
-- misma que calcula admin/js/clientes.js: email → teléfono → nombre,
-- normalizada) y el listado filtra esta tabla.
--
--   · `clave` es la PK: ocultar dos veces al mismo cliente es idempotente
--     (el panel hace upsert).
--   · `nombre`/`email`/`telefono` son un SNAPSHOT sólo para poder listar y
--     restaurar sin depender de que el cliente tenga pedidos confirmados.
--     La fuente de verdad sigue siendo orders.cliente.
--   · NO se toca `orders` ni `order_items`: quitar/restaurar no borra nada de
--     la historia de ventas ni afecta los ingresos del dashboard.
--
-- ----------------------------------------------------------------------------
-- SEGURIDAD
-- ----------------------------------------------------------------------------
-- A diferencia de las tablas de la tienda, esta NO se expone a la anon key
-- (es información administrativa). RLS + grants para administradores
-- autenticados; la RLS valida public.es_admin() igual que el resto del panel.
--
-- APLICAR: SQL Editor del dashboard. Correr el archivo completo (begin/commit).
-- RE-EJECUTABLE: create table/policy if exists + grants idempotentes.
-- ============================================================================

begin;

create table if not exists public.clientes_ocultos (
    clave       text primary key,
    nombre      text not null default '',
    email       text not null default '',
    telefono    text not null default '',
    ocultado_en timestamptz not null default now()
);

comment on table public.clientes_ocultos is
    'Clientes quitados de la sección Clientes del panel. Sólo oculta la fila: orders/order_items no se tocan. clave = identidad normalizada (email:… / tel:… / nombre:…).';

alter table public.clientes_ocultos enable row level security;

drop policy if exists "Clientes ocultos: admin full" on public.clientes_ocultos;
create policy "Clientes ocultos: admin full"
    on public.clientes_ocultos
    for all
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

-- La tienda (anon key) no necesita ver ni tocar esta tabla.
revoke all on public.clientes_ocultos from anon;
grant select, insert, update, delete on public.clientes_ocultos to authenticated, service_role;

-- Registro en schema_migrations (si la vista de 0045 ya existe).
do $$
begin
    if to_regclass('public.schema_migrations') is not null then
        insert into public.schema_migrations (nombre)
        values ('0063_clientes_ocultos')
        on conflict do nothing;
    end if;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (opcional)
-- ----------------------------------------------------------------------------
--   -- La tabla debería existir con RLS activa:
--   select relname, relrowsecurity from pg_class where oid = 'public.clientes_ocultos'::regclass;
--   -- Clientes ocultos actuales:
--   select * from public.clientes_ocultos order by ocultado_en desc;
--   -- La anon key no debe poder leerla:
--   select has_table_privilege('anon', 'public.clientes_ocultos', 'select');
--   -- Esperado: false
-- ============================================================================
