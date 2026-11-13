import type { AvatarConfigV1 } from "@/components/personas/avatar/PersonaAvatarPicker";
import type { PersonaNarrativeStatus } from "@/types/db";

// ──────────────────────────────────────────────────────────────────────────
// Ce qu'une fiche de persona attend d'être enregistré.
//
// L'éditeur écrivait à chaque sortie de champ : un nom à moitié tapé partait
// en base, et rien ne distinguait un essai d'un choix. Les modifications
// s'accumulent maintenant dans ce brouillon, que le bouton « Enregistrer »
// écrit d'un coup — une seule écriture sur `personas`, et les fichiers
// devenus inutiles effacés dans la foulée.
//
// Les fichiers, eux, partent tout de suite vers le stockage : un envoi ne se
// met pas en attente dans la mémoire du navigateur sans risquer de le perdre.
// Le brouillon retient donc leur chemin pour les effacer si l'on abandonne.
// ──────────────────────────────────────────────────────────────────────────

/** Les colonnes de `personas` que l'éditeur écrit. */
export type PersonaPatch = {
  name?: string;
  faceclaim?: string | null;
  avatar_url?: string | null;
  avatar_config?: AvatarConfigV1 | null;
  banner_url?: string | null;
  avatar_frame_id?: string | null;
  narrative_status?: PersonaNarrativeStatus;
};

export type PersonaDraft = {
  patch: PersonaPatch;
  /** Fichiers envoyés pendant la séance : à effacer si l'on abandonne. */
  uploaded: string[];
  /** Fichiers que l'enregistrement rendra inutiles : à effacer une fois écrit. */
  orphans: string[];
};

export const EMPTY_DRAFT: PersonaDraft = { patch: {}, uploaded: [], orphans: [] };

/** Le brouillon porte-t-il quelque chose à enregistrer ? */
export function isDirty(draft: PersonaDraft): boolean {
  return Object.keys(draft.patch).length > 0;
}

/** Le chemin d'un fichier du bucket `personas`, tiré de son URL publique. */
export function storagePathOf(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.match(/\/object\/public\/personas\/([^?]+)/)?.[1] ?? null;
}

/**
 * Applique une modification.
 *
 * Revenir à la valeur d'origine retire l'entrée du brouillon : la fiche
 * redevient propre, et le bouton « Enregistrer » disparaît de lui-même.
 */
export function applyPatch(draft: PersonaDraft, patch: PersonaPatch, initial: PersonaPatch): PersonaDraft {
  const next = { ...draft.patch, ...patch };
  for (const cle of Object.keys(patch) as (keyof PersonaPatch)[]) {
    if (identiques(next[cle], initial[cle])) delete next[cle];
  }
  return { ...draft, patch: next };
}

/** Deux valeurs de colonne, à `null` et `undefined` près (une fiche vide). */
function identiques(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/** Note un fichier fraîchement envoyé (effacé si l'on abandonne). */
export function noteUpload(draft: PersonaDraft, url: string | null): PersonaDraft {
  const path = storagePathOf(url);
  if (!path || draft.uploaded.includes(path)) return draft;
  return { ...draft, uploaded: [...draft.uploaded, path] };
}

/** Note un fichier que l'enregistrement laissera sans référence. */
export function noteOrphan(draft: PersonaDraft, url: string | null): PersonaDraft {
  const path = storagePathOf(url);
  // Un fichier envoyé puis retiré pendant la séance est déjà suivi ailleurs.
  if (!path || draft.orphans.includes(path)) return draft;
  return { ...draft, orphans: [...draft.orphans, path] };
}
