import { z } from "zod";

import { ERR_VALEUR_NON_SUPPORTEE } from "@/lib/actionErrors";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";

// ──────────────────────────────────────────────────────────────────────────
// Les briques de validation des entrées, partagées par les actions serveur.
//
// La signature TypeScript d'une action serveur n'existe plus à l'exécution :
// Next expose chaque action comme un point d'entrée HTTP, et un appel forgé
// lui envoie ce qu'il veut — un objet avec une colonne de plus, un `null` là
// où une chaîne était attendue, dix mégaoctets dans un libellé. La RLS décide
// QUI écrit ; ces schémas décident QUOI, avant que la requête parte.
//
// Les bornes reprennent celles de la base (migrations 126 et 171, dont
// lib/textLimits.ts est le miroir colonne par colonne), pour que le refus
// arrive traduit — un code d'erreur — plutôt qu'en message Postgres affiché
// tel quel dans un toast.
//
// Le `strictObject` est voulu : une clé inconnue n'est pas ignorée, elle fait
// échouer l'appel. Un client légitime n'en envoie jamais ; en recevoir une,
// c'est recevoir un appel forgé, et l'ignorer en silence masquerait l'attaque.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Les plafonds génériques des contraintes CHECK — les familles de colonnes,
 * là où `DB_TEXT_LIMITS` les donne une à une.
 */
export const INPUT_LIMITS = {
  /** Un nom, un titre, une étiquette : `char_length(col) <= 200`. */
  shortText: DB_TEXT_LIMITS["world_map_regions.label"],
  /** Une description : `<= 5000`. */
  longText: DB_TEXT_LIMITS["world_map_regions.description"],
  /** Une URL : `is_http_url`, migration 171. */
  url: 2000,
  /** Un nom d'icône : `<= 100`. */
  icon: DB_TEXT_LIMITS["world_map_pins.icon"],
  /** Un identifiant : la base tranche le format, on borne la longueur. */
  id: 64,
} as const;

/**
 * Un identifiant tel que le client le renvoie.
 *
 * Pas de `z.uuid()` : la base est seule juge du format, et refuse déjà ce qui
 * n'en est pas un. Ce qu'on écarte ici, c'est ce qui ne peut pas en être un —
 * autre chose qu'une chaîne, vide, ou d'une longueur absurde.
 */
export const idSchema = z.string().min(1).max(INPUT_LIMITS.id);

/** Un libellé court, obligatoire : nom, titre, étiquette. */
export const shortTextSchema = z.string().trim().min(1).max(INPUT_LIMITS.shortText);

/** Un texte libre facultatif : description, biographie. */
export const longTextSchema = z.string().trim().max(INPUT_LIMITS.longText);

/**
 * Une URL que l'application ira charger ou ouvrir.
 *
 * `z.url()` seul accepte `javascript:` et `data:` — tout ce que `new URL()`
 * sait lire. Seuls `http` et `https` désignent une ressource qu'on peut
 * afficher sans exécuter quoi que ce soit ; c'est le même critère que
 * `isSafeUrl` dans lib/utils.ts, et que la contrainte de la migration 171.
 */
export const httpUrlSchema = z.url({ protocol: /^https?$/ }).max(INPUT_LIMITS.url);

/** La même URL, avec le message qu'un formulaire affichera à la place du code. */
export function httpUrl(message: string) {
  return z.url({ protocol: /^https?$/, error: message }).max(INPUT_LIMITS.url, message);
}

/** Une couleur hexadécimale, à trois ou six chiffres — le format des sélecteurs. */
export const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

/**
 * Un nom d'icône Lucide : des minuscules et des tirets, rien d'autre.
 *
 * Le nom sert de clé de recherche dans le catalogue, jamais de balisage —
 * mais une borne courte évite qu'il serve de champ libre.
 */
export const lucideIconSchema = z.string().regex(/^[a-z0-9-]+$/).max(INPUT_LIMITS.icon);

/**
 * Lit une entrée d'action, ou dit pourquoi elle est refusée.
 *
 * Deux styles d'erreur cohabitent dans le dépôt : les actions du catalogue
 * rendent `{ ok: false, error }`, celles de la carte lèvent. Cette fonction
 * rend le code, et laisse l'appelant choisir comment le porter.
 */
export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
): { ok: true; data: z.output<T> } | { ok: false; error: string } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: ERR_VALEUR_NON_SUPPORTEE };
}

/** Comme `parseInput`, pour les actions qui lèvent plutôt que de rendre. */
export function parseInputOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(ERR_VALEUR_NON_SUPPORTEE);
  return parsed.data;
}
