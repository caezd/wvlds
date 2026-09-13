-- ============================================================
-- Migration 171 — Les colonnes texte qui restaient sans borne
-- ============================================================
-- La migration 126 a borné les contenus rédigés (noms, descriptions). Restaient
-- les colonnes « techniques » : les couleurs, les URL d'images, les noms
-- d'icônes, les slugs, un emoji de réaction, le brouillon d'une page de wiki.
-- Chacune est écrite par le client, sous RLS — qui dit QUI, jamais QUOI — et
-- aucune n'avait de limite. Relevé sur la base, ce qu'un membre peut faire :
--
--   update world_map_regions set label = repeat('X', 10000000)   → ACCEPTÉ
--   insert into chat_message_reactions (emoji) values (repeat…)   → ACCEPTÉ
--   update worlds set icon_url = 'javascript:alert(1)'            → ACCEPTÉ
--
-- Trois familles de contraintes, et ce qu'elles protègent :
--
-- 1. LONGUEUR — le déni de service par le stockage, comme en 126. Les bornes
--    restent larges (200 pour un libellé, 5 000 pour une description, 2 000
--    pour une URL, 200 000 pour un brouillon : la même que la page publiée).
--
-- 2. URL EN http(s) — toute URL enregistrée finit dans un `src` ou un `href`.
--    Les vues actuelles filtrent (`isSafeUrl`, `sanitizeBannerUrl`), mais
--    chaque nouvel écran doit y penser. Ici, c'est réglé une fois : une
--    `javascript:` ou `data:` n'entre pas. Vérifié avant application : les
--    quinze colonnes d'URL ne contiennent que du `https://`.
--
-- 3. FORMAT DES COULEURS — une couleur finit dans un `style={{ color }}`, que
--    React passe par le CSSOM ; une valeur mal formée y est simplement ignorée,
--    sans risque d'exécution. Mais une colonne « couleur » qui accepte
--    n'importe quoi est un champ libre de plus, et `#rrggbb` est le seul
--    format que les sélecteurs écrivent. Relevé : les 150 valeurs existantes
--    sont toutes en `#rrggbb` ; `world_map_pins.color` admet aussi
--    `transparent`, que le dialogue de style de l'épingle écrit pour « sans
--    fond ».
--
-- Deux fonctions IMMUTABLE portent ces formats, pour que chaque contrainte
-- se lise d'un mot et que le format ne diverge pas d'une table à l'autre.
--
-- Le code miroir : lib/inputSchemas.ts reprend les mêmes bornes côté
-- actions serveur, pour que le refus arrive traduit plutôt qu'en message
-- Postgres.

CREATE OR REPLACE FUNCTION public.is_http_url(url TEXT)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT url IS NULL OR (char_length(url) <= 2000 AND url ~* '^https?://[^[:space:]]+$');
$$;

CREATE OR REPLACE FUNCTION public.is_hex_color(color TEXT)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT color IS NULL OR color ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$';
$$;

-- ── URL d'images ─────────────────────────────────────────────
-- Toutes `NULL`ables : `is_http_url(NULL)` est vrai.

ALTER TABLE public.chatroom_categories ADD CONSTRAINT chatroom_categories_banner_url_http CHECK (is_http_url(banner_url));
ALTER TABLE public.chatroom_categories ADD CONSTRAINT chatroom_categories_icon_url_http   CHECK (is_http_url(icon_url));
ALTER TABLE public.chatrooms           ADD CONSTRAINT chatrooms_banner_url_http           CHECK (is_http_url(banner_url));
ALTER TABLE public.chatrooms           ADD CONSTRAINT chatrooms_icon_url_http             CHECK (is_http_url(icon_url));
ALTER TABLE public.cosmetic_items      ADD CONSTRAINT cosmetic_items_asset_url_http       CHECK (is_http_url(asset_url));
ALTER TABLE public.cosmetic_items      ADD CONSTRAINT cosmetic_items_preview_url_http     CHECK (is_http_url(preview_url));
ALTER TABLE public.personas            ADD CONSTRAINT personas_avatar_url_http            CHECK (is_http_url(avatar_url));
ALTER TABLE public.personas            ADD CONSTRAINT personas_banner_url_http            CHECK (is_http_url(banner_url));
ALTER TABLE public.profiles            ADD CONSTRAINT profiles_avatar_url_http            CHECK (is_http_url(avatar_url));
ALTER TABLE public.world_map_pins      ADD CONSTRAINT world_map_pins_banner_url_http      CHECK (is_http_url(banner_url));
ALTER TABLE public.world_maps          ADD CONSTRAINT world_maps_image_url_http           CHECK (is_http_url(image_url));
ALTER TABLE public.world_wiki_pages    ADD CONSTRAINT world_wiki_pages_banner_url_http    CHECK (is_http_url(banner_url));
ALTER TABLE public.worlds              ADD CONSTRAINT worlds_banner_url_http              CHECK (is_http_url(banner_url));
ALTER TABLE public.worlds              ADD CONSTRAINT worlds_icon_url_http                CHECK (is_http_url(icon_url));

