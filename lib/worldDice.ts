import { z } from "zod";

import type { DiceBlock } from "@/lib/chat-blocks";
import { httpUrlSchema } from "@/lib/inputSchemas";

// Les dés d'un monde (migration 270). Miroir des bornes de la base : un
// changement ici en appelle un dans migrations/270_world_dice.sql (contrôlé
// par lib/__tests__/worldDice.test.ts).

/** Les faces des dés standard, proposés en un geste. */
export const STANDARD_DICE_FACES = [4, 6, 8, 10, 12, 20, 100] as const;
export type StandardDiceFaces = (typeof STANDARD_DICE_FACES)[number];

/** Les dés permis dans les salons : formules libres, ou dés du monde seulement. */
export const DICE_MODES = ["free", "predefined"] as const;
export type DiceMode = (typeof DICE_MODES)[number];

export const MAX_WORLD_DICE = 50;
export const MAX_DIE_NAME_LENGTH = 40;
/** Bornes d'un minimum ou d'un maximum, et d'un modificateur. */
export const DIE_VALUE_LIMIT = 1_000_000;
export const MAX_ROLL_COUNT = 100;
/** Le plus grand dé d'une formule libre. */
export const MAX_FREE_FACES = 1000;
/** Les faces en image : un dé de 100 valeurs au plus (migration 272). */
export const MAX_DIE_FACES = 100;

/** Une valeur du dé habillée d'une image ; `hide_value` : l'image seule. */
export type DieFace = { value: number; image: string; hide_value?: boolean };

export type WorldDie = {
  id: string;
  world_id: string;
  name: string;
  min_value: number;
  max_value: number;
  hidden: boolean;
  position: number;
  faces: DieFace[];
};

/** Ce qu'on règle d'un dé. */
export type WorldDieInput = Pick<WorldDie, "name" | "min_value" | "max_value" | "hidden">;

/** Un lancer tiré par la base (`dice_rolls`) ; `die_name` nul : une formule libre. */
export type DiceRoll = {
  id: string;
  die_name: string | null;
  min_value: number;
  max_value: number;
  count: number;
  modifier: number;
  results: number[];
  total: number;
  /** Les faces tirées, copiées par la base au lancer (migration 272). */
  faces?: DieFace[] | null;
};

/** Ce que la fenêtre « Lancer un dé » demande à la base. */
export type DiceRollRequest =
  | { dieId: string; count: number; modifier: number; label?: string }
  | { faces: number; count: number; modifier: number; label?: string };

const dieValue = z.number().int().min(-DIE_VALUE_LIMIT).max(DIE_VALUE_LIMIT);

export const worldDieInputSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(MAX_DIE_NAME_LENGTH),
    min_value: dieValue,
    max_value: dieValue,
    hidden: z.boolean(),
  })
  .refine((d) => d.min_value < d.max_value, { path: ["max_value"] });

export const diceRulesSchema = z.strictObject({
  dice_mode: z.enum(DICE_MODES),
  dice_allow_edit: z.boolean(),
});
export type DiceRules = z.infer<typeof diceRulesSchema>;

export const dieFacesSchema = z
  .array(
    z.strictObject({
      value: z.number().int(),
      image: httpUrlSchema,
      hide_value: z.boolean().optional(),
    }),
  )
  .max(MAX_DIE_FACES)
  .refine((faces) => new Set(faces.map((f) => f.value)).size === faces.length);

/** Les valeurs d'un dé, une par face ; `null` au-delà de MAX_DIE_FACES. */
export function dieFaceValues(die: Pick<WorldDie, "min_value" | "max_value">): number[] | null {
  const size = die.max_value - die.min_value + 1;
  if (!Number.isInteger(size) || size < 1 || size > MAX_DIE_FACES) return null;
  return Array.from({ length: size }, (_, i) => die.min_value + i);
}

export function faceOf(faces: readonly DieFace[] | null | undefined, value: number): DieFace | undefined {
  return faces?.find((f) => f.value === value);
}

/** Pose une face (la remplace si sa valeur en a déjà une), dans l'ordre des valeurs. */
export function setFace(faces: readonly DieFace[], face: DieFace): DieFace[] {
  return [...faces.filter((f) => f.value !== face.value), face].sort((a, b) => a.value - b.value);
}

export function removeFace(faces: readonly DieFace[], value: number): DieFace[] {
  return faces.filter((f) => f.value !== value);
}

