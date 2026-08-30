import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { amorcerCleDeSalon } from "@/lib/chatroomKeyBootstrap";
import { __clearKeyCache } from "@/lib/crypto";

// ──────────────────────────────────────────────────────────────────────────
// Pose de la clé de chiffrement d'un salon fraîchement créé.
//
// Ce chemin ne se déclenche qu'à la création d'un salon — jamais pendant une
// session ordinaire — et n'avait aucun test, alors qu'il décide de la
// lisibilité de tous les messages qui suivront.
//
// Le cas qui compte : deux personnes ouvrent le salon neuf en même temps. Les
// deux tentent l'insertion, la clé primaire en refuse une. Sans rattrapage,
// la perdante repartirait avec une clé que personne d'autre ne connaît, et ses
// messages seraient illisibles pour tout le monde.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Client Supabase minimal.
 *
 * @param lectures  clés rendues par les `select` successifs
 * @param erreurInsert refus de l'insertion, comme une clé primaire dupliquée
 */
function clientFactice(lectures: (string | null)[], erreurInsert: { message: string } | null = null) {
  const journal: string[] = [];
  const restantes = [...lectures];
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            journal.push("select");
            const k = restantes.shift() ?? null;
            return Promise.resolve({ data: k ? { key_b64: k } : null, error: null });
          },
        }),
      }),
      insert: () => {
        journal.push("insert");
        return Promise.resolve({ data: null, error: erreurInsert });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, journal };
}

beforeEach(() => {
  __clearKeyCache();
  vi.unstubAllGlobals();
});

describe("amorcerCleDeSalon", () => {
  it("rend la clé existante sans rien écrire", async () => {
    const { client, journal } = clientFactice(["CLE_EXISTANTE"]);

    expect(await amorcerCleDeSalon(client, "chat1")).toBe("CLE_EXISTANTE");
    // Aucune insertion : écraser une clé en place rendrait illisible tout
    // l'historique du salon.
    expect(journal).toEqual(["select"]);
  });

  it("crée une clé quand le salon n'en a pas", async () => {
    const { client, journal } = clientFactice([null]);

    const cle = await amorcerCleDeSalon(client, "chat1");

    expect(journal).toEqual(["select", "insert"]);
    expect(cle).toBeTruthy();
    // Une clé AES-256 exportée en base64 : 32 octets, donc 44 caractères.
    expect(cle).toHaveLength(44);
  });

  it("adopte la clé du gagnant quand l'insertion est refusée", async () => {
    // Deux navigateurs arrivent ensemble : la seconde insertion est refusée par
    // la clé primaire, et doit relire celle qui a été posée.
    const { client, journal } = clientFactice(
      [null, "CLE_DU_GAGNANT"],
      { message: "duplicate key value violates unique constraint" },
    );

    expect(await amorcerCleDeSalon(client, "chat1")).toBe("CLE_DU_GAGNANT");
    expect(journal).toEqual(["select", "insert", "select"]);
  });

  it("ne rend jamais sa propre clé après un refus d'insertion", async () => {
    // Le défaut qui coûterait cher : garder la clé perdante. Les messages
    // seraient chiffrés avec une clé que personne d'autre ne possède.
    const { client } = clientFactice([null, "CLE_DU_GAGNANT"], { message: "conflit" });
    const cle = await amorcerCleDeSalon(client, "chat1");
    expect(cle).toBe("CLE_DU_GAGNANT");
    expect(cle).not.toHaveLength(0);
  });

  it("rend null si la relecture après refus ne trouve rien", async () => {
    // Rien à proposer : mieux vaut l'absence de clé qu'une clé fantaisiste.
    const { client } = clientFactice([null, null], { message: "conflit" });
    expect(await amorcerCleDeSalon(client, "chat1")).toBeNull();
  });

  it("tire une clé différente à chaque création", async () => {
    const a = await amorcerCleDeSalon(clientFactice([null]).client, "chat1");
    const b = await amorcerCleDeSalon(clientFactice([null]).client, "chat2");
    expect(a).not.toBe(b);
  });
});
