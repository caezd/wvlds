// Formes de données du canevas de relations, telles que lues en base.
// Préfixées `C` pour « canvas » : ce sont des projections partielles des tables,
// pas les entités complètes de `@/types`.

export type CRelType = { id: string; name: string; color: string; dash: string; sort_index: number };
export type CPersona = { id: string; name: string; avatar_url: string | null; user_id: string };
export type CMember = { user_id: string; username: string | null; avatar_url: string | null };
export type CGroup = { id: string; name: string; color: string; sort_index: number };
export type CRelation = { id: string; from_persona_id: string; to_persona_id: string; type: string; label: string | null; description: string | null };
export type BlockPos = { x: number; y: number };
