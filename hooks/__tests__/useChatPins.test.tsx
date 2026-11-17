import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ──────────────────────────────────────────────────────────────────────────
// `ChatRoomView` n'est pas remonté quand on navigue d'un salon à l'autre :
// c'est le même composant, à la même position, avec un `chatId` différent.
// Ce hook doit donc se comporter correctement quand `chatId` change à chaud.
//
// Le mock partagé (test/supabaseMock) résout ses requêtes immédiatement ; ici
// on veut décider quand chaque réponse arrive, pour reproduire deux
// navigations rapprochées dont les réponses reviennent dans le désordre.
// ──────────────────────────────────────────────────────────────────────────

type Deferred = { resolve: (rows: unknown[]) => void };

/** Requêtes `chat_pins` en attente, indexées par `chat_id`. */
const pending = new Map<string, Deferred>();

function makeQuery() {
  let chatId = "";
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "order"]) builder[m] = () => builder;
  builder.eq = (_col: string, value: string) => { chatId = value; return builder; };
  builder.then = (resolve: (v: { data: unknown[] | null }) => unknown) =>
    new Promise<unknown[]>((res) => { pending.set(chatId, { resolve: res }); })
      .then((rows) => resolve({ data: rows }));
  return builder;
}

let channelOpened = 0;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => makeQuery(),
    channel: () => { channelOpened += 1; throw new Error("useChatPins ne doit plus ouvrir de canal"); },
  }),
}));

vi.mock("@/hooks/useReconnectEpoch", () => ({ useReconnectEpoch: () => 0 }));

import { useChatPins } from "@/hooks/useChatPins";

/** Fait aboutir la requête en attente pour ce salon. */
async function settle(chatId: string, rows: unknown[]) {
  const deferred = pending.get(chatId);
  if (!deferred) throw new Error(`aucune requête en attente pour ${chatId}`);
  pending.delete(chatId);
  await act(async () => { deferred.resolve(rows); });
}

const pinA = { id: "pin-a", chat_id: "room-a", message_id: 1, pinned_by: "u1" };
const pinB = { id: "pin-b", chat_id: "room-b", message_id: 2, pinned_by: "u1" };

beforeEach(() => {
  pending.clear();
  channelOpened = 0;
});

describe("useChatPins — changement de salon", () => {
  it("vide les épingles sans attendre la réponse du nouveau salon", async () => {
    const { result, rerender } = renderHook(
      ({ chatId }: { chatId: string }) => useChatPins(chatId),
      { initialProps: { chatId: "room-a" } },
    );

    await settle("room-a", [pinA]);
    expect(result.current.pins).toEqual([pinA]);

    // Navigation vers room-b : la requête part, mais rien n'est encore revenu.
    act(() => { rerender({ chatId: "room-b" }); });

    // Les épingles de room-a ne doivent pas rester affichées entre-temps —
    // `view.tsx` irait chercher ces messages pour les déchiffrer avec la clé
    // de room-b.
    expect(result.current.pins).toEqual([]);

    await settle("room-b", [pinB]);
    expect(result.current.pins).toEqual([pinB]);
  });

  it("ignore la réponse du salon quitté quand elle arrive en retard", async () => {
    const { result, rerender } = renderHook(
      ({ chatId }: { chatId: string }) => useChatPins(chatId),
      { initialProps: { chatId: "room-a" } },
    );

    // On quitte room-a avant que sa requête n'ait répondu.
    act(() => { rerender({ chatId: "room-b" }); });
    await settle("room-b", [pinB]);
    expect(result.current.pins).toEqual([pinB]);

    // La réponse de room-a arrive enfin : elle doit être jetée.
    await settle("room-a", [pinA]);
    await waitFor(() => expect(result.current.pins).toEqual([pinB]));
  });

  it("n'ouvre plus de canal : les épingles arrivent par celui du salon", () => {
    // Le salon (useRealtimeChatSync) tient déjà le canal privé `room:<id>` ;
    // la migration 214 y diffuse les épingles, relayées par `applyPinEvent`.
    renderHook(() => useChatPins("room-a"));
    expect(channelOpened).toBe(0);
  });
});

describe("useChatPins — avis du canal du salon", () => {
  it("ajoute, modifie puis retire une épingle", async () => {
    const { result } = renderHook(() => useChatPins("room-a"));
    await settle("room-a", []);

    act(() => result.current.applyPinEvent({ op: "INSERT", record: pinA }));
    expect(result.current.pins).toEqual([pinA]);

    const renommee = { ...pinA, label: "Repère" };
    act(() => result.current.applyPinEvent({ op: "UPDATE", record: renommee }));
    expect(result.current.pins).toEqual([renommee]);

    act(() => result.current.applyPinEvent({ op: "DELETE", id: pinA.id }));
    expect(result.current.pins).toEqual([]);
  });

  it("ignore l'épingle d'un autre salon", async () => {
    const { result } = renderHook(() => useChatPins("room-a"));
    await settle("room-a", []);
    act(() => result.current.applyPinEvent({ op: "INSERT", record: pinB }));
    expect(result.current.pins).toEqual([]);
  });
});
