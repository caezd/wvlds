import { describe, expect, it } from "vitest";
import { notifHref, compactTime } from "@/lib/notifHelpers";
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
