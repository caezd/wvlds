import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StrictMode } from "react";

// ──────────────────────────────────────────────────────────────────────────
// `WorldSidebar` rend `WorldSidebarChatrooms` deux fois — aside desktop et
// tiroir mobile — et `hidden` en CSS ne démonte pas. Deux instances ouvraient
// donc deux canaux Realtime pour une seule liste, sur chaque page de monde et
// de salon. Le décodage du WAL étant le poste dominant côté base, chaque canal
// compte.
//
// Ce que ces tests garantissent : une souscription unique quel que soit le
// nombre d'instances, et sa fermeture dès la dernière démontée.
// ──────────────────────────────────────────────────────────────────────────

type Handler = (payload: unknown) => void;

/** Canaux créés, avec leurs handlers, pour piloter le temps réel depuis le test. */
const canaux: { topic: string; handlers: { table: string; event: string; handler: Handler }[] }[] = [];
let retires = 0;

/**
 * Reproduit le registre par topic de supabase-js : `channel(topic)` rend le
 * canal EXISTANT pour un nom déjà connu, et `.on()` lève sur un canal déjà
 * souscrit. `removeChannel` étant asynchrone côté réel, on garde ici le canal
 * dans le registre après retrait — c'est exactement la fenêtre qui faisait
 * planter l'ouverture du tiroir.
 */
const registre = new Map<string, ReturnType<typeof creerCanal>>();

function creerCanal(topic: string) {
  const entree = { topic, handlers: [] as { table: string; event: string; handler: Handler }[] };
  canaux.push(entree);
  let souscrit = false;
  const ch = {
    topic,
    on(_type: string, cfg: { table: string; event: string }, handler: Handler) {
      if (souscrit) {
        throw new Error(
          `cannot add \`postgres_changes\` callbacks for realtime:${topic} after \`subscribe()\`.`,
        );
      }
      entree.handlers.push({ table: cfg.table, event: cfg.event, handler });
      return ch;
    },
    subscribe() {
      souscrit = true;
      return ch;
    },
  };
  return ch;
}

function makeChannel(topic: string) {
  const existant = registre.get(topic);
  if (existant) return existant;
  const ch = creerCanal(topic);
  registre.set(topic, ch);
  return ch;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (topic: string) => makeChannel(topic),
    removeChannel: () => {
      retires += 1;
    },
  }),
}));

vi.mock("@/hooks/useReconnectEpoch", () => ({ useReconnectEpoch: () => 0 }));

import {
  useWorldRooms,
  __resetWorldRoomsStore,
  __openChannelCount,
  type WorldRoom,
} from "@/lib/worldRoomsStore";

function room(id: string, last: string | null): WorldRoom {
  return {
    id,
    title: `Salon ${id}`,
    name: null,
    icon_url: null,
    last_message_at: last,
    unread_count: 0,
    category_id: null,
    last_poster_avatar_url: null,
    last_poster_id: null,
    participant_count: 0,
    second_poster_avatar_url: null,
  };
}

/** Déclenche un événement Realtime sur tous les canaux ouverts. */
function emettre(table: string, event: string, payload: unknown) {
  act(() => {
    for (const c of canaux) {
      for (const h of c.handlers) {
        if (h.table === table && h.event === event) h.handler(payload);
      }
    }
  });
}

const A = room("a", "2026-01-02T00:00:00Z");
const B = room("b", "2026-01-01T00:00:00Z");

beforeEach(() => {
  __resetWorldRoomsStore();
  canaux.length = 0;
  registre.clear();
  retires = 0;
});

