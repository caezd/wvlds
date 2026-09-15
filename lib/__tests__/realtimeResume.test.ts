import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, useEffect } from "react";
import { render, act } from "@testing-library/react";
import { RealtimeClient } from "@supabase/realtime-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────
// Reprise du canal de présence au réveil de l'application.
//
// Tout est réel ici : realtime-js, `openRealtimeChannel`, `useReconnectEpoch`.
// Seul le serveur Phoenix est factice, et la websocket est un objet que le
// test contrôle — c'est ce qui permet de fabriquer une socket « zombie »,
// ouverte pour le navigateur mais morte pour le réseau.
//
// C'est le cas d'une PWA qui revient du fond après un moment : la socket
// accepte encore les envois, donc rien ne la remet en cause avant que le
// heartbeat ne l'abandonne. Recréer les canaux ne suffisait pas : ils
// rejoignaient dans le vide, et la présence ne repartait qu'au bout de 52 s
// (mesuré ici même, avant le correctif). Le hook ferme désormais la socket
// avant de recréer les canaux.
// ──────────────────────────────────────────────────────────────────────────

// Le client rendu par `createClient()` est fixé test par test.
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => holder.client }));

import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { openRealtimeChannel, __resetRealtimeChannels } from "@/lib/realtimeChannel";

type Frame = [string | null, string | null, string, string, Record<string, unknown>];

const journal: string[] = [];
let t0 = 0;
const log = (m: string) => journal.push(`t=${String(Date.now() - t0).padStart(6)}ms  ${m}`);

/** Serveur Phoenix minimal : join, leave, heartbeat, présence. */
class FakeServer {
  sockets: FakeWebSocket[] = [];
  presence = new Map<string, Record<string, unknown[]>>(); // topic → clé → metas
  deliver(ws: FakeWebSocket, frame: Frame, delay = 2) {
    setTimeout(() => {
      if (ws.readyState !== 1 || ws.zombie) return;
      ws.onmessage?.({ data: JSON.stringify(frame) });
    }, delay);
  }
  handle(ws: FakeWebSocket, [join_ref, ref, topic, event, payload]: Frame) {
    log(`serveur ← ${topic} ${event}`);
    const reply = (response: Record<string, unknown> = {}) =>
      this.deliver(ws, [join_ref, ref, topic, "phx_reply", { status: "ok", response }]);
    if (event === "phx_join") {
      reply();
      const state = this.presence.get(topic) ?? {};
      const metas: Record<string, { metas: unknown[] }> = {};
      for (const [k, m] of Object.entries(state)) metas[k] = { metas: m };
      this.deliver(ws, [join_ref, null, topic, "presence_state", metas], 4);
      return;
    }
    if (event === "presence") {
      const p = payload as { event: string; payload?: Record<string, unknown> };
      const key = "u1";
      const state = this.presence.get(topic) ?? {};
      if (p.event === "track") state[key] = [{ ...(p.payload ?? {}), phx_ref: `r${Date.now()}` }];
      else delete state[key];
      this.presence.set(topic, state);
      reply();
      const diff =
        p.event === "track"
          ? { joins: { [key]: { metas: state[key] } }, leaves: {} }
          : { joins: {}, leaves: { [key]: { metas: [{ phx_ref: "x" }] } } };
      for (const s of this.sockets) this.deliver(s, [null, null, topic, "presence_diff", diff], 4);
      return;
    }
    // heartbeat, phx_leave, access_token…
    reply();
  }
}

let server = new FakeServer();

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  bufferedAmount = 0;
  binaryType = "arraybuffer";
  /** Ouverte pour le navigateur, morte pour le réseau : envois perdus, rien ne revient. */
  zombie = false;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public url: string) {
    server.sockets.push(this);
    log(`ws#${server.sockets.length} ouverture`);
    setTimeout(() => {
      this.readyState = 1;
      log(`ws#${this.id()} OPEN`);
      this.onopen?.({});
    }, 5);
  }
  id() {
    return server.sockets.indexOf(this) + 1;
  }
  send(data: string) {
    if (this.readyState !== 1) throw new Error("send sur socket non ouverte");
    if (this.zombie) {
      // Comme un vrai navigateur : les octets s'accumulent sans partir.
      this.bufferedAmount += data.length;
      log(`ws#${this.id()} (zombie) envoi perdu`);
      return;
    }
    server.handle(this, JSON.parse(data));
  }
  close(code?: number, reason?: string) {
    if (this.readyState >= 2) return;
    log(`ws#${this.id()} close(${code ?? ""}, ${reason ?? ""})`);
    this.readyState = 2;
    setTimeout(() => {
      this.readyState = 3;
      this.onclose?.({ code: code ?? 1000, reason, wasClean: true });
    }, 5);
  }
  /** Coupure réseau : fermée par le serveur, le navigateur reçoit onclose. */
  kill() {
    this.readyState = 3;
    log(`ws#${this.id()} KILL (onclose 1006)`);
    this.onclose?.({ code: 1006, reason: "", wasClean: false });
  }
}

// `visibilitychange` est émis sur le document et remonte jusqu'à window :
// realtime-js l'écoute sur window, le hook sur document.
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

let clientCourant: SupabaseClient | null = null;

