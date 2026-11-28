import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";

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
const canaux: {
  topic: string;
  handlers: { type: string; event: string; handler: Handler }[];
  /** Re-jonction du canal, comme après une coupure brève (supabase-js). */
  rejoindre: () => void;
}[] = [];
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
  const entree = {
    topic,
    handlers: [] as { type: string; event: string; handler: Handler }[],
    rejoindre: () => {},
  };
  canaux.push(entree);
  let souscrit = false;
  const ch = {
    topic,
    on(type: string, cfg: { event: string }, handler: Handler) {
      if (souscrit) {
        throw new Error(
          `cannot add \`${type}\` callbacks for realtime:${topic} after \`subscribe()\`.`,
        );
      }
      entree.handlers.push({ type, event: cfg.event, handler });
      return ch;
    },
    subscribe(cb?: (status: string) => void) {
      souscrit = true;
      entree.rejoindre = () => cb?.("SUBSCRIBED");
      cb?.("SUBSCRIBED");
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

const serveur = vi.hoisted(() => ({
  /** Réponse de `list_chatrooms_nav` à la relecture. */
  salons: [] as unknown[],
  rpc: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  epoch: 0,
}));

vi.mock("@/lib/supabase/client", async () => {
  const { vi: v } = await import("vitest");
  serveur.rpc = v.fn(async () => ({ data: serveur.salons, error: null }));
  return { createClient: () => ({
    rpc: serveur.rpc,
    channel: (topic: string) => makeChannel(topic),
    removeChannel: (ch?: { topic: string }) => {
      retires += 1;
      // Asynchrone comme le vrai client : le canal ne quitte le registre
      // qu'après `unsubscribe()`. Une réouverture qui attend obtient donc un
      // canal neuf ; une réouverture synchrone retomberait sur l'ancien.
      return Promise.resolve().then(() => {
        if (ch && registre.get(ch.topic)) registre.delete(ch.topic);
        return "ok";
      });
    },
  }) };
});

vi.mock("@/hooks/useReconnectEpoch", () => ({ useReconnectEpoch: () => serveur.epoch }));

import { __resetRealtimeHub } from "@/lib/realtimeHub";
import {
  useWorldRooms,
  useParticipatedRoomIds,
  addCreatedWorldRoom,
  patchWorldRoom,
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

/** Diffuse un avis du canal privé du monde (migration 214) sur les canaux ouverts. */
function emettre(event: string, payload: Record<string, unknown>) {
  act(() => {
    for (const c of canaux) {
      for (const h of c.handlers) {
        if (h.type === "broadcast" && h.event === "*") h.handler({ event, payload });
      }
    }
  });
}

const A = room("a", "2026-01-02T00:00:00Z");
const B = room("b", "2026-01-01T00:00:00Z");

beforeEach(() => {
  __resetWorldRoomsStore();
  __resetRealtimeHub();
  canaux.length = 0;
  registre.clear();
  retires = 0;
  serveur.salons = [];
  serveur.epoch = 0;
  serveur.rpc?.mockClear();
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

    emettre("chatroom", { op: "INSERT", id: "c", title: "Nouveau", name: null, icon_url: null, category_id: null,
                          created_at: "2026-01-05T00:00:00Z" });

    // Sans message, le nouveau salon se range à sa date de création.
    expect(un.result.current.map((r) => r.id)).toEqual(["c", "a"]);
    expect(deux.result.current.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("ignore un salon déjà présent", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A]));
    emettre("chatroom", { op: "INSERT", id: "a", title: A.title, name: null, icon_url: null, category_id: null });
    expect(result.current).toHaveLength(1);
  });

  it("remonte le salon dont un message vient d'arriver", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    emettre("summary", {
      op: "UPDATE",
      chat_id: "b",
      last_message_at: "2026-01-09T00:00:00Z",
      last_message_author_id: "u1",
      last_message_persona_avatar_url: "/x.webp",
    });
    expect(result.current.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result.current[0].last_poster_id).toBe("u1");
  });

  it("ne notifie pas quand l'événement ne concerne aucun salon connu", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A]));
    const avant = result.current;
    emettre("summary", { op: "UPDATE", chat_id: "inconnu", last_message_at: "2026-02-01T00:00:00Z",
                         last_message_author_id: null, last_message_persona_avatar_url: null });
    // Référence inchangée : aucun rendu inutile déclenché.
    expect(result.current).toBe(avant);
  });

  it("ouvre un canal distinct par monde et ferme celui qu'on quitte", () => {
    const vue = renderHook(({ w }: { w: string }) => useWorldRooms(w, [A]), {
      initialProps: { w: "w1" },
    });
    // Le nom reste stable — c'est l'enchaînement qui est sérialisé.
    expect(canaux).toHaveLength(1);
    expect(canaux[0].topic).toBe("world:w1");

    act(() => { vue.rerender({ w: "w2" }); });

    expect(canaux).toHaveLength(2);
    expect(canaux[1].topic).toBe("world:w2");
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

  it("rend côté serveur les salons de la requête, pas une liste déjà en mémoire", () => {
    // La table du module vit aussi longtemps que le processus serveur : une
    // liste semée par un rendu précédent ne doit pas remplacer celle de la
    // requête, sans quoi le HTML montre d'anciens salons et l'hydratation
    // échoue (« 1 sujet » rendu par le serveur, « 21 sujets » par le client).
    renderHook(() => useWorldRooms("w1", [A]));

    function Liste() {
      const rooms = useWorldRooms("w1", [A, B]);
      return <p>{rooms.map((r) => r.id).join(",")}</p>;
    }
    expect(renderToString(<Liste />)).toBe("<p>a,b</p>");
  });

  it("ne réutilise jamais un canal déjà souscrit", async () => {
    const un = renderHook(() => useWorldRooms("w1", [A]));
    const premier = canaux[0];
    un.unmount();

    // Remontage immédiat, alors que le retrait précédent n'est pas encore
    // propagé côté supabase-js. L'ouverture attend cette fermeture.
    await act(async () => {
      renderHook(() => useWorldRooms("w1", [A]));
    });

    // Même nom — c'est le point de repère du canal — mais une instance neuve,
    // jamais celle qui était encore souscrite.
    expect(canaux).toHaveLength(2);
    expect(canaux[1].topic).toBe(premier.topic);
    expect(canaux[1]).not.toBe(premier);
  });
});

