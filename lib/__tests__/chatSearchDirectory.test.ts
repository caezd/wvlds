import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listWorldChatroomsForSearch,
  matchesAuthorQuery,
  matchesChatroomQuery,
  normaliserPourRecherche,
  type SearchAuthorOption,
} from "@/lib/chatSearchDirectory";

// ──────────────────────────────────────────────────────────────────────────
// Autocomplétion des filtres `dans:` et `de:` du centre de recherche. Ce module
// n'avait aucun test, et portait deux défauts visibles.
//
// 1. La liste des salons était triée côté base sur `name`, alors qu'elle
//    s'affiche par `title`. Relevé en base : les 34 salons portent le même
//    `name` (« Nouvelle salle », la valeur par défaut) et un `title` distinct.
//    Trier dessus revenait à ne pas trier — la liste sortait dans un ordre
//    arbitraire.
//
// 2. La comparaison se faisait par `toLowerCase()`, qui laisse les accents.
//    Taper « de:elodie » ne trouvait donc pas « Élodie ».
// ──────────────────────────────────────────────────────────────────────────

/** Client Supabase minimal rendant les lignes fournies. */
function clientFactice(lignes: { id: string; title: string | null; name: string | null }[]) {
  return {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: lignes, error: null }) }),
    }),
  } as unknown as SupabaseClient;
}

const persona = (label: string, sublabel: string | null = null): SearchAuthorOption => ({
  kind: "persona",
  id: label,
  label,
  sublabel,
  avatarUrl: null,
});

describe("normaliserPourRecherche", () => {
  it("retire accents et casse", () => {
    expect(normaliserPourRecherche("Élodie")).toBe("elodie");
    expect(normaliserPourRecherche("  FORÊT  ")).toBe("foret");
    expect(normaliserPourRecherche("Ça Ira")).toBe("ca ira");
  });

  it("laisse intact ce qui n'a pas d'accent", () => {
    expect(normaliserPourRecherche("Zoe")).toBe("zoe");
  });
});

describe("listWorldChatroomsForSearch", () => {
  it("trie sur le libellé affiché, pas sur la colonne `name`", () => {
    // Le cas réel : tous les salons partagent le même `name`.
    return listWorldChatroomsForSearch(
      clientFactice([
        { id: "1", title: "Zanzibar", name: "Nouvelle salle" },
        { id: "2", title: "Alpha", name: "Nouvelle salle" },
        { id: "3", title: "Mékong", name: "Nouvelle salle" },
      ]),
      "w1",
      "Salle sans titre",
    ).then((options) => {
      expect(options.map((o) => o.label)).toEqual(["Alpha", "Mékong", "Zanzibar"]);
    });
  });

  it("range les libellés accentués à leur place alphabétique", () => {
    // Une comparaison d'octets mettrait « Élodie » après « Zoé ».
    return listWorldChatroomsForSearch(
      clientFactice([
        { id: "1", title: "Zoé", name: null },
        { id: "2", title: "Élodie", name: null },
        { id: "3", title: "Emma", name: null },
      ]),
      "w1",
      "Salle sans titre",
    ).then((options) => {
      expect(options.map((o) => o.label)).toEqual(["Élodie", "Emma", "Zoé"]);
    });
  });

  it("se rabat sur le libellé fourni quand le salon n'a ni titre ni nom", async () => {
    // Le repli s'affiche à l'écran : il vient de l'appelant, qui a les
    // traductions, et non d'une chaîne codée en dur dans `lib/`.
    const options = await listWorldChatroomsForSearch(
      clientFactice([{ id: "1", title: "   ", name: null }]),
      "w1",
      "Salle sans titre",
    );
    expect(options[0].label).toBe("Salle sans titre");
  });

  it("retombe sur `name` quand seul le titre manque", async () => {
    const options = await listWorldChatroomsForSearch(
      clientFactice([{ id: "1", title: null, name: "Taverne" }]),
      "w1",
      "Salle sans titre",
    );
    expect(options[0].label).toBe("Taverne");
  });
});

describe("matchesAuthorQuery", () => {
  it("trouve un nom accentué depuis une saisie sans accent", () => {
    expect(matchesAuthorQuery(persona("Élodie"), "elodie")).toBe(true);
    expect(matchesAuthorQuery(persona("Gaëtan"), "gaetan")).toBe(true);
    expect(matchesAuthorQuery(persona("Renée"), "rene")).toBe(true);
  });

  it("trouve aussi depuis une saisie accentuée", () => {
    expect(matchesAuthorQuery(persona("Elodie"), "élodie")).toBe(true);
  });

  it("cherche également dans le pseudo du propriétaire", () => {
    expect(matchesAuthorQuery(persona("Aria", "Zoé"), "zoe")).toBe(true);
  });

  it("ne trouve pas ce qui n'est pas là", () => {
    expect(matchesAuthorQuery(persona("Élodie"), "marc")).toBe(false);
  });

  it("accepte tout sur une saisie vide", () => {
    expect(matchesAuthorQuery(persona("Élodie"), "   ")).toBe(true);
  });
});

describe("matchesChatroomQuery", () => {
  it("trouve un salon accentué depuis une saisie sans accent", () => {
    // « dans:foret » doit trouver « La Forêt Noire ».
    expect(matchesChatroomQuery({ id: "1", label: "La Forêt Noire" }, "foret")).toBe(true);
  });

  it("ne trouve pas ce qui n'est pas là", () => {
    expect(matchesChatroomQuery({ id: "1", label: "La Forêt Noire" }, "taverne")).toBe(false);
  });
});
