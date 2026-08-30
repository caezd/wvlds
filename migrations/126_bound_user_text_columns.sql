-- ============================================================
-- Migration 126 — Bornes de longueur sur les contenus utilisateur
-- ============================================================
-- La RLS dit QUI peut écrire, jamais QUOI. Les formulaires portent bien des
-- `maxLength`, mais un attribut HTML ne protège rien : un appel direct à
-- l'API PostgREST ne passe pas par le formulaire.
--
-- Vérifié sur la base de production, sous l'identité du propriétaire d'un
-- monde, puis annulé :
--
--   update worlds set description = repeat('X', 5000000)   → ACCEPTÉ
--   longueur réellement stockée                            → 5 000 000
--
-- Répété, c'est un déni de service par le stockage : la base gonfle, et toute
-- requête qui lit la colonne ralentit pour tous les membres du monde.
--
-- Une protection existait par accident sur `worlds.name` : l'index qui la
-- couvre refuse les entrées trop grosses (« index row requires 11480 bytes »).
-- Elle ne vaut que pour les colonnes indexées, et n'a jamais été voulue.
--
-- ── Choix des bornes ─────────────────────────────────────────
-- Volontairement LARGES, très au-dessus de toute saisie légitime. Ce n'est pas
-- un doublon de la validation de saisie — les `maxLength` de l'interface vont
-- de 24 à 500 caractères et restent la règle pour l'utilisateur. C'est un
-- filet contre l'abus, placé là où on ne peut pas le contourner. Les fixer au
-- plus juste ferait échouer des saisies légitimes le jour où une limite
-- d'interface évolue, sans rien apporter contre l'abus.
--
-- Relevé avant application, sur l'ensemble des colonnes visées : la plus
-- longue valeur existante est un message chiffré de 25 064 caractères, puis
-- une description de monde de 713. Aucune ligne n'est concernée.
--
-- La convention suit celle déjà en place (`personas_name_check`,
-- `profiles_bio_length`) : `CHECK (char_length(col) <= N)`, sans borne basse —
-- une chaîne vide reste un cas légitime pour la plupart de ces champs.

-- ── Noms, titres et étiquettes courts ────────────────────────
ALTER TABLE public.chat_pins                ADD CONSTRAINT chat_pins_label_len                CHECK (char_length(label)       <= 200);
ALTER TABLE public.chatroom_categories      ADD CONSTRAINT chatroom_categories_title_len      CHECK (char_length(title)       <= 200);
ALTER TABLE public.chatrooms                ADD CONSTRAINT chatrooms_name_len                 CHECK (char_length(name)        <= 200);
ALTER TABLE public.chatrooms                ADD CONSTRAINT chatrooms_title_len                CHECK (char_length(title)       <= 200);
ALTER TABLE public.cosmetic_items           ADD CONSTRAINT cosmetic_items_name_len            CHECK (char_length(name)        <= 200);
ALTER TABLE public.persona_relations        ADD CONSTRAINT persona_relations_label_len        CHECK (char_length(label)       <= 200);
ALTER TABLE public.persona_section_fields   ADD CONSTRAINT persona_section_fields_label_len   CHECK (char_length(label)       <= 200);
ALTER TABLE public.persona_sections         ADD CONSTRAINT persona_sections_name_len          CHECK (char_length(name)        <= 200);
ALTER TABLE public.personas                 ADD CONSTRAINT personas_faceclaim_len             CHECK (char_length(faceclaim)   <= 200);
ALTER TABLE public.world_catalog_categories ADD CONSTRAINT world_catalog_categories_name_len  CHECK (char_length(name)        <= 200);
ALTER TABLE public.world_inventory_items    ADD CONSTRAINT world_inventory_items_name_len     CHECK (char_length(name)        <= 200);
ALTER TABLE public.world_map_pins           ADD CONSTRAINT world_map_pins_title_len           CHECK (char_length(title)       <= 200);
ALTER TABLE public.world_maps               ADD CONSTRAINT world_maps_label_len               CHECK (char_length(label)       <= 200);
ALTER TABLE public.world_persona_groups     ADD CONSTRAINT world_persona_groups_name_len      CHECK (char_length(name)        <= 200);
ALTER TABLE public.world_relation_types     ADD CONSTRAINT world_relation_types_name_len      CHECK (char_length(name)        <= 200);
ALTER TABLE public.world_skills             ADD CONSTRAINT world_skills_name_len              CHECK (char_length(name)        <= 200);
ALTER TABLE public.world_wiki_pages         ADD CONSTRAINT world_wiki_pages_title_len         CHECK (char_length(title)       <= 200);
ALTER TABLE public.worlds                   ADD CONSTRAINT worlds_name_len                    CHECK (char_length(name)        <= 200);

