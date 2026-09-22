-- ============================================================================
-- LEMORA — Migración 0011: Redes sociales del header (9 canales).
--
-- El header de la tienda (barra `.redes`) muestra solo las redes con URL.
-- Se amplían las 3 columnas existentes (social_facebook / social_instagram /
-- social_tiktok) con el resto de las redes más utilizadas:
--   Instagram, Facebook, TikTok, YouTube, X, Pinterest, LinkedIn, WhatsApp, Otra.
--
-- Columnas text con default '' (vacío = la red no se muestra en el header).
--
-- Idempotente: se puede reaplicar en SQL Editor sin error.
-- ============================================================================

alter table public.settings
    add column if not exists social_youtube   text not null default '',
    add column if not exists social_x         text not null default '',
    add column if not exists social_pinterest text not null default '',
    add column if not exists social_linkedin  text not null default '',
    add column if not exists social_whatsapp  text not null default '',
    add column if not exists social_otra      text not null default '';