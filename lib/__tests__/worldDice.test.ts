import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DICE_MODES,
  MAX_DIE_NAME_LENGTH,
  MAX_FREE_FACES,
  MAX_ROLL_COUNT,
  MAX_WORLD_DICE,
  DIE_VALUE_LIMIT,
  MAX_DIE_FACES,
  STANDARD_DICE_FACES,
  dieFaceValues,
  dieFacesSchema,
  faceOf,
  removeFace,
  rollHidesNumbers,
  setFace,
  diceBlockFromRoll,
  diceRollErrorKey,
  diceRollOutcome,
  dieRangeLabel,
  parseFreeFormula,
  rollFormula,
  standardDie,
  standardFacesOf,
  worldDieInputSchema,
} from "@/lib/worldDice";

describe("dés standard", () => {
  it("d4 à d100, de 1 au nombre de faces", () => {
    expect(STANDARD_DICE_FACES).toEqual([4, 6, 8, 10, 12, 20, 100]);
    expect(standardDie(20)).toEqual({ name: "d20", min_value: 1, max_value: 20, hidden: false });
  });

  it("reconnaît un dé standard à sa plage et à son nom", () => {
    expect(standardFacesOf({ name: "d6", min_value: 1, max_value: 6 })).toBe(6);
    expect(standardFacesOf({ name: "D6", min_value: 1, max_value: 6 })).toBe(6);
    // Renommé, ou décalé : un dé personnalisé.
    expect(standardFacesOf({ name: "Dé de peur", min_value: 1, max_value: 6 })).toBeNull();
    expect(standardFacesOf({ name: "d6", min_value: 0, max_value: 5 })).toBeNull();
    expect(standardFacesOf({ name: "d7", min_value: 1, max_value: 7 })).toBeNull();
  });

  it("la plage s'écrit « min – max »", () => {
    expect(dieRangeLabel({ min_value: 1, max_value: 6 })).toBe("1 – 6");
    expect(dieRangeLabel({ min_value: -1, max_value: 1 })).toBe("-1 – 1");
  });
});

describe("worldDieInputSchema", () => {
  const ok = { name: "d6", min_value: 1, max_value: 6, hidden: false };

  it("accepte un dé valide et rogne son nom", () => {
    expect(worldDieInputSchema.parse({ ...ok, name: "  Dé de peur  " }).name).toBe("Dé de peur");
  });

  it("refuse un nom vide ou trop long", () => {
    expect(worldDieInputSchema.safeParse({ ...ok, name: "  " }).success).toBe(false);
    expect(worldDieInputSchema.safeParse({ ...ok, name: "x".repeat(MAX_DIE_NAME_LENGTH + 1) }).success).toBe(false);
  });

  it("refuse un minimum qui n'est pas sous le maximum", () => {
    expect(worldDieInputSchema.safeParse({ ...ok, min_value: 6, max_value: 6 }).success).toBe(false);
    expect(worldDieInputSchema.safeParse({ ...ok, min_value: 7, max_value: 6 }).success).toBe(false);
  });

  it("refuse les valeurs non entières ou hors bornes", () => {
    expect(worldDieInputSchema.safeParse({ ...ok, max_value: 6.5 }).success).toBe(false);
    expect(worldDieInputSchema.safeParse({ ...ok, max_value: DIE_VALUE_LIMIT + 1 }).success).toBe(false);
    expect(worldDieInputSchema.safeParse({ ...ok, min_value: -DIE_VALUE_LIMIT - 1 }).success).toBe(false);
  });

  it("refuse une clé inconnue", () => {
    expect(worldDieInputSchema.safeParse({ ...ok, world_id: "w2" }).success).toBe(false);
  });
});

describe("parseFreeFormula", () => {
  it("lit nDm, nDm+k, nDm-k", () => {
    expect(parseFreeFormula("1d20")).toEqual({ count: 1, faces: 20, modifier: 0 });
    expect(parseFreeFormula(" 2D6+3 ")).toEqual({ count: 2, faces: 6, modifier: 3 });
    expect(parseFreeFormula("1d8-1")).toEqual({ count: 1, faces: 8, modifier: -1 });
  });

  it("refuse ce qui n'est pas une formule, ou sort des bornes", () => {
    expect(parseFreeFormula("abc")).toBeNull();
    expect(parseFreeFormula("d6")).toBeNull();
    expect(parseFreeFormula("2x6")).toBeNull();
    expect(parseFreeFormula("0d6")).toBeNull();
    expect(parseFreeFormula("1d1")).toBeNull();
    expect(parseFreeFormula(`${MAX_ROLL_COUNT + 1}d6`)).toBeNull();
    expect(parseFreeFormula(`1d${MAX_FREE_FACES + 1}`)).toBeNull();
  });
});

