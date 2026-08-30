import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useMessagesEpingles } from "@/hooks/useMessagesEpingles";
import { generateRoomKey, encryptMessage, __clearKeyCache } from "@/lib/crypto";
import type { ChatMessageWithPersona, ChatPin } from "@/types/db";

// ──────────────────────────────────────────────────────────────────────────
// `ChatRoomView` n'est PAS remontée quand on passe d'un salon à l'autre :
// même position dans l'arbre, pas de `key`. Ce hook doit donc faire lui-même
// ce qu'un remontage ferait gratuitement.
//
// Deux dégâts distincts si on l'oublie :
//   1. les épingles du salon précédent restent affichées ;
//   2. une requête partie pour le salon précédent revient après le changement,
//      et son contenu est déchiffré avec la clé du salon COURANT — des
//      messages illisibles s'affichent alors épinglés au mauvais endroit.
//
// `useChatPins` avait déjà colmaté l'étape d'avant, et son commentaire
// nommait ce danger-ci.
// ──────────────────────────────────────────────────────────────────────────

const pin = (message_id: number | null) => ({ message_id }) as Pick<ChatPin, "message_id">;

/**
 * Client Supabase dont on décide quand les réponses arrivent.
 *
 * `repondre` résout TOUTES les requêtes en attente, et pas seulement la
 * première : React monte les effets deux fois en mode strict, donc la requête
 * d'indice 0 est celle du montage annulé. N'en résoudre qu'une laisserait le
 * hook attendre indéfiniment la vraie.
 */
function clientPilote() {
  const attentes: ((v: { data: unknown; error: null }) => void)[] = [];
  const demandes: number[][] = [];
  const client = {
    from: () => ({
      select: () => ({
        in: (_c: string, ids: number[]) => {
          demandes.push(ids);
          return new Promise((resolve) => attentes.push(resolve));
        },
      }),
    }),
  } as unknown as SupabaseClient;
  const repondre = async (lignes: { id: number; content: string }[]) => {
    await act(async () => {
      for (const resoudre of attentes.splice(0)) resoudre({ data: lignes, error: null });
      await new Promise((r) => setTimeout(r, 5));
    });
  };
  return { client, demandes, repondre, attentes };
}

beforeEach(() => {
  __clearKeyCache();
  vi.restoreAllMocks();
});

describe("useMessagesEpingles", () => {
  it("charge et déchiffre un message épinglé hors de la fenêtre", async () => {
    const cle = await generateRoomKey();
    const chiffre = await encryptMessage("épinglé ancien", cle);
    const { client, demandes, repondre } = clientPilote();
    const ref = { current: cle };

    const { result } = renderHook(() =>
      useMessagesEpingles(client, "chatA", [pin(42)], [], ref, cle),
    );

    await waitFor(() => expect(demandes.length).toBeGreaterThan(0));
    expect(demandes.every((d) => d.join() === "42")).toBe(true);
    await repondre([{ id: 42, content: chiffre }]);
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].content).toBe("épinglé ancien");
  });

  it("ne redemande pas un message déjà présent dans la fenêtre", async () => {
    const { client, demandes } = clientPilote();
    renderHook(() =>
      useMessagesEpingles(
        client, "chatA", [pin(42)],
        [{ id: 42 } as ChatMessageWithPersona], { current: null }, null,
      ),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(demandes).toEqual([]);
  });

  it("vide la liste dès le changement de salon", async () => {
    const { client, repondre } = clientPilote();
    const ref = { current: null as string | null };

    const { result, rerender } = renderHook(
      ({ chatId }) => useMessagesEpingles(client, chatId, [pin(42)], [], ref, null),
      { initialProps: { chatId: "chatA" } },
    );
    await repondre([{ id: 42, content: "du salon A" }]);
    await waitFor(() => expect(result.current).toHaveLength(1));

    rerender({ chatId: "chatB" });

    // Sans la remise à zéro, l'épingle du salon A resterait affichée dans B.
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("ignore la réponse d'un salon déjà quitté", async () => {
    // LE cas qui motive tout ceci. La requête part pour le salon A ; on passe
    // à B avant qu'elle revienne. Sans la garde d'annulation, son contenu est
    // déchiffré avec la clé de B — illisible — et affiché dans B.
    const cleA = await generateRoomKey();
    const cleB = await generateRoomKey();
    const chiffreA = await encryptMessage("secret du salon A", cleA);
    const { client, attentes } = clientPilote();
    const ref = { current: cleA as string | null };

    const { result, rerender } = renderHook(
      ({ chatId, cle }) => useMessagesEpingles(client, chatId, [pin(42)], [], ref, cle),
      { initialProps: { chatId: "chatA", cle: cleA } },
    );
    await waitFor(() => expect(attentes.length).toBeGreaterThan(0));

    // Les requêtes EN VOL pour le salon A, et elles seules. Celles que le
    // salon B émettra ensuite ne doivent pas être résolues ici : ce test ne
    // porte que sur la réponse tardive du salon quitté.
    const enVolPourA = attentes.splice(0);

    ref.current = cleB;
    rerender({ chatId: "chatB", cle: cleB });

    await act(async () => {
      for (const resoudre of enVolPourA) resoudre({ data: [{ id: 42, content: chiffreA }], error: null });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Rien du salon A ne doit apparaître dans le salon B — ni en clair, ni
    // sous forme illisible, ce qui est ce qui se produisait vraiment.
    expect(result.current).toEqual([]);
  });

  it("ne demande rien quand il n'y a aucune épingle", async () => {
    const { client, demandes } = clientPilote();
    renderHook(() => useMessagesEpingles(client, "chatA", [], [], { current: null }, null));
    await new Promise((r) => setTimeout(r, 10));
    expect(demandes).toEqual([]);
  });

  it("ne boucle pas une fois la charge terminée", async () => {
    // L'effet lit son propre état pour ne pas redemander : s'il se relançait,
    // il tournerait indéfiniment.
    const { client, demandes, repondre } = clientPilote();
    const { result } = renderHook(() =>
      useMessagesEpingles(client, "chatA", [pin(42)], [], { current: null }, null),
    );
    await repondre([{ id: 42, content: "clair" }]);
    await waitFor(() => expect(result.current).toHaveLength(1));
    const apresCharge = demandes.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(demandes.length).toBe(apresCharge);
  });
});
