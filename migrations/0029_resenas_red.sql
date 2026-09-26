-- ============================================================================
-- 0029 — Red de origen del testimonio (reviews.red)
--
-- PROBLEMA: la card de testimonio tenía el ícono de Google fijo, hardcodeado en
-- js/testimonios.js. La reseña se Administraba (tabla reviews, panel admin)
-- pero no había forma de indicar de qué red vino: todas mostraban el logo de
-- Google aunque el cliente la haya publicado en Instagram o YouTube.
--
-- SOLUCIÓN: nueva columna `red` con la clase de Font Awesome Brands del ícono.
-- El valor se elige en el panel admin (Reseñas → Editar → "Red de origen").
--
-- El conjunto de valores está cerrado a propósito, por dos razones:
--   1. Es lo que se renderiza en el front. El front NO interpola el valor crudo
--      en el class: lo busca en un mapa (REDES, js/testimonios.js) y, si no
--      está, cae en Google. Con la lista cerrada, un valor desconocido es
--      imposible y no hay forma de inyectar clases en el HTML.
--   2. El color de cada ícono está en css/styles.css, uno por marca. Sin la
--      lista cerrada habría íconos sin color o clases huérfanas.
--
-- Si se agrega una red nueva hay que tocar tres lugares, en este orden:
--   1. esta migración (el CHECK), y aplicarla a mano;
--   2. REDES en js/testimonios.js (la clave es la clase del ícono, el valor la
--      etiqueta para lectores de pantalla) y su color en css/styles.css;
--   3. REDES en admin/js/resenas.js (opciones del selector).
-- El default es Google, que es lo que se veía antes, así que las reseñas ya
-- cargadas no cambian de aspecto.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

alter table public.reviews
    add column if not exists red text not null default 'fa-google';

-- Restricción defensiva: sólo las marcas que el front sabe renderizar.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.reviews'::regclass
          and conname = 'reviews_red_check'
    ) then
        alter table public.reviews
            add constraint reviews_red_check
            check (red in (
                'fa-google',    -- Google
                'fa-facebook',  -- Facebook
                'fa-instagram', -- Instagram
                'fa-x-twitter', -- X
                'fa-tiktok',    -- TikTok
                'fa-youtube',   -- YouTube
                'fa-linkedin',  -- LinkedIn
                'fa-whatsapp'   -- WhatsApp
            ));
    end if;
end $$;

comment on column public.reviews.red is
    'Red de origen del testimonio: clase de Font Awesome Brands (fa-google, fa-facebook, fa-instagram, fa-x-twitter, fa-tiktok, fa-youtube, fa-linkedin, fa-whatsapp).';
