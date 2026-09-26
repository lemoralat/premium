-- ============================================================================
-- 0030 — Banner del carrito elegido explícitamente (banners.en_carrito)
--
-- PROBLEMA: el banner del carrito no se elegía, se deducía de la posición. El
-- front tomaba `banners[banners.length - 1]`, o sea el último por `position`, y
-- el inicio tomaba todos menos ese último. La regla estaba escrita en el
-- comentario de la tabla (0001), en el toolbar del panel y en dos comentarios
-- del código, pero no había forma de cambiarla desde el panel.
--
-- CONSECUENCIA: el alta de un banner nuevo le da `position = banners.length + 1`
-- (admin/js/banners.js), o sea que siempre queda último, y entonces siempre
-- queda siendo el del carrito. Crear un banner para el inicio cambiaba, sin
-- avisar, el banner del carrito. Con un solo banner no hay forma de que el
-- carrito quede sin banner, porque el único es por definición el último.
--
-- SOLUCIÓN: columna `en_carrito`. El que la tiene va a la página de carrito y no
-- al inicio; el resto se intercalan en el inicio (tope 4), como antes pero sin
-- depender del orden. A lo sumo uno puede tenerla, y eso lo garantiza el índice
-- parcial de más abajo, no sólo el panel.
--
-- El backfill marca el banner que hoy ocupa el carrito (el último activo por
-- posición) para que el deploy no cambie nada a la vista: el panel queda con el
-- control, pero el banner sigue donde el usuario lo está viendo. Si no hubiera
-- ningún banner activo, no se marca ninguno y el carrito queda vacío.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

alter table public.banners
    add column if not exists en_carrito boolean not null default false;

-- Backfill del banner que ya está en el carrito. El "not exists" hace que el
-- archivo sea seguro de re-aplicar: si el admin ya movió la elección a otro
-- banner, volver a correr esto no la pisa.
update public.banners
   set en_carrito = true
 where not exists (select 1 from public.banners b2 where b2.en_carrito)
   and activo
   and id = (
       select id
         from public.banners
        where activo
        order by position desc, id desc
        limit 1
   );

-- Como máximo un banner puede ser el del carrito. El índice es sobre la misma
-- columna filtrada por true, así que todas las filas que entran valen lo mismo
-- y la unicidad equivale a "una sola fila". Las que están en false no entran al
-- índice, así que puede haber tantas como se quiera.
create unique index if not exists banners_solo_un_carrito
    on public.banners (en_carrito)
    where en_carrito;

comment on column public.banners.en_carrito is
    'true = este banner va en la página de carrito (y no en el inicio). Como máximo uno.';

comment on table public.banners is
    'Banners promocionales. Los que tienen en_carrito = true van en la página de carrito; el resto se intercalan en el inicio (tope 4), en orden por position.';
