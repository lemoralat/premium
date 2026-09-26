-- ===========================================================================
-- 0033_iconos_tabler.sql — Migra los iconos de Font Awesome a Tabler Icons.
--
-- Contexto: el sitio usaba Font Awesome (webfont de cdnjs, 258 KB entre CSS y
-- fuente, con dos round-trips encadenados y sin preconnect). Se reemplazó por
-- Tabler Icons servido desde assets/tabler/ (subconjunto propio de 40 KB).
-- El código —HTML, JS, CSS y el catálogo del panel— ya usa clases `ti`.
--
-- Estas migraciones anteriores YA ESTÁN APLICADAS en producción, así que sus
-- valores quedaron guardados en la base con clases de FA. Esta migración los
-- convierte. No se tocan 0012/0014/0021/0029 a propósito: quedan como registro
-- histórico de lo que se aplicó, y como funcionan en una instalación nueva
-- (0033 corre después y normaliza lo que ellas escriben).
--
-- Qué convierte, en tres columnas:
--   public.iconos_pie.icono             'fa-solid fa-truck'  → 'ti ti-truck'
--   public.preguntas_frecuentes.icono   'fa-solid fa-truck'  → 'ti ti-truck'
--   public.resenas.red                  'fa-google'          → 'ti-brand-google'
--
-- Las equivalencias están en scripts/tabler-mapping.mjs, la misma fuente de
-- verdad que usa el codemod del código. Acá se replican en SQL para que la
-- migración sea autocontenida y auditable.
--
-- Es idempotente: sólo toca valores que empiezan con 'fa', así que correrla
-- dos veces no cambia nada.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helper: convierte una clase de Font Awesome a su equivalente de Tabler.
--
-- Recibe la clase tal como está guardada ('fa-solid fa-truck', o el prefijo
-- solo en el caso de resenas.red) y devuelve la clase de Tabler, o el mismo
-- valor si no reconoce el ícono.
--
-- Se instala en el esquema public con nombre propio para poder invocarla como
-- public.fa_a_tabler(...) en las expresiones de abajo. Se deja DROP al final
-- del bloque: es una función de migración, no algo de la aplicación.
-- ---------------------------------------------------------------------------
create or replace function public.fa_a_tabler(clase text)
returns text
language sql
immutable
as $$
  select case
    -- El prefijo de familia no existe en Tabler: se descarta.
    when clase is null or clase !~ '^fa-' then clase

    -- --- Marcas y redes ---------------------------------------------------
    when clase ~ '(^|\s)fa-facebook(-f)?$'            then 'ti-brand-facebook'
    when clase ~ '(^|\s)fa-instagram$'                 then 'ti-brand-instagram'
    when clase ~ '(^|\s)fa-x-twitter$'                 then 'ti-brand-x'
    when clase ~ '(^|\s)fa-tiktok$'                    then 'ti-brand-tiktok'
    when clase ~ '(^|\s)fa-youtube$'                   then 'ti-brand-youtube'
    when clase ~ '(^|\s)fa-linkedin(-in)?$'            then 'ti-brand-linkedin'
    when clase ~ '(^|\s)fa-google(-pay)?$'             then 'ti-brand-google'
    when clase ~ '(^|\s)fa-whatsapp$'                  then 'ti-brand-whatsapp'
    when clase ~ '(^|\s)fa-pinterest(-p)?$'            then 'ti-brand-pinterest'
    when clase ~ '(^|\s)fa-snapchat$'                  then 'ti-brand-snapchat'
    when clase ~ '(^|\s)fa-telegram$'                  then 'ti-brand-telegram'

    -- --- Marcas de pago (Tabler no tiene amex / apple-pay) ---------------
    when clase ~ '(^|\s)fa-cc-visa$'                  then 'ti-brand-visa'
    when clase ~ '(^|\s)fa-cc-mastercard$'            then 'ti-brand-mastercard'
    when clase ~ '(^|\s)fa-(cc-)?paypal$'              then 'ti-brand-paypal'
    when clase ~ '(^|\s)fa-cc-amex$'                  then 'ti-credit-card'
    when clase ~ '(^|\s)fa-apple-pay$'                then 'ti-brand-apple'
    when clase ~ '(^|\s)fa-btc$'                      then 'ti-currency-bitcoin'

    -- --- Navegación y acciones -------------------------------------------
    when clase ~ '(^|\s)fa-chevron-down$'              then 'ti-chevron-down'
    when clase ~ '(^|\s)fa-chevron-up$'                then 'ti-chevron-up'
    when clase ~ '(^|\s)fa-chevron-left$'              then 'ti-chevron-left'
    when clase ~ '(^|\s)fa-chevron-right$'             then 'ti-chevron-right'
    when clase ~ '(^|\s)fa-plus$'                      then 'ti-plus'
    when clase ~ '(^|\s)fa-minus$'                     then 'ti-minus'
    when clase ~ '(^|\s)fa-check$'                     then 'ti-check'
    when clase ~ '(^|\s)fa-check-double$'              then 'ti-checks'
    when clase ~ '(^|\s)fa-check-to-slot$'             then 'ti-checkbox'
    when clase ~ '(^|\s)fa-square-check$'              then 'ti-checkbox'
    when clase ~ '(^|\s)fa-xmark$'                     then 'ti-x'
    when clase ~ '(^|\s)fa-bars$'                      then 'ti-menu-2'
    when clase ~ '(^|\s)fa-list$'                      then 'ti-list'
    when clase ~ '(^|\s)fa-list-check$'                then 'ti-list-check'
    when clase ~ '(^|\s)fa-circle-check$'              then 'ti-circle-check'
    when clase ~ '(^|\s)fa-circle-info$'               then 'ti-info-circle'
    when clase ~ '(^|\s)fa-circle-question$'           then 'ti-help-circle'
    when clase ~ '(^|\s)fa-circle-exclamation$'        then 'ti-alert-circle'
    when clase ~ '(^|\s)fa-arrow-right$'               then 'ti-arrow-right'
    when clase ~ '(^|\s)fa-arrow-trend-up$'            then 'ti-trending-up'
    when clase ~ '(^|\s)fa-arrow-up-right-from-square$' then 'ti-external-link'
    when clase ~ '(^|\s)fa-right-from-bracket$'        then 'ti-logout'
    when clase ~ '(^|\s)fa-copy$'                      then 'ti-copy'
    when clase ~ '(^|\s)fa-print$'                     then 'ti-printer'
    when clase ~ '(^|\s)fa-share-nodes$'               then 'ti-share'
    when clase ~ '(^|\s)fa-link$'                      then 'ti-link'
    when clase ~ '(^|\s)fa-paper-plane$'               then 'ti-send'
    when clase ~ '(^|\s)fa-spinner$'                   then 'ti-loader-2'
    when clase ~ '(^|\s)fa-arrows-rotate$'             then 'ti-refresh'
    when clase ~ '(^|\s)fa-recycle$'                   then 'ti-recycle'
    when clase ~ '(^|\s)fa-rotate$'                    then 'ti-rotate'
    when clase ~ '(^|\s)fa-rotate-left$'               then 'ti-arrow-back-up'
    when clase ~ '(^|\s)fa-stopwatch$'                 then 'ti-stopwatch'
    when clase ~ '(^|\s)fa-clock$'                     then 'ti-clock'
    when clase ~ '(^|\s)fa-calendar-check$'            then 'ti-calendar-check'
    when clase ~ '(^|\s)fa-bell$'                      then 'ti-bell'
    when clase ~ '(^|\s)fa-infinity$'                  then 'ti-infinity'
    when clase ~ '(^|\s)fa-bullseye$'                  then 'ti-target'
    when clase ~ '(^|\s)fa-magnifying-glass$'          then 'ti-search'
    when clase ~ '(^|\s)fa-magnifying-glass-plus$'     then 'ti-zoom-in'

    -- --- Commerce ---------------------------------------------------------
    when clase ~ '(^|\s)fa-cart-shopping$'             then 'ti-shopping-cart'
    when clase ~ '(^|\s)fa-bag-shopping$'              then 'ti-shopping-bag'
    when clase ~ '(^|\s)fa-basket-shopping$'           then 'ti-basket'
    when clase ~ '(^|\s)fa-cart-plus$'                 then 'ti-shopping-cart-plus'
    when clase ~ '(^|\s)fa-cart-flatbed$'              then 'ti-trolley'
    when clase ~ '(^|\s)fa-cash-register$'             then 'ti-cash-register'
    when clase ~ '(^|\s)fa-credit-card$'               then 'ti-credit-card'
    when clase ~ '(^|\s)fa-money-bill-1$'              then 'ti-currency-dollar'
    when clase ~ '(^|\s)fa-money-bill-transfer$'       then 'ti-currency-dollar'
    when clase ~ '(^|\s)fa-money-bill-wave$'           then 'ti-currency-dollar'
    when clase ~ '(^|\s)fa-hand-holding-dollar$'       then 'ti-cash'
    when clase ~ '(^|\s)fa-sack-dollar$'               then 'ti-cash'
    when clase ~ '(^|\s)fa-coins$'                     then 'ti-coins'
    when clase ~ '(^|\s)fa-piggy-bank$'                then 'ti-pig-money'
    when clase ~ '(^|\s)fa-wallet$'                    then 'ti-wallet'
    when clase ~ '(^|\s)fa-receipt$'                   then 'ti-receipt'
    when clase ~ '(^|\s)fa-percent$'                   then 'ti-percentage'
    when clase ~ '(^|\s)fa-tag$'                       then 'ti-tag'
    when clase ~ '(^|\s)fa-tags$'                      then 'ti-tags'
    when clase ~ '(^|\s)fa-ticket$'                    then 'ti-ticket'
    when clase ~ '(^|\s)fa-gifts?$'                    then 'ti-gift'
    when clase ~ '(^|\s)fa-store$'                     then 'ti-building-store'
    when clase ~ '(^|\s)fa-shop$'                      then 'ti-building'
    when clase ~ '(^|\s)fa-warehouse$'                 then 'ti-building-warehouse'
    when clase ~ '(^|\s)fa-box$'                       then 'ti-box'
    when clase ~ '(^|\s)fa-box-open$'                  then 'ti-package'
    when clase ~ '(^|\s)fa-box-archive$'               then 'ti-archive'
    when clase ~ '(^|\s)fa-boxes-stacked$'             then 'ti-packages'
    when clase ~ '(^|\s)fa-cube$'                      then 'ti-cube'
    when clase ~ '(^|\s)fa-barcode$'                   then 'ti-barcode'
    when clase ~ '(^|\s)fa-qrcode$'                    then 'ti-qrcode'

    -- --- Envíos y transporte ---------------------------------------------
    when clase ~ '(^|\s)fa-truck$'                     then 'ti-truck'
    when clase ~ '(^|\s)fa-truck-fast$'                then 'ti-truck'
    when clase ~ '(^|\s)fa-truck-arrow-right$'         then 'ti-truck-delivery'
    when clase ~ '(^|\s)fa-truck-(moving|ramp-box)$'   then 'ti-truck-loading'
    when clase ~ '(^|\s)fa-truck-medical$'             then 'ti-ambulance'
    when clase ~ '(^|\s)fa-van-shuttle$'               then 'ti-caravan'
    when clase ~ '(^|\s)fa-car$'                       then 'ti-car'
    when clase ~ '(^|\s)fa-car-side$'                  then 'ti-car-4wd'
    when clase ~ '(^|\s)fa-bus$'                       then 'ti-bus'
    when clase ~ '(^|\s)fa-train-subway$'              then 'ti-train'
    when clase ~ '(^|\s)fa-motorcycle$'                then 'ti-motorbike'
    when clase ~ '(^|\s)fa-bicycle$'                   then 'ti-bike'
    when clase ~ '(^|\s)fa-plane$'                     then 'ti-plane'
    when clase ~ '(^|\s)fa-plane-arrival$'             then 'ti-plane-arrival'
    when clase ~ '(^|\s)fa-plane-departure$'           then 'ti-plane-departure'
    when clase ~ '(^|\s)fa-ship$'                      then 'ti-ship'
    when clase ~ '(^|\s)fa-route$'                     then 'ti-route'
    when clase ~ '(^|\s)fa-map$'                       then 'ti-map'
    when clase ~ '(^|\s)fa-(map-pin|location-dot)$'    then 'ti-map-pin'
    when clase ~ '(^|\s)fa-globe$'                     then 'ti-world'
    when clase ~ '(^|\s)fa-compass$'                   then 'ti-compass'

    -- --- Usuario y formularios --------------------------------------------
    when clase ~ '(^|\s)fa-users$'                     then 'ti-users'
    when clase ~ '(^|\s)fa-people-group$'              then 'ti-users'
    when clase ~ '(^|\s)fa-hands$'                     then 'ti-users'
    when clase ~ '(^|\s)fa-users-gear$'                then 'ti-users-group'
    when clase ~ '(^|\s)fa-user$'                      then 'ti-user'
    when clase ~ '(^|\s)fa-user-check$'                then 'ti-user-check'
    when clase ~ '(^|\s)fa-user-lock$'                 then 'ti-lock-access'
    when clase ~ '(^|\s)fa-user-shield$'               then 'ti-user-shield'
    when clase ~ '(^|\s)fa-hand$'                      then 'ti-hand-finger'
    when clase ~ '(^|\s)fa-hand-holding$'              then 'ti-hand-stop'
    when clase ~ '(^|\s)fa-hand-holding-heart$'        then 'ti-heart-handshake'
    when clase ~ '(^|\s)fa-handshake$'                 then 'ti-friends'
    when clase ~ '(^|\s)fa-id-card$'                   then 'ti-id'
    when clase ~ '(^|\s)fa-phone(-flip)?$'             then 'ti-phone'
    when clase ~ '(^|\s)fa-envelope$'                  then 'ti-mail'
    when clase ~ '(^|\s)fa-comment$'                   then 'ti-message'
    when clase ~ '(^|\s)fa-message$'                   then 'ti-message'
    when clase ~ '(^|\s)fa-comment-dots$'              then 'ti-message-dots'
    when clase ~ '(^|\s)fa-comments$'                  then 'ti-messages'
    when clase ~ '(^|\s)fa-key$'                       then 'ti-key'
    when clase ~ '(^|\s)fa-lock$'                      then 'ti-lock'
    when clase ~ '(^|\s)fa-lock-open$'                 then 'ti-lock-open'
    when clase ~ '(^|\s)fa-eye$'                      then 'ti-eye'
    when clase ~ '(^|\s)fa-fingerprint$'               then 'ti-fingerprint'
    when clase ~ '(^|\s)fa-pen$'                       then 'ti-edit'
    when clase ~ '(^|\s)fa-floppy-disk$'               then 'ti-device-floppy'
    when clase ~ '(^|\s)fa-folder$'                   then 'ti-folder'
    when clase ~ '(^|\s)fa-folder-open$'               then 'ti-folder-open'
    when clase ~ '(^|\s)fa-file-lines$'                then 'ti-file-text'
    when clase ~ '(^|\s)fa-file-circle-check$'         then 'ti-file-check'
    when clase ~ '(^|\s)fa-file-export$'               then 'ti-file-export'
    when clase ~ '(^|\s)fa-clipboard-check$'           then 'ti-clipboard-check'
    when clase ~ '(^|\s)fa-clipboard-list$'            then 'ti-clipboard-list'

    -- --- Equipos / técnica -----------------------------------------------
    when clase ~ '(^|\s)fa-(computer|desktop|display)$' then 'ti-device-desktop'
    when clase ~ '(^|\s)fa-laptop$'                    then 'ti-device-laptop'
    when clase ~ '(^|\s)fa-tablet$'                    then 'ti-device-tablet'
    when clase ~ '(^|\s)fa-mobile-screen(-button)?$'   then 'ti-device-mobile'
    when clase ~ '(^|\s)fa-headphones$'                then 'ti-headphones'
    when clase ~ '(^|\s)fa-headset$'                   then 'ti-headset'
    when clase ~ '(^|\s)fa-video$'                     then 'ti-video'
    when clase ~ '(^|\s)fa-terminal$'                  then 'ti-terminal'
    when clase ~ '(^|\s)fa-code$'                      then 'ti-code'
    when clase ~ '(^|\s)fa-database$'                  then 'ti-database'
    when clase ~ '(^|\s)fa-network-wired$'             then 'ti-network'
    when clase ~ '(^|\s)fa-wifi$'                      then 'ti-wifi'
    when clase ~ '(^|\s)fa-signal$'                    then 'ti-antenna'
    when clase ~ '(^|\s)fa-plug$'                      then 'ti-plug'
    when clase ~ '(^|\s)fa-battery-full$'              then 'ti-battery-4'
    when clase ~ '(^|\s)fa-camera$'                    then 'ti-camera'
    when clase ~ '(^|\s)fa-cloud-arrow-up$'            then 'ti-cloud-upload'
    when clase ~ '(^|\s)fa-download$'                  then 'ti-download'

    -- --- Navegación del panel --------------------------------------------
    when clase ~ '(^|\s)fa-gauge-high$'                then 'ti-gauge'
    when clase ~ '(^|\s)fa-sitemap$'                   then 'ti-sitemap'
    when clase ~ '(^|\s)fa-sliders$'                   then 'ti-adjustments'
    when clase ~ '(^|\s)fa-gear$'                      then 'ti-settings'
    when clase ~ '(^|\s)fa-screwdriver-wrench$'        then 'ti-tools'
    when clase ~ '(^|\s)fa-wrench$'                    then 'ti-tool'
    when clase ~ '(^|\s)fa-toolbox$'                   then 'ti-hammer'
    when clase ~ '(^|\s)fa-chart-column$'              then 'ti-chart-bar'
    when clase ~ '(^|\s)fa-chart-line$'                then 'ti-chart-line'
    when clase ~ '(^|\s)fa-chart-pie$'                 then 'ti-chart-pie'
    when clase ~ '(^|\s)fa-bolt$'                      then 'ti-bolt'
    when clase ~ '(^|\s)fa-palette$'                   then 'ti-palette'
    when clase ~ '(^|\s)fa-icons$'                     then 'ti-icons'
    when clase ~ '(^|\s)fa-puzzle-piece$'              then 'ti-puzzle'
    when clase ~ '(^|\s)fa-wand-magic-sparkles$'       then 'ti-wand'

    -- --- Estilo y contenido ----------------------------------------------
    when clase ~ '(^|\s)fa-star$'                      then 'ti-star'
    when clase ~ '(^|\s)fa-heart$'                     then 'ti-heart'
    when clase ~ '(^|\s)fa-thumbs-up$'                 then 'ti-thumb-up'
    when clase ~ '(^|\s)fa-award$'                     then 'ti-award'
    when clase ~ '(^|\s)fa-medal$'                     then 'ti-medal'
    when clase ~ '(^|\s)fa-trophy$'                    then 'ti-trophy'
    when clase ~ '(^|\s)fa-gem$'                       then 'ti-diamond'
    when clase ~ '(^|\s)fa-crown$'                     then 'ti-crown'
    when clase ~ '(^|\s)fa-certificate$'               then 'ti-certificate'
    when clase ~ '(^|\s)fa-lightbulb$'                 then 'ti-bulb'
    when clase ~ '(^|\s)fa-bookmark$'                  then 'ti-bookmark'
    when clase ~ '(^|\s)fa-flag$'                      then 'ti-flag'
    when clase ~ '(^|\s)fa-face-smile$'                then 'ti-mood-smile'
    when clase ~ '(^|\s)fa-face-grin-stars$'           then 'ti-mood-smile'
    when clase ~ '(^|\s)fa-heart-pulse$'               then 'ti-heartbeat'
    when clase ~ '(^|\s)fa-heart-circle-check$'        then 'ti-heart-check'
    when clase ~ '(^|\s)fa-leaf$'                      then 'ti-leaf'
    when clase ~ '(^|\s)fa-seedling$'                  then 'ti-seedling'
    when clase ~ '(^|\s)fa-sun$'                       then 'ti-sun'
    when clase ~ '(^|\s)fa-moon$'                      then 'ti-moon'
    when clase ~ '(^|\s)fa-fire$'                      then 'ti-flame'
    when clase ~ '(^|\s)fa-life-ring$'                 then 'ti-lifebuoy'
    when clase ~ '(^|\s)fa-rocket$'                    then 'ti-rocket'
    when clase ~ '(^|\s)fa-shield$'                    then 'ti-shield'
    when clase ~ '(^|\s)fa-shield-halved$'             then 'ti-shield-half'
    when clase ~ '(^|\s)fa-shield-heart$'              then 'ti-shield-heart'
    when clase ~ '(^|\s)fa-shield-virus$'              then 'ti-shield-check'
    when clase ~ '(^|\s)fa-image$'                     then 'ti-photo'
    when clase ~ '(^|\s)fa-images$'                    then 'ti-photo-plus'
    when clase ~ '(^|\s)fa-hospital$'                  then 'ti-hospital'
    when clase ~ '(^|\s)fa-(kit-medical|first-aid)$'   then 'ti-first-aid-kit'
    when clase ~ '(^|\s)fa-cake-candles$'              then 'ti-cake'
    when clase ~ '(^|\s)fa-mug-hot$'                   then 'ti-coffee'
    when clase ~ '(^|\s)fa-utensils$'                  then 'ti-tools-kitchen-2'
    when clase ~ '(^|\s)fa-champagne-glasses$'         then 'ti-glass-cocktail'
    when clase ~ '(^|\s)fa-bottle-water$'              then 'ti-bottle'
    when clase ~ '(^|\s)fa-house$'                     then 'ti-home'
    when clase ~ '(^|\s)fa-bank$'                      then 'ti-building-bank'
    when clase ~ '(^|\s)fa-suitcase$'                  then 'ti-briefcase'
    when clase ~ '(^|\s)fa-trash(-can)?$'              then 'ti-trash'

    else clase
  end;
