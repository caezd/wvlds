import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { openRealtimeChannel, __resetRealtimeChannels } from "@/lib/realtimeChannel";

// ──────────────────────────────────────────────────────────────────────────
// `openRealtimeChannel` n'avait aucun test, et c'est ce qui a laissé passer
// un défaut visible par tous les utilisateurs.
//
// Le module a deux chemins : l'ouverture IMMÉDIATE, de loin la plus fréquente,
// et l'ouverture DIFFÉRÉE quand une fermeture du même nom est encore en vol.
// Seul le second transmettait les `options` à `supabase.channel()`.
//
// Les options d'un canal de présence portent la clé sous laquelle on
// s'annonce : `{ config: { presence: { key: userId } } }`. Perdue, Supabase
// retombe sur un identifiant aléatoire — la présence est bien diffusée, mais
// rangée sous une clé que personne ne cherche. `getUserPresence(userId)` ne
// trouvait donc jamais rien, et TOUT LE MONDE apparaissait hors ligne, y
// compris soi-même.
//
// Constaté dans les trames WebSocket d'un vrai navigateur :
//   phx_join … "presence":{"key":"","enabled":true}
//   presence_state {"49ade744-a47c-11f1-…": …}   ← une clé aléatoire
//
// Le canal de salon perdait en outre `broadcast: { self: false }`, donc
// recevait ses propres diffusions.
// ──────────────────────────────────────────────────────────────────────────

/** Client minimal : note les appels à `channel()` avec leurs options. */
function clientFactice(fermetureLente = false) {
  const appels: { topic: string; options: unknown }[] = [];
  let resoudreFermeture: (() => void) | null = null;
  const client = {
    channel: vi.fn((topic: string, options?: unknown) => {
      appels.push({ topic, options });
      return { topic, options } as never;
    }),
    removeChannel: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          if (fermetureLente) resoudreFermeture = resolve;
          else resolve();
        }),
    ),
  } as unknown as SupabaseClient;
  return { client, appels, terminerFermeture: () => resoudreFermeture?.() };
}

const OPTIONS = { config: { presence: { key: "u1" }, broadcast: { self: false } } };

beforeEach(() => {
  __resetRealtimeChannels();
  vi.clearAllMocks();
});

describe("openRealtimeChannel", () => {
  it("transmet les options à l'ouverture immédiate", () => {
    // LE défaut. C'est le chemin courant : sans fermeture en vol, toute
    // ouverture passait ici, et la clé de présence était perdue.
    const { client, appels } = clientFactice();

    openRealtimeChannel(client, "presence:app", (c) => c, OPTIONS);

    expect(appels).toHaveLength(1);
    expect(appels[0].topic).toBe("presence:app");
    expect(appels[0].options).toEqual(OPTIONS);
  });

  it("transmet les options à l'ouverture différée", async () => {
    const { client, appels, terminerFermeture } = clientFactice(true);

    const fermer = openRealtimeChannel(client, "presence:app", (c) => c, OPTIONS);
    fermer(); // une fermeture est maintenant en vol
    openRealtimeChannel(client, "presence:app", (c) => c, OPTIONS);

    terminerFermeture();
    await new Promise((r) => setTimeout(r, 0));

    expect(appels).toHaveLength(2);
    for (const a of appels) expect(a.options).toEqual(OPTIONS);
  });

  it("ouvre sans options quand l'appelant n'en fournit pas", () => {
    const { client, appels } = clientFactice();
    openRealtimeChannel(client, "sidebar-rooms:w1", (c) => c);
    expect(appels[0].options).toBeUndefined();
  });

  it("garde le nom du canal intact — c'est le point de rendez-vous", () => {
    // Le rendre unique isolerait chaque navigateur dans son propre canal et
    // plus personne ne verrait personne.
    const { client, appels } = clientFactice();
    openRealtimeChannel(client, "presence:app", (c) => c, OPTIONS);
    openRealtimeChannel(client, "presence:app", (c) => c, OPTIONS);
    expect(appels.map((a) => a.topic)).toEqual(["presence:app", "presence:app"]);
  });

  it("attend la fermeture précédente avant de rouvrir le même nom", async () => {
    // Sans cela, `supabase.channel()` rend l'ANCIEN canal encore enregistré et
    // les `.on()` s'ajoutent aux bindings existants : chaque message entrant
    // finit traité deux fois.
    const { client, appels, terminerFermeture } = clientFactice(true);

    const fermer = openRealtimeChannel(client, "chat:1", (c) => c);
    expect(appels).toHaveLength(1);
    fermer();

    openRealtimeChannel(client, "chat:1", (c) => c);
    // Rien ne s'ouvre tant que la fermeture n'est pas terminée.
    expect(appels).toHaveLength(1);

    terminerFermeture();
    await new Promise((r) => setTimeout(r, 0));
    expect(appels).toHaveLength(2);
  });

  it("referme bien un canal ouvert de façon différée", async () => {
    // Il faut LAISSER l'ouverture différée aboutir avant de refermer : sinon
    // rien n'a été ouvert, et ne rien fermer est le comportement correct —
    // c'est ce que vérifie le test suivant.
    const { client, terminerFermeture } = clientFactice(true);

    const fermer1 = openRealtimeChannel(client, "chat:1", (c) => c);
    fermer1();
    const fermer2 = openRealtimeChannel(client, "chat:1", (c) => c);

    terminerFermeture();
    await new Promise((r) => setTimeout(r, 0));

    fermer2();
    await new Promise((r) => setTimeout(r, 0));

    expect(vi.mocked(client.removeChannel)).toHaveBeenCalledTimes(2);
  });

  it("ne construit rien si l'appelant se retire pendant l'attente", async () => {
    const { client, appels, terminerFermeture } = clientFactice(true);

    const fermer = openRealtimeChannel(client, "chat:1", (c) => c);
    fermer();
    const fermer2 = openRealtimeChannel(client, "chat:1", (c) => c);
    fermer2(); // démontage avant que la fermeture précédente ne s'achève

    terminerFermeture();
    await new Promise((r) => setTimeout(r, 0));

    expect(appels).toHaveLength(1);
  });
});
