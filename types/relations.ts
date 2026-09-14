// Les relations entre personas d'un monde, et leurs types.
// Voir la migration 173 pour la règle : un type `mutual` engage les deux
// personas, la relation attend l'accord du joueur d'en face (`pending`) puis
// existe dans les deux sens ; un type à sens unique est immédiat et n'engage
// que le persona qui l'écrit.

export type PersonaRelationStatus = "pending" | "accepted";

/** Statut marital écrit sur les deux fiches quand un type marital est accepté. */
export type RelationMaritalStatus = "in_relationship" | "married";

export interface WorldRelationType {
  id: string;
  world_id: string;
  name: string;
  color: string;
  /** Motif de pointillé SVG (`stroke-dasharray`), vide pour un trait plein. */
  dash: string;
  sort_index: number;
  mutual: boolean;
  marital_status: RelationMaritalStatus | null;
}

export interface PersonaRelation {
  id: string;
  world_id: string;
  from_persona_id: string;
  to_persona_id: string;
  /** Identifiant d'un `WorldRelationType`, en texte. */
  type: string;
  label: string | null;
  description: string | null;
  status: PersonaRelationStatus;
  created_by: string | null;
  created_at: string;
}