-- `notifications.content` porte un nom de monde ou de salon, recopié par les
-- déclencheurs : la borne suit celle de sa source.
ALTER TABLE public.notifications            ADD CONSTRAINT notifications_content_len          CHECK (char_length(content)     <= 200);

-- Pseudo : l'interface impose 32, on garde une marge sans plus.
ALTER TABLE public.profiles                 ADD CONSTRAINT profiles_username_len              CHECK (char_length(username)    <= 40);

-- ── Descriptions et textes moyens ────────────────────────────
ALTER TABLE public.chatroom_categories      ADD CONSTRAINT chatroom_categories_desc_len       CHECK (char_length(description) <= 5000);
ALTER TABLE public.persona_relations        ADD CONSTRAINT persona_relations_desc_len         CHECK (char_length(description) <= 5000);
ALTER TABLE public.world_inventory_items    ADD CONSTRAINT world_inventory_items_desc_len     CHECK (char_length(description) <= 5000);
ALTER TABLE public.world_lexicon_terms      ADD CONSTRAINT world_lexicon_terms_desc_len       CHECK (char_length(description) <= 5000);
ALTER TABLE public.world_map_pins           ADD CONSTRAINT world_map_pins_desc_len            CHECK (char_length(description) <= 5000);
ALTER TABLE public.world_skills             ADD CONSTRAINT world_skills_desc_len              CHECK (char_length(description) <= 5000);
ALTER TABLE public.worlds                   ADD CONSTRAINT worlds_description_len             CHECK (char_length(description) <= 5000);
-- `personas.bio` avait été oubliée au premier jet : champ libre, rempli par
-- le joueur et affiché sur la fiche. Alignée sur `profiles.bio`, qui porte la
-- même contrainte depuis la migration 051 — en plus large, une biographie de
-- personnage étant plus fournie qu'une bio de compte.
ALTER TABLE public.personas                 ADD CONSTRAINT personas_bio_len                   CHECK (char_length(bio)         <= 5000);

-- ── Contenus longs ───────────────────────────────────────────
-- Annonce d'accueil : aligné sur MAX_HOME_BLOCK_CONTENT_LENGTH (20 000),
-- la limite que l'éditeur applique déjà côté interface.
ALTER TABLE public.worlds                   ADD CONSTRAINT worlds_announcement_len            CHECK (char_length(announcement_html) <= 20000);

-- Pages de wiki : un article peut être long, la borne est haute.
ALTER TABLE public.world_wiki_pages         ADD CONSTRAINT world_wiki_pages_content_len       CHECK (char_length(content) <= 200000);
ALTER TABLE public.world_wiki_page_versions ADD CONSTRAINT world_wiki_page_versions_content_len CHECK (char_length(content) <= 200000);
ALTER TABLE public.world_wiki_page_versions ADD CONSTRAINT world_wiki_page_versions_title_len   CHECK (char_length(title)   <= 200);

-- Messages : la colonne stocke du CHIFFRÉ (AES-GCM encodé en base64), pas le
-- texte saisi. Le rapport est d'environ 1,4 : 200 000 caractères de chiffré
-- correspondent à quelque 140 000 caractères écrits, très au-delà du plus long
-- message envisageable. Le plus long existant en fait 25 064.
-- La contrainte existante (`chat_messages_content_check`, non vide) est
-- conservée telle quelle ; celle-ci s'y ajoute.
ALTER TABLE public.chat_messages            ADD CONSTRAINT chat_messages_content_len          CHECK (char_length(content) <= 200000);

-- ── Défis et drapeaux (réservés à l'administration) ──────────
-- Écrits par l'équipe ou par la fonction edge, pas par les joueurs : la borne
-- relève de l'hygiène, pas de la défense.
ALTER TABLE public.challenges               ADD CONSTRAINT challenges_title_len               CHECK (char_length(title)       <= 200);
ALTER TABLE public.challenges               ADD CONSTRAINT challenges_description_len         CHECK (char_length(description) <= 5000);
ALTER TABLE public.feature_flags            ADD CONSTRAINT feature_flags_label_len            CHECK (char_length(label)       <= 200);
ALTER TABLE public.feature_flags            ADD CONSTRAINT feature_flags_description_len      CHECK (char_length(description) <= 5000);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Sous l'identité du propriétaire d'un monde, la démesure doit être refusée :
--   UPDATE worlds SET description = repeat('X', 5000000) WHERE id = '<id>';
--   → new row for relation "worlds" violates check constraint
-- Et une valeur normale doit toujours passer.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Chaque contrainte se retire indépendamment :
--   ALTER TABLE public.<table> DROP CONSTRAINT <nom>;
