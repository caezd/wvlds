import type { PersonaNarrativeStatus } from "@/types/db";

// Formes de données du canevas de relations, telles que lues en base.
// Préfixées `C` pour « canvas » : ce sont des projections partielles des tables,
// pas les entités complètes de `@/types`.

export type CRelType = { id: string; name: string; color: string; dash: string; sort_index: number; mutual: boolean; marital_status: string | null };
export type CPersona = { id: string; name: string; avatar_url: string | null; user_id: string; narrative_status: PersonaNarrativeStatus };
export type CMember = { user_id: string; username: string | null; avatar_url: string | null };
/**
 * Un groupe de personas résolu dans l'arbre (migration 232) : `name` est son
 * chemin (« Parent › Enfant »), `color` sa pastille (propre ou héritée),
 * `tint` la couleur que montrent ses personas s'il l'applique, `sort_index`
 * son rang dans l'ordre de l'arbre.
 */
export type CGroup = { id: string; name: string; color: string | null; sort_index: number; parent_id: string | null; tint?: string };
export type CRelation = { id: string; from_persona_id: string; to_persona_id: string; type: string; label: string | null; description: string | null; status: "pending" | "accepted" };
