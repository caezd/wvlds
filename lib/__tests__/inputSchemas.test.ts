import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  hexColorSchema,
  httpUrl,
  httpUrlSchema,
  idSchema,
  INPUT_LIMITS,
  longTextSchema,
  lucideIconSchema,
  parseInput,
  parseInputOrThrow,
  shortTextSchema,
} from "@/lib/inputSchemas";
import { ERR_VALEUR_NON_SUPPORTEE } from "@/lib/actionErrors";

// ──────────────────────────────────────────────────────────────────────────
// Les briques partagées par les actions serveur. Ce qui compte ici n'est pas
// zod — c'est que chaque brique refuse exactement ce qu'une contrainte de la
// base refuserait (migrations 126 et 171), et rien de plus : un refus côté
// action qui ne correspondrait à rien en base serait une régression
// fonctionnelle, un laxisme côté action ferait remonter l'erreur Postgres.
// ──────────────────────────────────────────────────────────────────────────

const ok = (schema: z.ZodType, v: unknown) => schema.safeParse(v).success;

describe("httpUrlSchema", () => {
  it("accepte http et https", () => {
    expect(ok(httpUrlSchema, "https://x.test/a.png")).toBe(true);
    expect(ok(httpUrlSchema, "http://x.test/a.png")).toBe(true);
  });

  it("refuse tout autre protocole — javascript: et data: en tête", () => {
    // `new URL("javascript:alert(1)")` est VALIDE : un `z.url()` nu l'aurait
    // laissé passer, et il aurait fini dans un href.
    expect(ok(httpUrlSchema, "javascript:alert(1)")).toBe(false);
    expect(ok(httpUrlSchema, "JavaScript:alert(1)")).toBe(false);
    expect(ok(httpUrlSchema, "data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(ok(httpUrlSchema, "vbscript:x")).toBe(false);
    expect(ok(httpUrlSchema, "file:///etc/passwd")).toBe(false);
  });

  it("refuse ce qui n'est pas une URL, ou qui dépasse la borne de la base", () => {
    expect(ok(httpUrlSchema, "pas-une-url")).toBe(false);
    expect(ok(httpUrlSchema, "")).toBe(false);
    expect(ok(httpUrlSchema, "https://x.test/" + "a".repeat(INPUT_LIMITS.url))).toBe(false);
  });
});

describe("httpUrl(message)", () => {
  it("garde la restriction de protocole, avec le message du formulaire", () => {
    const schema = httpUrl("URL d'asset invalide");
    expect(ok(schema, "https://cdn.test/a.png")).toBe(true);
    const res = schema.safeParse("javascript:alert(1)");
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("URL d'asset invalide");
  });
});

describe("hexColorSchema", () => {
  it("accepte les deux formes des sélecteurs", () => {
    expect(ok(hexColorSchema, "#1f2937")).toBe(true);
    expect(ok(hexColorSchema, "#ABC")).toBe(true);
  });

  it("refuse tout ce qui pourrait être autre chose qu'une couleur", () => {
    expect(ok(hexColorSchema, "red")).toBe(false);
    expect(ok(hexColorSchema, "#12345")).toBe(false);
    expect(ok(hexColorSchema, "#1f2937; background: url(x)")).toBe(false);
    expect(ok(hexColorSchema, "")).toBe(false);
  });
});

describe("textes", () => {
  it("shortText : élagué, non vide, au plus 200", () => {
    expect(shortTextSchema.parse("  Port  ")).toBe("Port");
    expect(ok(shortTextSchema, "   ")).toBe(false);
    expect(ok(shortTextSchema, "x".repeat(INPUT_LIMITS.shortText))).toBe(true);
    expect(ok(shortTextSchema, "x".repeat(INPUT_LIMITS.shortText + 1))).toBe(false);
  });

  it("longText : peut être vide, au plus 5000", () => {
    expect(ok(longTextSchema, "")).toBe(true);
    expect(ok(longTextSchema, "x".repeat(INPUT_LIMITS.longText + 1))).toBe(false);
  });

  it("refuse ce qui n'est pas une chaîne — un null faisait tomber .trim()", () => {
    expect(ok(shortTextSchema, null)).toBe(false);
    expect(ok(longTextSchema, 42)).toBe(false);
    expect(ok(idSchema, undefined)).toBe(false);
  });
});

describe("idSchema", () => {
  it("laisse la base juger du format, mais écarte l'absurde", () => {
    expect(ok(idSchema, "w1")).toBe(true);
    expect(ok(idSchema, "8c1b0e5e-2c1a-4f2e-9b1a-6f8a0c3d2e11")).toBe(true);
    expect(ok(idSchema, "")).toBe(false);
    expect(ok(idSchema, "x".repeat(INPUT_LIMITS.id + 1))).toBe(false);
  });
});

describe("lucideIconSchema", () => {
  it("n'accepte que des noms d'icônes", () => {
    expect(ok(lucideIconSchema, "map-pin")).toBe(true);
    expect(ok(lucideIconSchema, "MapPin")).toBe(false);
    expect(ok(lucideIconSchema, "<svg onload=alert(1)>")).toBe(false);
  });
});

describe("parseInput / parseInputOrThrow", () => {
  const schema = z.strictObject({ label: shortTextSchema });

  it("rend les données lues, transformées", () => {
    const res = parseInput(schema, { label: "  a  " });
    expect(res).toEqual({ ok: true, data: { label: "a" } });
  });

  it("rend le code d'erreur partagé, jamais le détail de zod", () => {
    // Le code est traduit par le client ; un message zod arriverait en anglais
    // dans un toast, et décrirait la structure interne de l'action.
    const res = parseInput(schema, { label: "" });
    expect(res).toEqual({ ok: false, error: ERR_VALEUR_NON_SUPPORTEE });
  });

  it("refuse une clé de trop — c'est un appel forgé, pas une étourderie", () => {
    expect(parseInput(schema, { label: "a", world_id: "autre" }).ok).toBe(false);
    expect(() => parseInputOrThrow(schema, { label: "a", world_id: "autre" })).toThrow(ERR_VALEUR_NON_SUPPORTEE);
  });

  it("parseInputOrThrow rend les données quand tout va bien", () => {
    expect(parseInputOrThrow(schema, { label: "a" })).toEqual({ label: "a" });
  });
});
