import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  GAIN_KINDS,
  MAX_GAIN,
  MAX_GAIN_COOLDOWN_MINUTES,
  cappedGain,
  dayStartLabel,
  gainSettingsOf,
  gainSettingsSchema,
  worldHasDailyGain,
  worldHasGains,
} from "@/lib/worldGains";

describe("worldHasGains", () => {
  it("l'économie suffit : un gain à zéro ne paie rien", () => {
    expect(worldHasGains({ enable_economy: true })).toBe(true);
    expect(worldHasGains({ enable_economy: false })).toBe(false);
    expect(worldHasGains(null)).toBe(false);
  });
});

describe("gainSettingsOf", () => {
  it("lit les colonnes du monde, zéro et sans plafond par défaut", () => {
    expect(gainSettingsOf({})).toEqual({
      gain_message: 0,
      gain_scene_created: 0,
      gain_scene_joined: 0,
      gain_scene_completed: 0,
      gain_daily_login: 0,
      gain_message_cooldown: 0,
      gain_daily_cap: null,
    });
    // Les bigint arrivent parfois en chaîne.
    expect(gainSettingsOf({ gain_message: "5" as unknown as number, gain_daily_cap: "100" as unknown as number })).toMatchObject({
      gain_message: 5,
      gain_daily_cap: 100,
    });
  });
});

describe("gainSettingsSchema", () => {
  const ok = {
    gain_message: 5,
    gain_scene_created: 20,
    gain_scene_joined: 10,
    gain_scene_completed: 50,
    gain_daily_login: 3,
    gain_message_cooldown: 2,
    gain_daily_cap: null,
  };
  it("accepte des montants entiers positifs, un délai en minutes, un plafond facultatif", () => {
    expect(gainSettingsSchema.safeParse(ok).success).toBe(true);
    expect(gainSettingsSchema.safeParse({ ...ok, gain_daily_cap: 200 }).success).toBe(true);
  });
  it("refuse le négatif, le décimal, un délai trop long, une colonne inconnue", () => {
    expect(gainSettingsSchema.safeParse({ ...ok, gain_message: -MAX_GAIN - 1 }).success).toBe(false);
    expect(gainSettingsSchema.safeParse({ ...ok, gain_daily_cap: -1 }).success).toBe(false);
    expect(gainSettingsSchema.safeParse({ ...ok, gain_message_cooldown: -1 }).success).toBe(false);
    expect(gainSettingsSchema.safeParse({ ...ok, gain_message: 1.5 }).success).toBe(false);
    expect(gainSettingsSchema.safeParse({ ...ok, gain_message_cooldown: MAX_GAIN_COOLDOWN_MINUTES + 1 }).success).toBe(false);
    expect(gainSettingsSchema.safeParse({ ...ok, enable_gains: true }).success).toBe(false);
  });
});

describe("gains négatifs (migration 261)", () => {
  it("un gain peut retirer : chaque montant accepte un négatif", () => {
    const zero = gainSettingsOf({});
    for (const kind of GAIN_KINDS) {
      expect(gainSettingsSchema.safeParse({ ...zero, [`gain_${kind}`]: -5 }).success).toBe(true);
    }
  });

  it("la connexion du jour se réclame dès que son montant n'est pas nul, gain ou perte", () => {
    expect(worldHasDailyGain({ enable_economy: true, gain_daily_login: 5 })).toBe(true);
    expect(worldHasDailyGain({ enable_economy: true, gain_daily_login: -5 })).toBe(true);
    expect(worldHasDailyGain({ enable_economy: true, gain_daily_login: 0 })).toBe(false);
    expect(worldHasDailyGain({ enable_economy: false, gain_daily_login: 5 })).toBe(false);
  });

  it("le plafond ne rogne pas une perte", () => {
    expect(cappedGain(-10, 100, 100)).toBe(-10);
  });

  const sql = readFileSync(path.join(process.cwd(), "migrations/261_world_gains_negative.sql"), "utf8");

  it("la base accepte les montants négatifs, pas le plafond ni le délai", () => {
    expect(sql).toMatch(/gain_message BETWEEN -1000000000000 AND 1000000000000/);
    expect(sql).toMatch(/gain_daily_cap IS NULL OR gain_daily_cap BETWEEN 0 AND 1000000000000/);
    expect(sql).toMatch(/gain_message_cooldown BETWEEN 0 AND 1440/);
  });

  it("une perte ne vide la bourse que jusqu'à zéro ; le plafond ne compte que ce qui est gagné", () => {
    expect(sql).toMatch(/IF v_amount = 0 THEN\s+RETURN 0;/);
    expect(sql).toMatch(/v_amount := GREATEST\(v_amount, -v_balance\)/);
    expect(sql).toMatch(/sum\(GREATEST\(l\.delta, 0\)\)/);
    expect(sql).toMatch(/IF v_amount > 0 AND w\.gain_daily_cap IS NOT NULL THEN/);
  });

  it("les déclencheurs se réveillent pour un montant non nul", () => {
    expect(sql).toMatch(/w\.gain_message <> 0 OR w\.gain_scene_joined <> 0 OR w\.gain_scene_created <> 0/);
    expect(sql).toMatch(/w\.gain_scene_completed <> 0/);
    expect(sql).toMatch(/w\.gain_daily_login <> 0/);
    const triggers = sql.match(/CREATE OR REPLACE FUNCTION public\.tg_[a-z_]*gains?[a-z_]*\(\)[\s\S]*?\$\$;/g) ?? [];
    expect(triggers.length).toBe(2);
    for (const body of triggers) expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
  });
});

