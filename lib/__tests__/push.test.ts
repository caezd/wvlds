import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { detacherAppareilDuPush, urlBase64ToUint8Array } from "@/lib/push";

// ──────────────────────────────────────────────────────────────────────────
// `push_subscriptions` associe un POINT D'ACCÈS de navigateur à un compte. Le
// point d'accès appartient au navigateur et survit à la déconnexion ; la ligne,
// elle, désigne une personne.
//
// Quitter son compte laissait donc la ligne en place : le serveur continuait
// d'envoyer les notifications de la personne partie vers ce navigateur, et
// quelqu'un s'y connectant ensuite recevait ses alertes — titre et corps
// compris, soit l'aperçu de ses messages.
// ──────────────────────────────────────────────────────────────────────────

/** Client Supabase minimal : retient la table et le point d'accès visés. */
function clientFactice(erreur: { message: string } | null = null) {
  const suppressions: { table: string; endpoint: string }[] = [];
  const client = {
    from: (table: string) => ({
      delete: () => ({
        eq: (_col: string, endpoint: string) => {
          suppressions.push({ table, endpoint });
          return Promise.resolve({ data: null, error: erreur });
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, suppressions };
}

/** Simule un navigateur abonné (ou non) aux notifications poussées. */
function simulerNavigateur(sub: { endpoint: string; unsubscribe: () => Promise<boolean> } | null) {
  vi.stubGlobal("navigator", {
    serviceWorker: {
      ready: Promise.resolve({ pushManager: { getSubscription: async () => sub } }),
    },
  });
  vi.stubGlobal("window", { PushManager: function () {} });
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("detacherAppareilDuPush", () => {
  it("retire la ligne serveur puis coupe l'abonnement du navigateur", async () => {
    const unsubscribe = vi.fn(async () => true);
    simulerNavigateur({ endpoint: "https://push.test/abc", unsubscribe });
    const { client, suppressions } = clientFactice();

    await detacherAppareilDuPush(client);

    expect(suppressions).toEqual([
      { table: "push_subscriptions", endpoint: "https://push.test/abc" },
    ]);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("ne coupe PAS le navigateur si la ligne n'a pas pu être retirée", async () => {
    // Sinon le serveur viserait un point d'accès mort indéfiniment : la ligne
    // reste, mais plus personne ne l'écoute.
    const unsubscribe = vi.fn(async () => true);
    simulerNavigateur({ endpoint: "https://push.test/abc", unsubscribe });
    const { client } = clientFactice({ message: "refusé" });

    await detacherAppareilDuPush(client);

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("ne fait rien quand le navigateur n'est pas abonné", async () => {
    simulerNavigateur(null);
    const { client, suppressions } = clientFactice();

    await detacherAppareilDuPush(client);

    expect(suppressions).toEqual([]);
  });

  it("ne lève jamais, même sans support du navigateur", async () => {
    // Une déconnexion ne doit pas échouer parce qu'un désabonnement a échoué.
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", {});
    const { client } = clientFactice();

    await expect(detacherAppareilDuPush(client)).resolves.toBeUndefined();
  });

  it("ne lève pas non plus si le navigateur rejette", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.reject(new Error("pas de service worker")) },
    });
    vi.stubGlobal("window", { PushManager: function () {} });
    const { client } = clientFactice();

    await expect(detacherAppareilDuPush(client)).resolves.toBeUndefined();
  });
});

describe("urlBase64ToUint8Array", () => {
  it("décode une chaîne base64url standard", () => {
    // "hello" en base64url
    const bytes = urlBase64ToUint8Array("aGVsbG8=");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it("gère les caractères -/_ propres au base64url", () => {
    // octets [251, 255, 191] -> base64 standard "-/-/" contient +/, base64url remplace par -_
    const bytes = urlBase64ToUint8Array("-_-_");
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("gère une chaîne sans padding requis", () => {
    const bytes = urlBase64ToUint8Array("YQ");
    expect(Array.from(bytes)).toEqual([97]); // "a"
  });

  it("renvoie un tableau vide pour une chaîne vide", () => {
    expect(urlBase64ToUint8Array("").length).toBe(0);
  });

  it("rend un tampon non partagé, exigé par PushManager.subscribe", () => {
    // `new Uint8Array(length)` plutôt que `Uint8Array.from` : les lib DOM
    // récentes refusent un `ArrayBufferLike` partagé.
    expect(urlBase64ToUint8Array("SGVsbG8").buffer).toBeInstanceOf(ArrayBuffer);
  });
});
