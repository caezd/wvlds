import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { idsEpinglesManquants, chargerMessagesEpingles } from "@/lib/pinnedMessages";
import { generateRoomKey, encryptMessage, __clearKeyCache } from "@/lib/crypto";
import type { ChatMessageWithPersona, ChatPin } from "@/types/db";

// ──────────────────────────────────────────────────────────────────────────
// Messages épinglés hors de la fenêtre chargée.
//
// Une épingle peut viser un message très ancien : la barre d'épingles va donc
// le chercher séparément. `ChatRoomView` n'étant pas remontée d'un salon à
// l'autre, cette requête pouvait revenir APRÈS un changement de salon — et le
// déchiffrement lisait la clé courante, celle du nouveau salon.
//
// `useChatPins` avait déjà colmaté l'étape d'avant (la liste des épingles) et
// son commentaire nommait ce danger-ci ; il restait ouvert.
// ──────────────────────────────────────────────────────────────────────────

const pin = (message_id: number | null) => ({ message_id }) as Pick<ChatPin, "message_id">;
const msg = (id: number) => ({ id }) as Pick<ChatMessageWithPersona, "id">;

beforeEach(() => __clearKeyCache());

describe("idsEpinglesManquants", () => {
  it("ne demande que ce qui n'est ni affiché ni déjà en cache", () => {
    expect(idsEpinglesManquants([pin(1), pin(2), pin(3)], [msg(2)], [msg(3)])).toEqual([1]);
  });

  it("ignore les ancres, qui n'ont pas de message", () => {
    // Une épingle d'ancre porte `message_id: null` : la demander ramènerait
    // toute la table.
    expect(idsEpinglesManquants([pin(null), pin(7)], [], [])).toEqual([7]);
  });

  it("ne demande pas deux fois le même message", () => {
    // Deux personnes peuvent épingler le même message.
    expect(idsEpinglesManquants([pin(5), pin(5)], [], [])).toEqual([5]);
  });

  it("ne demande rien quand tout est là", () => {
    expect(idsEpinglesManquants([pin(1)], [msg(1)], [])).toEqual([]);
    expect(idsEpinglesManquants([], [], [])).toEqual([]);
  });
});

/** Client Supabase minimal : rend les lignes fournies, et note les appels. */
function clientFactice(lignes: { id: number; content: string }[]) {
  const journal: number[][] = [];
  const client = {
    from: () => ({
      select: () => ({
        in: (_colonne: string, ids: number[]) => {
          journal.push(ids);
          return Promise.resolve({ data: lignes, error: null });
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, journal };
}

describe("chargerMessagesEpingles", () => {
  it("déchiffre le contenu avec la clé fournie", async () => {
    const cle = await generateRoomKey();
    const chiffre = await encryptMessage("le secret du salon A", cle);
    const { client, journal } = clientFactice([{ id: 4, content: chiffre }]);

    const res = await chargerMessagesEpingles(client, [4], cle);

    expect(journal).toEqual([[4]]);
    expect(res).toHaveLength(1);
    expect(res[0].content).toBe("le secret du salon A");
  });

  it("ne touche pas la base quand il n'y a rien à charger", async () => {
    // La vue appelle cette fonction à chaque rendu de la barre d'épingles.
    const { client, journal } = clientFactice([]);
    expect(await chargerMessagesEpingles(client, [], null)).toEqual([]);
    expect(journal).toEqual([]);
  });

  it("rend le contenu tel quel sans clé", async () => {
    // Un salon dont la clé n'est pas encore posée : mieux vaut le texte brut
    // qu'une exception qui viderait la barre d'épingles.
    const { client } = clientFactice([{ id: 4, content: "clair" }]);
    const res = await chargerMessagesEpingles(client, [4], null);
    expect(res[0].content).toBe("clair");
  });

  it("ne rend rien si la requête échoue", async () => {
    const client = {
      from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { message: "boum" } }) }) }),
    } as unknown as SupabaseClient;
    expect(await chargerMessagesEpingles(client, [4], null)).toEqual([]);
  });

  it("la clé du salon suivant ne déchiffre PAS les messages du précédent", async () => {
    // Le défaut qui motivait la garde d'annulation : sans elle, la réponse
    // tardive du salon A était déchiffrée avec la clé de B, et ces messages
    // illisibles s'affichaient épinglés dans B.
    const cleA = await generateRoomKey();
    const cleB = await generateRoomKey();
    const chiffreA = await encryptMessage("message du salon A", cleA);
    const { client } = clientFactice([{ id: 9, content: chiffreA }]);

    const res = await chargerMessagesEpingles(client, [9], cleB);

    expect(res[0].content).not.toBe("message du salon A");
  });
});