describe("useWorldRooms", () => {
  it("n'ouvre qu'un seul canal pour deux instances du même monde", () => {
    const un = renderHook(() => useWorldRooms("w1", [A, B]));
    const deux = renderHook(() => useWorldRooms("w1", [A, B]));

    expect(canaux).toHaveLength(1);
    expect(__openChannelCount()).toBe(1);
    // Les deux voient bien la même liste.
    expect(un.result.current.map((r) => r.id)).toEqual(["a", "b"]);
    expect(deux.result.current.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("garde le canal ouvert tant qu'une instance subsiste", () => {
    const un = renderHook(() => useWorldRooms("w1", [A, B]));
    const deux = renderHook(() => useWorldRooms("w1", [A, B]));

    un.unmount();
    expect(__openChannelCount()).toBe(1);
    expect(retires).toBe(0);

    deux.unmount();
    expect(__openChannelCount()).toBe(0);
    expect(retires).toBe(1);
  });

  it("expose la liste dès le premier rendu, sans attendre l'effet", () => {
    // Sans semis synchrone, la barre latérale afficherait une liste vide le
    // temps d'une image à chaque arrivée sur une page de monde.
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    expect(result.current).toHaveLength(2);
  });

  it("propage un nouveau salon aux DEUX instances", () => {
    const un = renderHook(() => useWorldRooms("w1", [A]));
    const deux = renderHook(() => useWorldRooms("w1", [A]));

    emettre("chatrooms", "INSERT", {
      new: { id: "c", title: "Nouveau", name: null, icon_url: null,
             last_message_at: "2026-01-03T00:00:00Z", category_id: null },
    });

    expect(un.result.current.map((r) => r.id)).toEqual(["c", "a"]);
    expect(deux.result.current.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("ignore un salon déjà présent", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A]));
    emettre("chatrooms", "INSERT", {
      new: { id: "a", title: "Doublon", name: null, icon_url: null,
             last_message_at: "2026-01-02T00:00:00Z", category_id: null },
    });
    expect(result.current).toHaveLength(1);
  });

  it("remonte le salon dont un message vient d'arriver", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    emettre("chatroom_summaries", "UPDATE", {
      new: {
        chat_id: "b",
        last_message_at: "2026-01-09T00:00:00Z",
        last_message_author_id: "u1",
        last_message_persona_avatar_url: "/x.webp",
      },
    });
    expect(result.current.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result.current[0].last_poster_id).toBe("u1");
  });

  it("ne notifie pas quand l'événement ne concerne aucun salon connu", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A]));
    const avant = result.current;
    emettre("chatroom_summaries", "UPDATE", {
      new: { chat_id: "inconnu", last_message_at: "2026-02-01T00:00:00Z",
             last_message_author_id: null, last_message_persona_avatar_url: null },
    });
    // Référence inchangée : aucun rendu inutile déclenché.
    expect(result.current).toBe(avant);
  });

  it("ouvre un canal distinct par monde et ferme celui qu'on quitte", () => {
    const vue = renderHook(({ w }: { w: string }) => useWorldRooms(w, [A]), {
      initialProps: { w: "w1" },
    });
    // Le nom porte un suffixe d'ouverture (cf. `compteurCanal`) : on vérifie le
    // monde, pas le nom exact.
    expect(canaux).toHaveLength(1);
    expect(canaux[0].topic).toMatch(/^sidebar-rooms:w1:/);

    act(() => { vue.rerender({ w: "w2" }); });

    expect(canaux).toHaveLength(2);
    expect(canaux[1].topic).toMatch(/^sidebar-rooms:w2:/);
    expect(retires).toBe(1);
    expect(__openChannelCount()).toBe(1);
  });
  it("survit au montage/démontage/remontage du mode strict", () => {
    // React monte, démonte puis remonte chaque effet en développement. Avec un
    // nom de canal stable, le remontage récupérait le canal encore souscrit
    // (`removeChannel` est asynchrone) et `.on()` levait « cannot add
    // postgres_changes callbacks after subscribe() » — le tiroir de la barre
    // latérale plantait à l'ouverture.
    expect(() =>
      renderHook(() => useWorldRooms("w1", [A, B]), { wrapper: StrictMode }),
    ).not.toThrow();

    // Et il reste bien UN canal ouvert au bout du compte.
    expect(__openChannelCount()).toBe(1);
  });

  it("ne réutilise jamais un canal déjà souscrit", () => {
    const un = renderHook(() => useWorldRooms("w1", [A]));
    un.unmount();
    // Remontage immédiat, alors que le retrait précédent n'est pas encore
    // propagé côté supabase-js.
    expect(() => renderHook(() => useWorldRooms("w1", [A]))).not.toThrow();
    expect(canaux.map((c) => c.topic)).toHaveLength(2);
    expect(new Set(canaux.map((c) => c.topic)).size).toBe(2);
  });
});