describe("rollFormula", () => {
  const roll = { die_name: null as string | null, min_value: 1, max_value: 20, count: 1, modifier: 0 };

  it("une formule libre s'écrit nDm", () => {
    expect(rollFormula(roll)).toBe("1d20");
    expect(rollFormula({ ...roll, count: 2, max_value: 6, modifier: 3 })).toBe("2d6+3");
    expect(rollFormula({ ...roll, modifier: -2 })).toBe("1d20-2");
  });

  it("un dé du monde au nom standard s'écrit comme une formule", () => {
    expect(rollFormula({ ...roll, die_name: "d6", max_value: 6, count: 3, modifier: 1 })).toBe("3d6+1");
  });

  it("un dé personnalisé garde son nom", () => {
    const peur = { ...roll, die_name: "Dé de peur", min_value: 0, max_value: 5 };
    expect(rollFormula(peur)).toBe("Dé de peur");
    expect(rollFormula({ ...peur, count: 2, modifier: 3 })).toBe("2 × Dé de peur + 3");
    expect(rollFormula({ ...peur, modifier: -1 })).toBe("Dé de peur − 1");
  });
});

describe("diceRollOutcome", () => {
  const roll = { min_value: 1, max_value: 20, count: 1, results: [20] };

  it("un seul dé au maximum : critique ; au minimum : échec", () => {
    expect(diceRollOutcome(roll)).toBe("critical");
    expect(diceRollOutcome({ ...roll, results: [1] })).toBe("fumble");
    expect(diceRollOutcome({ ...roll, results: [12] })).toBeNull();
  });

  it("plusieurs dés : rien", () => {
    expect(diceRollOutcome({ ...roll, count: 2, results: [20, 20] })).toBeNull();
  });

  it("suit la plage du dé, pas 1", () => {
    expect(diceRollOutcome({ min_value: 0, max_value: 5, count: 1, results: [0] })).toBe("fumble");
  });
});

describe("diceBlockFromRoll", () => {
  it("le bloc du message désigne le lancer et en garde une copie lisible", () => {
    const block = diceBlockFromRoll(
      { id: "r1", die_name: null, min_value: 1, max_value: 6, count: 2, modifier: 3, results: [4, 5], total: 12 },
      "  Attaque ",
    );
    expect(block).toEqual({
      _type: "dice",
      roll_id: "r1",
      formula: "2d6+3",
      results: [4, 5],
      modifier: 3,
      total: 12,
      label: "Attaque",
    });
  });

  it("sans étiquette, pas de clé label", () => {
    const block = diceBlockFromRoll(
      { id: "r1", die_name: "d20", min_value: 1, max_value: 20, count: 1, modifier: 0, results: [7], total: 7 },
      "",
    );
    expect(block).not.toHaveProperty("label");
  });
});

describe("diceRollErrorKey", () => {
  it("traduit les refus de la base", () => {
    expect(diceRollErrorKey("dice_predefined_only")).toBe("predefinedOnly");
    expect(diceRollErrorKey("dice_hidden")).toBe("hidden");
    expect(diceRollErrorKey("dice_not_found")).toBe("notFound");
    expect(diceRollErrorKey("dice_invalid_count")).toBe("invalid");
    expect(diceRollErrorKey("dice_roll_locked")).toBe("locked");
    expect(diceRollErrorKey("autre chose")).toBe("failed");
  });
});

describe("migration 270", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/270_world_dice.sql"), "utf8");

  it("les bornes de la base suivent celles du code", () => {
    expect(sql).toMatch(new RegExp(`char_length\\(btrim\\(name\\)\\) BETWEEN 1 AND ${MAX_DIE_NAME_LENGTH}`));
    expect(sql).toMatch(new RegExp(`min_value BETWEEN -${DIE_VALUE_LIMIT} AND ${DIE_VALUE_LIMIT}`));
    expect(sql).toMatch(new RegExp(`count BETWEEN 1 AND ${MAX_ROLL_COUNT}`));
    expect(sql).toMatch(new RegExp(`p_faces NOT BETWEEN 2 AND ${MAX_FREE_FACES}`));
    expect(sql).toMatch(new RegExp(`>= ${MAX_WORLD_DICE}`));
  });

  it("les deux modes, libre par défaut ; un lancer figé par défaut", () => {
    expect(DICE_MODES).toEqual(["free", "predefined"]);
    expect(sql).toMatch(/dice_mode text NOT NULL DEFAULT 'free'/);
    expect(sql).toMatch(/dice_mode IN \('free', 'predefined'\)/);
    expect(sql).toMatch(/dice_allow_edit boolean NOT NULL DEFAULT false/);
  });

  it("les dés s'écrivent avec world.settings ; les lancers, par la fonction seule", () => {
    expect(sql).toMatch(/world_dice_insert[\s\S]*?has_world_permission\(world_id, \(SELECT auth\.uid\(\)\), 'world\.settings'\)/);
    expect(sql).toMatch(/GRANT SELECT ON public\.dice_rolls TO authenticated;/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*ON public\.dice_rolls/);
    expect(sql).toMatch(/RAISE EXCEPTION 'dice_predefined_only'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'dice_roll_locked'/);
  });
});

