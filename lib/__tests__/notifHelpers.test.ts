import { describe, expect, it } from "vitest";
import { notifHref, notifText, compactTime, type NotifT } from "@/lib/notifHelpers";
import type { AppNotification } from "@/types/db";

function makeNotif(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n1",
    recipient_id: "u1",
    type: "mention",
    world_id: null,
    chat_id: null,
    message_id: null,
    actor_id: "a1",
    actor_name: "Alice",
    persona_id: null,
    content: null,
    metadata: null,
    read_at: null,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("notifHref", () => {
  it("priorise chat_id sur world_id", () => {
    expect(notifHref(makeNotif({ chat_id: "c1", world_id: "w1" }))).toBe("/c/c1");
  });

  it("retombe sur world_id si pas de chat_id", () => {
    expect(notifHref(makeNotif({ chat_id: null, world_id: "w1" }))).toBe("/w/w1");
  });

  it("renvoie null si ni chat_id ni world_id", () => {
    expect(notifHref(makeNotif({ chat_id: null, world_id: null }))).toBeNull();
  });
});

describe("notifText — à vous de jouer", () => {
  const calls: { key: string; values?: Record<string, unknown> }[] = [];
  const t = Object.assign((key: string) => key, {
    rich: (key: string, values?: Record<string, unknown>) => {
      calls.push({ key, values });
      return key;
    },
  }) as unknown as NotifT;

  it("nomme le salon où c'est votre tour, et y mène", () => {
    calls.length = 0;
    const n = makeNotif({ type: "turn_yours", chat_id: "c1", world_id: "w1", content: "La taverne" });
    notifText(n, t);
    expect(calls[0]).toMatchObject({ key: "text.turnYours", values: { chatroom: "La taverne" } });
    expect(notifHref(n)).toBe("/c/c1");
  });

  it("sans nom de salon : la phrase courte", () => {
    calls.length = 0;
    notifText(makeNotif({ type: "turn_yours", chat_id: "c1", content: null }), t);
    expect(calls[0].key).toBe("text.turnYoursNoName");
  });
});

describe("notifText — annonce d'un monde", () => {
  // Un `t` minimal : la clé et ses valeurs, pour voir ce qui est demandé.
  const calls: { key: string; values?: Record<string, unknown> }[] = [];
  const t = Object.assign((key: string) => key, {
    rich: (key: string, values?: Record<string, unknown>) => {
      calls.push({ key, values });
      return key;
    },
  }) as unknown as NotifT;

  it("nomme l'auteur et le titre de l'annonce", () => {
    calls.length = 0;
    notifText(makeNotif({ type: "world_announcement", world_id: "w1", content: "Rentrée" }), t);
    expect(calls[0]).toMatchObject({ key: "text.worldAnnouncement", values: { actor: "Alice", title: "Rentrée" } });
  });

  it("retombe sur un titre générique sans contenu", () => {
    calls.length = 0;
    notifText(makeNotif({ type: "world_announcement", world_id: "w1", content: null }), t);
    expect(calls[0].values?.title).toBe("announcement.fallbackTitle");
  });

  it("nomme l'essai d'un message privé, qui n'a pas de titre", () => {
    calls.length = 0;
    notifText(makeNotif({ type: "world_announcement", world_id: "w1", content: null, metadata: { test: true, kind: "message" } }), t);
    expect(calls[0].values?.title).toBe("announcement.testMessageTitle");
  });

  it("un message de bienvenue n'est pas une annonce : sa propre phrase", () => {
    calls.length = 0;
    notifText(makeNotif({ type: "world_announcement", world_id: "w1", content: "Bienvenue Lys", metadata: { welcome: true } }), t);
    expect(calls[0]).toMatchObject({ key: "text.worldWelcome", values: { actor: "Alice", title: "Bienvenue Lys" } });
  });
});

describe("compactTime", () => {
  it("affiche '< 1min' pour un instant très récent", () => {
    expect(compactTime(new Date().toISOString())).toBe("< 1min");
  });

  it("affiche les minutes en dessous d'une heure", () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(compactTime(iso)).toBe("5min");
  });

  it("affiche les heures en dessous d'un jour", () => {
    const iso = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(compactTime(iso)).toBe("3h");
  });

  it("affiche les jours avec l'abréviation fournie", () => {
    const iso = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(compactTime(iso, "j")).toBe("2j");
  });
});