$$;

comment on function public.fa_a_tabler(text) is
  'Migración 0033: convierte una clase de Font Awesome a su equivalente de Tabler. No usar fuera de esta migración.';

-- ---------------------------------------------------------------------------
-- 1) settings de la sección Iconos del panel
-- ---------------------------------------------------------------------------
update public.iconos_pie
   set icono = public.fa_a_tabler(icono)
 where icono is not null
   and icono like 'fa-%';

-- ---------------------------------------------------------------------------
-- 2) Ícono de cada pregunta frecuente
-- ---------------------------------------------------------------------------
update public.preguntas_frecuentes
   set icono = public.fa_a_tabler(icono)
 where icono is not null
   and icono like 'fa-%';

-- ---------------------------------------------------------------------------
-- 3) Red de origen de cada reseña (guarda una sola clase, sin prefijo)
-- ---------------------------------------------------------------------------
update public.resenas
   set red = public.fa_a_tabler(red)
 where red like 'fa-%';

-- El default de la columna venía de 0029 con una clase de FA: sin esto, los
-- inserts futuros volverían a guardar 'fa-google'.
alter table public.resenas
  alter column red set default 'ti-brand-google';

comment on column public.resenas.red is
  'Red de origen del testimonio: clase de Tabler (ti-brand-google, ti-brand-facebook, ti-brand-instagram, ti-brand-x, ti-brand-tiktok, ti-brand-youtube, ti-brand-linkedin, ti-brand-whatsapp).';

