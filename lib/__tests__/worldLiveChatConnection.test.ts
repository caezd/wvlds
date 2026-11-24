import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_LIVE_CHAT_CONNECTION,
  LIVE_CHAT_IDLE_PRESETS,
  liveChatConnectionOf,
  liveChatIdleDeadline,
  liveChatSessionsOn,
} from "@/lib/worldLiveChatConnection";

describe("liveChatConnectionOf", () => {
  it("lit les trois réglages d'une ligne `worlds`", () => {
    expect(
      liveChatConnectionOf({ live_chat_join_mode: "button", live_chat_idle_minutes: 15, live_chat_offline_view: "read" }),
    ).toEqual({ joinMode: "button", idleMinutes: 15, offlineView: "read" });
  });

  it("absents ou inconnus : connexion à l'arrivée, jamais déconnecté, rien sans connexion", () => {
    expect(liveChatConnectionOf(null)).toEqual(DEFAULT_LIVE_CHAT_CONNECTION);
    expect(DEFAULT_LIVE_CHAT_CONNECTION).toEqual({ joinMode: "auto", idleMinutes: null, offlineView: "none" });
    expect(
      liveChatConnectionOf({ live_chat_join_mode: "x", live_chat_idle_minutes: 0, live_chat_offline_view: "y" } as never),
    ).toEqual(DEFAULT_LIVE_CHAT_CONNECTION);
  });
});

describe("liveChatSessionsOn", () => {
  it("la connexion n'est tenue qu'avec le bouton Rejoindre ou un délai d'inactivité", () => {
    expect(liveChatSessionsOn(DEFAULT_LIVE_CHAT_CONNECTION)).toBe(false);
    expect(liveChatSessionsOn({ ...DEFAULT_LIVE_CHAT_CONNECTION, joinMode: "button" })).toBe(true);
    expect(liveChatSessionsOn({ ...DEFAULT_LIVE_CHAT_CONNECTION, idleMinutes: 10 })).toBe(true);
  });
});

describe("liveChatIdleDeadline", () => {
  it("la dernière activité plus le délai, en millisecondes", () => {
    expect(liveChatIdleDeadline("2026-11-24T10:00:00Z", 15)).toBe(Date.parse("2026-11-24T10:15:00Z"));
  });

  it("sans délai, pas d'échéance", () => {
    expect(liveChatIdleDeadline("2026-11-24T10:00:00Z", null)).toBeNull();
  });
});

describe("migration 244", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/244_world_live_chat_sessions.sql"), "utf8");

  it("les paliers proposés tiennent dans les bornes de la base", () => {
    expect(sql).toMatch(/live_chat_idle_minutes BETWEEN 1 AND 1440/);
    for (const p of LIVE_CHAT_IDLE_PRESETS) expect(p >= 1 && p <= 1440).toBe(true);
  });

  it("les défauts de la base sont ceux de l'interface", () => {
    expect(sql).toMatch(/live_chat_join_mode\s+text\s+NOT NULL DEFAULT 'auto'/);
    expect(sql).toMatch(/live_chat_offline_view text\s+NOT NULL DEFAULT 'none'/);
  });
});