describe("cappedGain", () => {
  it("sans plafond, tout le gain", () => {
    expect(cappedGain(10, 500, null)).toBe(10);
  });
  it("le plafond du jour rogne le gain, puis l'annule", () => {
    expect(cappedGain(10, 95, 100)).toBe(5);
    expect(cappedGain(10, 100, 100)).toBe(0);
    expect(cappedGain(10, 120, 100)).toBe(0);
  });
});

describe("migration 252", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/252_world_gains.sql"), "utf8");

  it("l'option et les montants, coupés ou nuls par défaut", () => {
    expect(sql).toMatch(/enable_gains\s+boolean\s+NOT NULL DEFAULT false/);
    for (const kind of GAIN_KINDS) {
      expect(sql).toMatch(new RegExp(`gain_${kind}\\s+bigint\\s+NOT NULL DEFAULT 0`));
    }
    expect(sql).toMatch(/gain_daily_cap\s+bigint\b(?!\s+NOT NULL)/);
  });

  it("chaque gain a son genre dans le journal", () => {
    expect(sql).toMatch(
      /kind IN \('adjust', 'slots', 'purchase', 'sale', 'transfer', 'gain_message', 'gain_scene_created', 'gain_scene_joined', 'gain_scene_completed', 'gain_daily_login'\)/,
    );
  });

  it("un gain ne bloque jamais un message ni un salon", () => {
    const triggers = sql.match(/CREATE OR REPLACE FUNCTION public\.tg_[a-z_]*gains?[a-z_]*\(\)[\s\S]*?\$\$;/g) ?? [];
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    for (const body of triggers) expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
  });

  it("les marques de paiement ne se lisent ni ne s'écrivent hors de la base", () => {
    expect(sql).toMatch(/ALTER TABLE public\.world_gain_marks ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON public\.world_gain_marks/);
  });

  it("le gain quotidien n'est ouvert qu'aux connectés", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.claim_daily_gain\(uuid\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_daily_gain\(uuid\) TO authenticated;/);
  });
});

describe("migration 253", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/253_world_gains_amounts_only.sql"), "utf8");

  it("redéfinit les quatre fonctions des gains", () => {
    for (const fn of ["economy_gain", "tg_chat_message_gains", "tg_chatroom_gains", "claim_daily_gain"]) {
      expect(sql).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
    }
  });

  it("un gain ne bloque toujours ni un message ni un salon", () => {
    const triggers = sql.match(/CREATE OR REPLACE FUNCTION public\.tg_[a-z_]*gains?[a-z_]*\(\)[\s\S]*?\$\$;/g) ?? [];
    expect(triggers.length).toBe(2);
    for (const body of triggers) expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
  });
});

describe("dayStartLabel", () => {
  it("dit à quelle heure locale commence la journée des gains (minuit UTC)", () => {
    const hiver = new Date("2026-11-25T15:00:00Z");
    const ete = new Date("2026-07-14T15:00:00Z");
    expect(dayStartLabel("fr", hiver, "Europe/Paris")).toBe("01:00");
    expect(dayStartLabel("fr", ete, "Europe/Paris")).toBe("02:00");
    expect(dayStartLabel("fr", hiver, "UTC")).toBe("00:00");
    expect(dayStartLabel("fr", hiver, "America/Montreal")).toBe("19:00");
  });
});