describe("faces d'un dé (migration 272)", () => {
  const IMG = "https://x.supabase.co/storage/v1/object/public/worlds/world-1/dice/a.webp";

  it("une face par valeur de la plage, jusqu'à 100 faces ; au-delà, pas d'images", () => {
    expect(dieFaceValues({ min_value: 1, max_value: 6 })).toEqual([1, 2, 3, 4, 5, 6]);
    expect(dieFaceValues({ min_value: -1, max_value: 1 })).toEqual([-1, 0, 1]);
    expect(dieFaceValues({ min_value: 1, max_value: MAX_DIE_FACES })).toHaveLength(MAX_DIE_FACES);
    expect(dieFaceValues({ min_value: 1, max_value: MAX_DIE_FACES + 1 })).toBeNull();
  });

  it("dieFacesSchema : une image http(s) par valeur, sans doublon", () => {
    expect(dieFacesSchema.safeParse([{ value: 1, image: IMG }, { value: 2, image: IMG, hide_value: true }]).success).toBe(true);
    expect(dieFacesSchema.safeParse([{ value: 1, image: IMG }, { value: 1, image: IMG }]).success).toBe(false);
    expect(dieFacesSchema.safeParse([{ value: 1, image: "javascript:alert(1)" }]).success).toBe(false);
    expect(dieFacesSchema.safeParse([{ value: 1.5, image: IMG }]).success).toBe(false);
    expect(dieFacesSchema.safeParse([{ value: 1, image: IMG, extra: 1 }]).success).toBe(false);
    const trop = Array.from({ length: MAX_DIE_FACES + 1 }, (_, i) => ({ value: i, image: IMG }));
    expect(dieFacesSchema.safeParse(trop).success).toBe(false);
  });

  it("setFace remplace ou ajoute, dans l'ordre des valeurs ; removeFace retire", () => {
    const faces = setFace(setFace([], { value: 3, image: IMG }), { value: 1, image: IMG });
    expect(faces.map((f) => f.value)).toEqual([1, 3]);
    expect(setFace(faces, { value: 3, image: IMG, hide_value: true })).toEqual([
      { value: 1, image: IMG },
      { value: 3, image: IMG, hide_value: true },
    ]);
    expect(removeFace(faces, 1)).toEqual([{ value: 3, image: IMG }]);
    expect(faceOf(faces, 3)?.image).toBe(IMG);
    expect(faceOf(faces, 2)).toBeUndefined();
    expect(faceOf(undefined, 2)).toBeUndefined();
  });

  it("un lancer cache ses nombres dès qu'une face tirée cache le sien", () => {
    const roll = { results: [1, 3], faces: [{ value: 1, image: IMG }, { value: 3, image: IMG, hide_value: true }] };
    expect(rollHidesNumbers(roll)).toBe(true);
    expect(rollHidesNumbers({ results: [1], faces: roll.faces })).toBe(false);
    expect(rollHidesNumbers({ results: [1], faces: undefined })).toBe(false);
  });
});

describe("migration 272", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/272_world_dice_faces.sql"), "utf8");

  it("les faces sont contrôlées par la base, aux mêmes bornes que le code", () => {
    expect(sql).toMatch(new RegExp(`jsonb_array_length\\(p_faces\\) > ${MAX_DIE_FACES}`));
    expect(sql).toMatch(/is_http_url\(/);
    expect(sql).toMatch(/GRANT UPDATE \(faces\) ON public\.world_dice TO authenticated;/);
  });

  it("le lancer copie les faces tirées ; le dossier dice/ du bucket s'ouvre avec world.settings", () => {
    expect(sql).toMatch(/INSERT INTO public\.dice_rolls \([^)]*faces/);
    expect(sql).toMatch(/\/dice\/'[\s\S]*?'world\.settings'/);
  });
});