-- ---------------------------------------------------------------------------
-- 4) Comentarios de columna que seguían describiendo el formato de FA
-- ---------------------------------------------------------------------------
comment on column public.iconos_pie.icono is
  'Clase de Tabler (ej. ti ti-truck). NULL = el ícono usa imagen.';

comment on column public.preguntas_frecuentes.icono is
  'Clase de Tabler (ej. ti ti-truck). NULL = sin ícono.';

-- ---------------------------------------------------------------------------
-- 5) La función era sólo para esta migración.
-- ---------------------------------------------------------------------------
drop function public.fa_a_tabler(text);

commit;

-- ===========================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — ¿Quedó alguna clase de Font Awesome sin convertir?
--   Esperado: 0 filas. Si aparecen, es un ícono que no está en el mapeo de
--   esta migración: hay que agregarle una línea y volver a correr el UPDATE
--   correspondiente a mano.
-- ===========================================================================
-- select 'iconos_pie' as tabla, icono, count(*)
--   from public.iconos_pie
--  where icono like 'fa-%'
--  group by icono
-- union all
-- select 'preguntas_frecuentes', icono, count(*)
--   from public.preguntas_frecuentes
--  where icono like 'fa-%'
--  group by icono
-- union all
-- select 'resenas', red, count(*)
--   from public.resenas
--  where red like 'fa-%'
--  group by red;

-- ===========================================================================
-- PASO 2 — Confirmar que sí se guardaron clases de Tabler.
--   Esperado: 3 filas.
-- ===========================================================================
-- select 'iconos_pie' as tabla, icono, count(*) from public.iconos_pie
--  where icono like 'ti %' group by icono
-- union all
-- select 'preguntas_frecuentes', icono, count(*) from public.preguntas_frecuentes
--  where icono like 'ti %' group by icono
-- union all
-- select 'resenas', red, count(*) from public.resenas
--  where red like 'ti-%' group by red;

-- ===========================================================================
-- PASO 3 — El default de resenas.red ya no debe ser de FA.
--   Esperado: 'ti-brand-google'
-- ===========================================================================
-- select column_name, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'resenas' and column_name = 'red';

-- ===========================================================================
-- PASO 4 — La función de migración no debe quedar instalada.
--   Esperado: 0 filas.
-- ===========================================================================
-- select proname from pg_proc
--  where proname = 'fa_a_tabler';

