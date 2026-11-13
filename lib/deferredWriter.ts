import { tempId } from "@/lib/personaSectionsDiff";

// ──────────────────────────────────────────────────────────────────────────
// Un client qui fait semblant d'écrire.
//
// Les éditeurs de sections et de champs mettent leur état local à jour puis
// écrivent, partout de la même façon. Pour que la fiche n'enregistre plus
// qu'à la demande, on ne récrit pas ces vingt appels : on leur donne ce
// client-ci, qui accepte tout sans rien envoyer. L'arbre en mémoire reste la
// vérité de la séance, et `diffSections` en tire les écritures au moment du
// clic sur « Enregistrer ».
//
// Une insertion rend quand même une ligne, avec un identifiant provisoire :
// l'appelant s'en sert comme clé React et pour ses modifications suivantes,
// et `applySectionOps` le remplacera par le vrai.
// ──────────────────────────────────────────────────────────────────────────

type Reponse = { data: unknown; error: null };

export function deferredWriter() {
  const ok: Reponse = { data: null, error: null };
  return {
    from: (_table: string) => ({
      insert: (row: Record<string, unknown>) => {
        const ligne = { position: 0, ...row, id: tempId() };
        const rendu = { data: ligne, error: null };
        return {
          select: () => ({
            single: async () => rendu,
            maybeSingle: async () => rendu,
          }),
          then: (resolve: (r: Reponse) => void) => resolve(rendu),
        };
      },
      update: () => ({
        eq: async () => ok,
        in: async () => ok,
      }),
      delete: () => ({
        eq: async () => ok,
        in: async () => ok,
      }),
      select: () => ({
        eq: () => ({
          single: async () => ok,
          maybeSingle: async () => ok,
        }),
      }),
    }),
  };
}