function makeClient() {
  const rt = new RealtimeClient("ws://test/realtime/v1", {
    transport: FakeWebSocket as never,
    params: { apikey: "test" },
  });
  const supabase = {
    channel: (t: string, o?: unknown) => rt.channel(t, o as never),
    removeChannel: (c: unknown) => rt.removeChannel(c as never),
    realtime: rt,
  } as unknown as SupabaseClient;
  holder.client = supabase;
  clientCourant = supabase;
  return supabase;
}

type Marks = { subscribed: number[]; syncs: number[] };

let vueCourante: ReturnType<typeof render> | null = null;

/** Le strict équivalent de PresenceProvider : un canal de présence, recréé à chaque epoch. */
async function monterPresence(supabase: SupabaseClient, marks: Marks) {
  function Presence() {
    const epoch = useReconnectEpoch();
    useEffect(() => {
      const gen = marks.subscribed.length + 1;
      return openRealtimeChannel(
        supabase,
        "presence:app",
        (ch) => {
          ch.on("presence", { event: "sync" }, () => {
            marks.syncs.push(Date.now() - t0);
            log(`canal#${gen} sync → ${JSON.stringify(Object.keys(ch.presenceState()))}`);
          });
          ch.subscribe(async (status) => {
            log(`canal#${gen} statut ${status}`);
            if (status !== "SUBSCRIBED") return;
            marks.subscribed.push(Date.now() - t0);
            await ch.track({ user_id: "u1", last_active_at: new Date().toISOString() });
          });
          return ch;
        },
        { config: { presence: { key: "u1" } } },
      );
    }, [epoch]);
    return null;
  }
  vueCourante = render(createElement(Presence));
  await avancer(100);
  expect(marks.subscribed, journal.join("\n")).toHaveLength(1);
}

// Par petits pas, un `act` à chaque fois : React ne rend qu'à la fin d'un
// `act`, et le canal créé à ce moment-là a besoin que le temps continue
// d'avancer pour que sa socket s'ouvre et que le serveur réponde.
async function avancer(ms: number) {
  for (let ecoule = 0; ecoule < ms; ecoule += 100) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(100, ms - ecoule));
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  t0 = Date.now();
  journal.length = 0;
  server = new FakeServer();
  __resetRealtimeChannels();
  setVisibility("visible");
});

afterEach(async () => {
  // Les écouteurs `visibilitychange` de realtime-js sont branchés sur window
  // pour la vie de la page : un client laissé connecté se réveillerait au
  // test suivant. On le ferme proprement — `closeWasClean` — pour qu'il
  // reste inerte.
  vueCourante?.unmount();
  vueCourante = null;
  await avancer(300);
  void clientCourant?.realtime.disconnect();
  clientCourant = null;
  await avancer(500);
  vi.useRealTimers();
});

describe("reprise du canal de présence au réveil", () => {
  it("socket zombie : la présence repart en quelques secondes, sur une socket neuve", async () => {
    const supabase = makeClient();
    const marks: Marks = { subscribed: [], syncs: [] };
    await monterPresence(supabase, marks);

    setVisibility("hidden");
    await avancer(30_000);
    // Le réseau a lâché sans que le navigateur le sache.
    server.sockets[0].zombie = true;

    const reprise = Date.now() - t0;
    log("=== retour au premier plan ===");
    setVisibility("visible");
    await avancer(5_000);

    expect(marks.subscribed, journal.join("\n")).toHaveLength(2);
    expect(server.sockets, "une socket neuve doit avoir été ouverte").toHaveLength(2);
    // Sans fermeture explicite de la socket, c'était 52 s.
    expect(marks.subscribed[1] - reprise).toBeLessThan(3_000);
    // Et la présence est bien synchronisée sur le nouveau canal.
    expect(marks.syncs.some((t) => t > reprise)).toBe(true);
  });

  it("socket fermée pendant l'absence : la présence repart aussitôt au retour", async () => {
    const supabase = makeClient();
    const marks: Marks = { subscribed: [], syncs: [] };
    await monterPresence(supabase, marks);

    setVisibility("hidden");
    await avancer(30_000);
    server.sockets[0].kill();
    // Page cachée : realtime-js refuse de se reconnecter et attend le retour.
    await avancer(120_000);
    expect(marks.subscribed, journal.join("\n")).toHaveLength(1);

    const reprise = Date.now() - t0;
    log("=== retour au premier plan ===");
    setVisibility("visible");
    await avancer(5_000);

    expect(marks.subscribed, journal.join("\n")).toHaveLength(2);
    expect(marks.subscribed[1] - reprise).toBeLessThan(3_000);
  });

  it("socket saine : le réveil recrée quand même le canal, sans erreur ni doublon", async () => {
    const supabase = makeClient();
    const marks: Marks = { subscribed: [], syncs: [] };
    await monterPresence(supabase, marks);

    setVisibility("hidden");
    await avancer(30_000);

    const reprise = Date.now() - t0;
    setVisibility("visible");
    await avancer(5_000);

    expect(marks.subscribed, journal.join("\n")).toHaveLength(2);
    expect(marks.subscribed[1] - reprise).toBeLessThan(3_000);
    expect(supabase.realtime.getChannels()).toHaveLength(1);
  });
});