-- ── Couleurs ─────────────────────────────────────────────────

ALTER TABLE public.personas             ADD CONSTRAINT personas_dialogue_color_hex          CHECK (is_hex_color(dialogue_color));
ALTER TABLE public.world_map_pins       ADD CONSTRAINT world_map_pins_color_hex             CHECK (color = 'transparent' OR is_hex_color(color));
ALTER TABLE public.world_map_pins       ADD CONSTRAINT world_map_pins_icon_color_hex        CHECK (is_hex_color(icon_color));
ALTER TABLE public.world_map_pins       ADD CONSTRAINT world_map_pins_border_color_hex      CHECK (is_hex_color(border_color));
ALTER TABLE public.world_map_regions    ADD CONSTRAINT world_map_regions_color_hex          CHECK (is_hex_color(color));
ALTER TABLE public.world_persona_groups ADD CONSTRAINT world_persona_groups_color_hex       CHECK (is_hex_color(color));
ALTER TABLE public.world_relation_types ADD CONSTRAINT world_relation_types_color_hex       CHECK (is_hex_color(color));
ALTER TABLE public.worlds               ADD CONSTRAINT worlds_color_hex                     CHECK (is_hex_color(color));
ALTER TABLE public.worlds               ADD CONSTRAINT worlds_home_body_color_hex           CHECK (is_hex_color(home_body_color));
ALTER TABLE public.worlds               ADD CONSTRAINT worlds_home_panel_color_hex          CHECK (is_hex_color(home_panel_color));

-- ── Valeurs énumérées ────────────────────────────────────────
-- Les listes sont celles des types TypeScript (types/worlds.ts,
-- worldHomeGrid.ts, PinVisualDialog.tsx).

ALTER TABLE public.world_map_pins ADD CONSTRAINT world_map_pins_border_style_enum
  CHECK (border_style IN ('solid', 'dashed', 'dotted'));
ALTER TABLE public.worlds ADD CONSTRAINT worlds_announcement_size_enum
  CHECK (announcement_size IS NULL OR announcement_size IN ('sm', 'md', 'lg'));
ALTER TABLE public.worlds ADD CONSTRAINT worlds_home_grid_gap_enum
  CHECK (home_grid_gap IS NULL OR home_grid_gap IN ('compact', 'comfortable', 'spacious'));

-- ── Longueurs ────────────────────────────────────────────────
-- `world_relation_types.dash` est un `stroke-dasharray` SVG : des nombres et
-- des espaces, rien d'autre. `persona_relations.type` porte l'identifiant du
-- type de relation, en texte.

ALTER TABLE public.chat_choice_votes      ADD CONSTRAINT chat_choice_votes_option_id_len      CHECK (char_length(option_id)     <= 64);
ALTER TABLE public.chat_message_reactions ADD CONSTRAINT chat_message_reactions_emoji_len     CHECK (char_length(emoji)         <= 32);
ALTER TABLE public.notifications          ADD CONSTRAINT notifications_actor_name_len         CHECK (char_length(actor_name)    <= 200);
ALTER TABLE public.persona_relations      ADD CONSTRAINT persona_relations_type_len           CHECK (char_length(type)          <= 64);
ALTER TABLE public.world_inventory_items  ADD CONSTRAINT world_inventory_items_icon_len       CHECK (char_length(icon)          <= 100);
ALTER TABLE public.world_lexicon_terms    ADD CONSTRAINT world_lexicon_terms_term_len         CHECK (char_length(term)          <= 200);
ALTER TABLE public.world_map_pins         ADD CONSTRAINT world_map_pins_icon_len              CHECK (char_length(icon)          <= 100);
ALTER TABLE public.world_map_regions      ADD CONSTRAINT world_map_regions_label_len          CHECK (char_length(label)         <= 200);
ALTER TABLE public.world_map_regions      ADD CONSTRAINT world_map_regions_description_len    CHECK (char_length(description)   <= 5000);
ALTER TABLE public.world_relation_types   ADD CONSTRAINT world_relation_types_dash_format     CHECK (dash ~ '^[0-9. ]{0,40}$');
ALTER TABLE public.world_skills           ADD CONSTRAINT world_skills_icon_len                CHECK (char_length(icon)          <= 100);
ALTER TABLE public.world_wiki_pages       ADD CONSTRAINT world_wiki_pages_slug_len            CHECK (char_length(slug)          <= 200);
ALTER TABLE public.world_wiki_pages       ADD CONSTRAINT world_wiki_pages_icon_len            CHECK (char_length(icon)          <= 100);
ALTER TABLE public.world_wiki_pages       ADD CONSTRAINT world_wiki_pages_draft_content_len   CHECK (char_length(draft_content) <= 200000);
ALTER TABLE public.worlds                 ADD CONSTRAINT worlds_slug_len                      CHECK (char_length(slug)          <= 200);
ALTER TABLE public.worlds                 ADD CONSTRAINT worlds_wiki_label_len                CHECK (char_length(wiki_label)    <= 40);