describe("patchWorldRoom", () => {
  it("renomme un salon dans la liste, chez toutes les instances", () => {
    const un = renderHook(() => useWorldRooms("w1", [A, B]));
    const deux = renderHook(() => useWorldRooms("w1", [A, B]));
    act(() => patchWorldRoom("w1", "a", { title: "Nouveau titre" }));
    expect(un.result.current.find((r) => r.id === "a")?.title).toBe("Nouveau titre");
    expect(deux.result.current.find((r) => r.id === "a")?.title).toBe("Nouveau titre");
    // Le reste du salon et de la liste ne bouge pas.
    expect(un.result.current.map((r) => r.id)).toEqual(["a", "b"]);
    expect(un.result.current.find((r) => r.id === "a")?.last_message_at).toBe(A.last_message_at);
  });

  it("ignore un salon absent ou un patch sans changement", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    const avant = result.current;
    act(() => patchWorldRoom("w1", "inconnu", { title: "x" }));
    act(() => patchWorldRoom("w1", "a", { title: A.title }));
    expect(result.current).toBe(avant);
  });
});

describe("useWorldRooms — avis du canal du monde", () => {
  it("renomme un salon annoncé par le canal du monde", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    emettre("chatroom", { op: "UPDATE", id: "a", title: "Renommé", name: null, icon_url: "/i.webp", category_id: "cat" });
    const a = result.current.find((r) => r.id === "a")!;
    expect(a.title).toBe("Renommé");
    expect(a.icon_url).toBe("/i.webp");
    expect(a.category_id).toBe("cat");
    expect(a.last_message_at).toBe(A.last_message_at);
  });

  it("retire un salon supprimé", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    emettre("chatroom", { op: "DELETE", id: "a" });
    expect(result.current.map((r) => r.id)).toEqual(["b"]);
  });

  it("le premier message d'un salon (résumé créé) le remonte", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A, room("c", null)]));
    emettre("summary", { op: "INSERT", chat_id: "c", last_message_at: "2026-03-01T00:00:00Z",
                         last_message_author_id: "u2", last_message_persona_avatar_url: null });
    expect(result.current.map((r) => r.id)).toEqual(["c", "a"]);
  });
  it("le tour qui change dans un salon : à qui, depuis quand", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    emettre("turn", { chat_id: "b", turn_user_id: "u2", turn_started_at: "2026-03-01T00:00:00Z" });
    const b = result.current.find((r) => r.id === "b")!;
    expect(b.turn_user_id).toBe("u2");
    expect(b.turn_started_at).toBe("2026-03-01T00:00:00Z");
    expect(result.current.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("le tour d'un salon privé : la liste se relit", async () => {
    serveur.salons = [A, { ...B, turn_user_id: "u2", turn_started_at: "2026-03-01T00:00:00Z" }];
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    await act(async () => {
      emettre("turn", { chat_id: "b", private: true });
    });
    expect(serveur.rpc).toHaveBeenCalledWith("list_chatrooms_nav", { p_world_id: "w1" });
    expect(result.current.find((r) => r.id === "b")!.turn_user_id).toBe("u2");
  });

  it("relit la liste quand le canal est rejoint après une coupure, pas à la première jonction", async () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A, B]));
    expect(serveur.rpc).not.toHaveBeenCalled();

    // Pendant la coupure, B a reçu un message : l'avis est perdu.
    const Bplus = { ...B, last_message_at: "2026-01-03T00:00:00Z" };
    serveur.salons = [A, Bplus];
    await act(async () => {
      canaux[0].rejoindre();
    });

    expect(serveur.rpc).toHaveBeenCalledWith("list_chatrooms_nav", { p_world_id: "w1" });
    expect(result.current.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("une reconnexion ne ramène pas la liste du chargement de la page", async () => {
    const { result, rerender } = renderHook(() => useWorldRooms("w1", [A, B]));
    // Reçu en direct : B remonte en tête.
    emettre("summary", { op: "UPDATE", chat_id: "b", last_message_at: "2026-01-03T00:00:00Z" });
    expect(result.current.map((r) => r.id)).toEqual(["b", "a"]);

    // Reconnexion : canal refermé puis rouvert. La liste ne doit pas revenir
    // à `initialRooms` (A avant B) ; elle est relue auprès du serveur.
    serveur.salons = [{ ...B, last_message_at: "2026-01-03T00:00:00Z" }, A];
    serveur.epoch = 1;
    await act(async () => {
      rerender();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.map((r) => r.id)).toEqual(["b", "a"]);
    expect(serveur.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("Salons sans message : rangés à leur date de création", () => {
  it("un salon sans message passe devant les messages plus anciens que sa création", () => {
    const vide = { ...room("v", null), created_at: "2026-01-01T12:00:00Z" };
    const { result } = renderHook(() => useWorldRooms("w1", [A, B, vide]));
    // Un tri quelconque (ici un message dans B) range toute la liste.
    emettre("summary", { op: "UPDATE", chat_id: "b", last_message_at: "2026-01-01T06:00:00Z" });
    expect(result.current.map((r) => r.id)).toEqual(["a", "v", "b"]);
  });
});

describe("addCreatedWorldRoom", () => {
  it("liste le salon créé en tête, chez toutes les instances", () => {
    const un = renderHook(() => useWorldRooms("w1", [A, B]));
    const deux = renderHook(() => useWorldRooms("w1", [A, B]));
    act(() => addCreatedWorldRoom("w1", { id: "n", title: "Neuf", category_id: "cat" }));
    expect(un.result.current.map((r) => r.id)).toEqual(["n", "a", "b"]);
    expect(deux.result.current[0]).toMatchObject({ id: "n", title: "Neuf", category_id: "cat", last_message_at: null });
  });

  it("compte le salon créé parmi ceux où l'on joue", () => {
    renderHook(() => useWorldRooms("w1", [A]));
    const ids = renderHook(() => useParticipatedRoomIds("w1"));
    act(() => addCreatedWorldRoom("w1", { id: "n", title: "Neuf", category_id: null }));
    expect([...ids.result.current]).toEqual(["n"]);
  });

  it("l'avis du canal qui suit ne duplique pas le salon", () => {
    const { result } = renderHook(() => useWorldRooms("w1", [A]));
    act(() => addCreatedWorldRoom("w1", { id: "n", title: "Neuf", category_id: null }));
    emettre("chatroom", { op: "INSERT", id: "n", title: "Neuf", name: null, icon_url: null, category_id: null,
                          created_at: "2026-01-05T00:00:00Z" });
    expect(result.current.map((r) => r.id)).toEqual(["n", "a"]);
  });
});
