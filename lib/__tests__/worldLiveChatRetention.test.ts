import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_LIVE_CHAT_RETENTION,
  LIVE_CHAT_RETENTION_MAX,
  LIVE_CHAT_RETENTION_PRESETS,
  isLiveChatRetention,
  resolveLiveChatRetention,
} from "@/lib/worldLiveChatRetention";

describe("worldLiveChatRetention", () => {
  it("reconnaît les seuls paliers proposés", () => {
    expect(isLiveChatRetention(50)).toBe(true);
    expect(isLiveChatRetention(500)).toBe(false);
    expect(isLiveChatRetention("50")).toBe(false);
  });

  it("une valeur absente vaut le défaut en base", () => {
    expect(resolveLiveChatRetention(null)).toBe(100);
    expect(resolveLiveChatRetention(undefined)).toBe(DEFAULT_LIVE_CHAT_RETENTION);
  });

  it("une valeur hors paliers prend le palier inférieur, jamais au-dessus", () => {
    expect(resolveLiveChatRetention(500)).toBe(100);
    expect(resolveLiveChatRetention(75)).toBe(50);
    expect(resolveLiveChatRetention(25)).toBe(25);
  });

  it("les paliers tiennent dans la contrainte de la migration 240, plafond compris", () => {
    const sql = readFileSync(path.join(process.cwd(), "migrations/240_world_live_chat_retention_cap.sql"), "utf8");
    const borne = sql.match(/live_chat_retention BETWEEN (\d+) AND (\d+)/);
    expect(borne).not.toBeNull();
    const [min, max] = [Number(borne![1]), Number(borne![2])];
    for (const p of LIVE_CHAT_RETENTION_PRESETS) {
      expect(p).toBeGreaterThanOrEqual(min);
      expect(p).toBeLessThanOrEqual(max);
    }
    expect(max).toBe(LIVE_CHAT_RETENTION_MAX);
    expect(sql).toMatch(new RegExp(`live_chat_retention SET DEFAULT ${DEFAULT_LIVE_CHAT_RETENTION}\\b`));
  });
});
