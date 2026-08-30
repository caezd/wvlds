import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getChatroomKeys, __clearChatroomKeyCache } from "@/lib/chatroomKeys";

// ──────────────────────────────────────────────────────────────────────────
// Cache des clés de chiffrement des salons, utilisé par le centre de recherche
// pour déchiffrer des messages venus de plusieurs salons à la fois.
//
// Il n'avait aucun test alors qu'il manipule des secrets. Deux propriétés
// comptent : ne consulter la base que pour ce qu'il ignore, et ne jamais
// tourner côté serveur — il est indexé par identifiant de salon, qui n'est pas
// un secret, et un cache partagé entre requêtes rendrait la clé d'une personne
// à une autre sans repasser par la RLS.
// ──────────────────────────────────────────────────────────────────────────

/** Client Supabase minimal : enregistre les identifiants réellement demandés. */
function clientFactice(lignes: Record<string, string>) {
  const demandes: string[][] = [];
  const client = {
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          demandes.push([...ids]);
          return Promise.resolve({
            data: ids
              .filter((id) => id in lignes)
              .map((id) => ({ chatroom_id: id, key_b64: lignes[id] })),
            error: null,
          });
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, demandes };
}

beforeEach(() => {
  __clearChatroomKeyCache();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getChatroomKeys", () => {
  it("rend les clés des salons demandés", async () => {
    const { client } = clientFactice({ a: "CLE_A", b: "CLE_B" });
    const cles = await getChatroomKeys(client, ["a", "b"]);
    expect(cles.get("a")).toBe("CLE_A");
    expect(cles.get("b")).toBe("CLE_B");
  });

  it("ne redemande pas une clé déjà connue", async () => {
    const { client, demandes } = clientFactice({ a: "CLE_A", b: "CLE_B" });

    await getChatroomKeys(client, ["a"]);
    await getChatroomKeys(client, ["a", "b"]);

    // Le second appel ne demande que « b » : c'est tout l'intérêt du cache,
    // le scan progressif de la recherche appelle cette fonction à chaque page.
    expect(demandes).toEqual([["a"], ["b"]]);
  });

  it("n'interroge pas du tout la base quand tout est déjà connu", async () => {
    const { client, demandes } = clientFactice({ a: "CLE_A" });
    await getChatroomKeys(client, ["a"]);
    await getChatroomKeys(client, ["a"]);
    expect(demandes).toHaveLength(1);
  });

  it("omet simplement les salons sans clé, sans échouer", async () => {
    // Un salon peut ne pas avoir de clé (message en clair d'avant le
    // chiffrement) : la recherche doit alors afficher le contenu tel quel.
    const { client } = clientFactice({ a: "CLE_A" });
    const cles = await getChatroomKeys(client, ["a", "inconnu"]);
    expect(cles.get("a")).toBe("CLE_A");
    expect(cles.has("inconnu")).toBe(false);
  });

  it("refuse de s'exécuter hors du navigateur", async () => {
    // La garde qui compte. Sur un serveur, le module est partagé par toutes les
    // requêtes : la clé mise en cache pour une personne serait rendue à une
    // autre sur simple présentation de l'identifiant du salon, sans repasser
    // par la policy qui la réserve aux membres du monde.
    vi.stubGlobal("window", undefined);
    const { client, demandes } = clientFactice({ a: "CLE_A" });

    await expect(getChatroomKeys(client, ["a"])).rejects.toThrow(/navigateur/);
    // Et rien n'a été demandé à la base.
    expect(demandes).toEqual([]);
  });
});