/** Une face tirée cache son nombre : le total la trahirait, il se tait aussi. */
export function rollHidesNumbers(roll: Pick<DiceRoll, "results" | "faces">): boolean {
  return roll.results.some((v) => faceOf(roll.faces, v)?.hide_value === true);
}

export function standardDie(faces: StandardDiceFaces): WorldDieInput {
  return { name: `d${faces}`, min_value: 1, max_value: faces, hidden: false };
}

/** Le nombre de faces d'un dé standard (nommé dN, de 1 à N), sinon `null`. */
export function standardFacesOf(die: Pick<WorldDie, "name" | "min_value" | "max_value">): number | null {
  const faces = (STANDARD_DICE_FACES as readonly number[]).find((f) => f === die.max_value);
  if (!faces || die.min_value !== 1) return null;
  return die.name.trim().toLowerCase() === `d${faces}` ? faces : null;
}

export function dieRangeLabel(die: Pick<WorldDie, "min_value" | "max_value">): string {
  return `${die.min_value} – ${die.max_value}`;
}

/** nDm, nDm+k ou nDm-k, dans les bornes de la base ; sinon `null`. */
export function parseFreeFormula(formula: string): { count: number; faces: number; modifier: number } | null {
  const match = formula.trim().match(/^(\d+)[dD](\d+)([+-]\d+)?$/);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  const faces = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  if (count < 1 || count > MAX_ROLL_COUNT) return null;
  if (faces < 2 || faces > MAX_FREE_FACES) return null;
  if (Math.abs(modifier) > DIE_VALUE_LIMIT) return null;
  return { count, faces, modifier };
}

/**
 * La formule d'un lancer : « 2d6+3 » pour une formule libre ou un dé nommé
 * dN ; un dé personnalisé garde son nom (« 2 × Dé de peur + 3 »).
 */
export function rollFormula(roll: Pick<DiceRoll, "die_name" | "max_value" | "count" | "modifier">): string {
  const named = roll.die_name?.trim();
  if (!named || /^d\d+$/i.test(named)) {
    const base = `${roll.count}${named ?? `d${roll.max_value}`}`;
    if (!roll.modifier) return base;
    return `${base}${roll.modifier > 0 ? "+" : "-"}${Math.abs(roll.modifier)}`;
  }
  const base = roll.count === 1 ? named : `${roll.count} × ${named}`;
  if (!roll.modifier) return base;
  return `${base} ${roll.modifier > 0 ? "+" : "−"} ${Math.abs(roll.modifier)}`;
}

/** Un seul dé, au plus haut de sa plage : critique ; au plus bas : échec. */
export function diceRollOutcome(
  roll: Pick<DiceRoll, "min_value" | "max_value" | "count" | "results">,
): "critical" | "fumble" | null {
  if (roll.count !== 1 || roll.results.length !== 1) return null;
  if (roll.results[0] === roll.max_value) return "critical";
  if (roll.results[0] === roll.min_value) return "fumble";
  return null;
}

/**
 * Le bloc du message d'un lancer : il désigne la ligne de la base, et en garde
 * une copie lisible (citations, recherche, anciens écrans). L'affichage, lui,
 * lit la ligne.
 */
export function diceBlockFromRoll(
  roll: Pick<DiceRoll, "id" | "die_name" | "min_value" | "max_value" | "count" | "modifier" | "results" | "total">,
  label?: string,
): DiceBlock {
  const trimmed = label?.trim();
  return {
    _type: "dice",
    roll_id: roll.id,
    formula: rollFormula(roll),
    results: roll.results,
    modifier: roll.modifier,
    total: roll.total,
    ...(trimmed ? { label: trimmed } : {}),
  };
}

const ROLL_ERRORS: Record<string, "predefinedOnly" | "hidden" | "notFound" | "invalid" | "locked"> = {
  dice_predefined_only: "predefinedOnly",
  dice_hidden: "hidden",
  dice_not_found: "notFound",
  dice_invalid_count: "invalid",
  dice_invalid_modifier: "invalid",
  dice_invalid_faces: "invalid",
  dice_roll_locked: "locked",
};
export type DiceRollErrorKey = (typeof ROLL_ERRORS)[string] | "failed";

/** La clé de traduction (`chatrooms.diceErrors.*`) d'un refus de la base. */
export function diceRollErrorKey(message: string | null | undefined): DiceRollErrorKey {
  if (!message) return "failed";
  const code = Object.keys(ROLL_ERRORS).find((c) => message.includes(c));
  return code ? ROLL_ERRORS[code] : "failed";
}
