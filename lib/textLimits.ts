/**
 * Bornes de longueur appliquées **en base** sur les contenus utilisateur.
 *
 * La RLS dit qui peut écrire, jamais quoi : sans ces contraintes, un appel
 * direct à l'API PostgREST accepte n'importe quelle taille (vérifié avant la
 * migration 126 : 5 000 000 caractères stockés dans `worlds.description`). Les
 * `maxLength` des formulaires ne protègent de rien, un formulaire se contourne.
 *
 * Ces valeurs sont volontairement LARGES — très au-dessus de toute saisie
 * légitime. Ce sont des filets contre l'abus, pas la validation de saisie :
 * les limites que voit l'utilisateur (24 à 500 caractères selon les champs)
 * restent celles de l'interface, et doivent rester bien en dessous.
 *
 * Ce fichier n'est pas la source de vérité — les migrations le sont. Il rend
 * les bornes lisibles depuis le code, et `lib/__tests__/textLimits.test.ts`
 * refuse toute divergence entre les deux.
 */
export const DB_TEXT_LIMITS = {
  "challenges.description": 5_000,
  "challenges.title": 200,
  "chat_messages.content": 200_000,
  "chat_pins.label": 200,
  "chatroom_categories.description": 5_000,
  "chatroom_categories.title": 200,
  "chatrooms.name": 200,
  "chatrooms.title": 200,
  "cosmetic_items.name": 200,
  "dm_messages.content": 4_000,
  "feature_flags.description": 5_000,
  "feature_flags.label": 200,
  "notifications.content": 200,
  "persona_relations.description": 5_000,
  "persona_relations.label": 200,
  "persona_section_fields.label": 200,
  "persona_sections.name": 200,
  "personas.bio": 5_000,
  "personas.faceclaim": 200,
  "personas.name": 40,
  "profiles.bio": 500,
  "profiles.username": 40,
  "world_catalog_categories.name": 200,
  "world_inventory_items.description": 5_000,
  "world_inventory_items.name": 200,
  "world_lexicon_terms.description": 5_000,
  "world_map_pins.description": 5_000,
  "world_map_pins.title": 200,
  "world_maps.label": 200,
  "world_persona_groups.name": 200,
  "world_relation_types.name": 200,
  "world_skills.description": 5_000,
  "world_skills.name": 200,
  "world_wiki_page_versions.content": 200_000,
  "world_wiki_page_versions.title": 200,
  "world_wiki_pages.content": 200_000,
  "world_wiki_pages.title": 200,
  "worlds.announcement_html": 20_000,
  "worlds.description": 5_000,
  "worlds.name": 200,
} as const;

export type BoundedColumn = keyof typeof DB_TEXT_LIMITS;

/** Borne applicable à une colonne, ou `null` si elle n'en a pas. */
export function dbTextLimit(column: string): number | null {
  return (DB_TEXT_LIMITS as Record<string, number>)[column] ?? null;
}
