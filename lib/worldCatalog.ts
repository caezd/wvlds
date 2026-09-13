import { normalizeForSearch } from "@/lib/wikiLinkSuggest";
import type {
  WorldCatalogItem,
  WorldCatalogProperty,
  WorldCatalogRarity,
} from "@/types/worlds";

/**
 * Le catalogue d'un monde, côté métier.
 *
 * Tout ce qui se calcule sans réseau ni composant vit ici : la résolution
 * d'une entrée de fiche contre le catalogue, la recherche, l'assainissement
 * des propriétés libres, l'export et l'import. Le reste — actions serveur,
 * composants — s'appuie dessus. Fonctions pures, voir
 * `lib/__tests__/worldCatalog.test.ts`.
 */

// ── Rareté ────────────────────────────────────────────────────────────────────

/** Du plus commun au plus rare ; l'ordre est celui du sélecteur. */
export const CATALOG_RARITIES: readonly WorldCatalogRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

/**
 * Couleur d'accent d'une rareté.
 *
 * Le repère habituel du jeu de rôle : gris, vert, bleu, violet, or. Elles sont
 * choisies pour rester lisibles sur les deux thèmes — c'est une bordure et une
 * pastille, jamais un fond de texte.
 */
export const RARITY_COLORS: Record<WorldCatalogRarity, string> = {
  common: "#9ca3af",
  uncommon: "#22c55e",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
};

export function isCatalogRarity(value: unknown): value is WorldCatalogRarity {
  return typeof value === "string" && (CATALOG_RARITIES as readonly string[]).includes(value);
}

// ── Propriétés libres ─────────────────────────────────────────────────────────

/** Plafond repris de la contrainte `world_catalog_items_props_shape`. */
export const MAX_CATALOG_PROPERTIES = 20;
export const MAX_PROPERTY_LABEL_LENGTH = 60;
export const MAX_PROPERTY_VALUE_LENGTH = 200;

/**
 * Ramène une valeur quelconque à une liste de propriétés acceptable.
 *
 * Appelée côté serveur avant écriture : la contrainte de la base refuse un
 * JSON qui n'est pas un tableau ou qui dépasse vingt entrées, mais elle ne dit
 * rien de leur forme. Sans ce filtre, un appel direct à PostgREST rangerait
 * n'importe quoi dans la colonne — et l'interface le rendrait.
 */
export function sanitizeCatalogProperties(raw: unknown): WorldCatalogProperty[] {
  if (!Array.isArray(raw)) return [];
  const out: WorldCatalogProperty[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { label, value } = entry as Record<string, unknown>;
    const cleanLabel = typeof label === "string" ? label.trim().slice(0, MAX_PROPERTY_LABEL_LENGTH) : "";
    const cleanValue = typeof value === "string" ? value.trim().slice(0, MAX_PROPERTY_VALUE_LENGTH) : "";
    // Une propriété sans libellé n'a rien à dire ; une valeur seule non plus.
    if (!cleanLabel || !cleanValue) continue;
    out.push({ label: cleanLabel, value: cleanValue });
    if (out.length === MAX_CATALOG_PROPERTIES) break;
  }
  return out;
}

// ── Résolution d'une entrée de fiche ──────────────────────────────────────────

/** Ce qu'une fiche de persona range pour un objet ou une compétence. */
export type CatalogEntryRef = {
  catalog_id?: string;
  name?: string;
  description?: string;
  icon?: string;
};

export type ResolvedCatalogEntry = {
  name: string;
  description: string | null;
  icon: string | null;
  lucide_icon: string | null;
  image_url: string | null;
  rarity: WorldCatalogRarity | null;
  properties: WorldCatalogProperty[];
  /** L'entrée cite un objet du catalogue qui n'y est plus. */
  orphaned: boolean;
};

/**
 * Ce qu'il faut afficher pour une entrée de fiche.
 *
 * Une fiche gardait une COPIE du nom, de la description et de l'icône, prise
 * au moment de l'ajout. Renommer un objet du catalogue ne changeait donc rien
 * nulle part, et le supprimer laissait dans chaque fiche un fantôme que rien
 * ne distinguait d'une entrée valide. Le catalogue redevient la source de
 * vérité : la copie ne sert plus que de secours.
 *
 * Trois cas, et la nuance du troisième compte :
 *   - pas de `catalog_id` — saisie libre, la copie EST la donnée ;
 *   - `catalog_id` retrouvé — le catalogue l'emporte, sur tous les champs ;
 *   - `catalog_id` introuvable — la copie s'affiche, marquée `orphaned`.
 *
 * `catalog` vaut `undefined` quand le catalogue n'a pas été chargé du tout —
 * une vue en lecture seule qui ne s'en sert pas. Rien n'est alors marqué
 * orphelin : on ne sait pas, et l'annoncer serait mentir.
 */
export function resolveCatalogEntry(
  entry: CatalogEntryRef,
  catalog: ReadonlyMap<string, WorldCatalogItem> | undefined,
): ResolvedCatalogEntry {
  const fallback: ResolvedCatalogEntry = {
    name: entry.name ?? "",
    description: entry.description ?? null,
    icon: entry.icon ?? null,
    lucide_icon: null,
    image_url: null,
    rarity: null,
    properties: [],
    orphaned: false,
  };

  if (!entry.catalog_id || !catalog) return fallback;

  const item = catalog.get(entry.catalog_id);
  if (!item) return { ...fallback, orphaned: true };

  return {
    name: item.name,
    description: item.description ?? null,
    icon: item.icon ?? null,
    lucide_icon: item.lucide_icon ?? null,
    image_url: item.image_url ?? null,
    rarity: item.rarity ?? null,
    properties: item.properties ?? [],
    orphaned: false,
  };
}

/** Les objets du catalogue par identifiant, prêts pour `resolveCatalogEntry`. */
export function indexCatalog(items: readonly WorldCatalogItem[]): Map<string, WorldCatalogItem> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Quantité recevable pour un objet donné.
 *
 * Un objet non empilable vaut toujours un ; un objet plafonné ne dépasse pas
 * son plafond. Le champ de saisie borne déjà, mais un formulaire se contourne
 * et l'inventaire d'une fiche est du JSONB — la base ne vérifie rien ici.
 */
export function clampQuantity(item: WorldCatalogItem | undefined, quantity: number): number {
  const rounded = Number.isFinite(quantity) ? Math.floor(quantity) : 1;
  const atLeastOne = Math.max(1, rounded);
  if (!item) return atLeastOne;
  if (item.stackable === false) return 1;
  if (item.max_quantity && item.max_quantity > 0) return Math.min(atLeastOne, item.max_quantity);
  return atLeastOne;
}

// ── Recherche ─────────────────────────────────────────────────────────────────

/**
 * L'objet répond-il à la recherche ?
 *
 * Nom et description, sans accents ni casse. La requête arrive déjà
 * normalisée : elle ne change pas d'un objet à l'autre, et la normaliser dans
 * la boucle coûterait autant de décompositions NFD que d'objets.
 */
export function catalogItemMatches(item: WorldCatalogItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  if (normalizeForSearch(item.name).includes(normalizedQuery)) return true;
  if (item.description && normalizeForSearch(item.description).includes(normalizedQuery)) return true;
  return false;
}

export { normalizeForSearch };

// ── Export et import ──────────────────────────────────────────────────────────

/** Un objet tel qu'il voyage dans un fichier d'export. */
export type CatalogExportItem = {
  name: string;
  description?: string | null;
  icon?: string | null;
  lucide_icon?: string | null;
  rarity?: WorldCatalogRarity | null;
  stackable?: boolean;
  max_quantity?: number | null;
  properties?: WorldCatalogProperty[];
  /** Nom de la catégorie, et non son identifiant : il ne veut rien dire ailleurs. */
  category?: string | null;
};

export type CatalogExport = {
  version: 1;
  type: "inventory" | "skills";
  items: CatalogExportItem[];
};

export const CATALOG_EXPORT_VERSION = 1;

/** Plafond d'un import, pour qu'un fichier tordu ne crée pas dix mille lignes. */
export const MAX_CATALOG_IMPORT_ITEMS = 500;

/**
 * Le catalogue sous une forme transportable.
 *
 * `image_url` est volontairement ABSENTE : elle pointe un fichier du stockage
 * de CE monde, que l'import ne saurait pas recopier. Une URL reprise telle
 * quelle dans un autre monde donnerait une image qui disparaît le jour où le
 * monde d'origine fait le ménage. Les icônes — `rpg_icons` comme
 * Lucide — sont communes à toute l'application et voyagent sans peine.
 */
export function buildCatalogExport(
  type: "inventory" | "skills",
  items: readonly WorldCatalogItem[],
  categoryNames: ReadonlyMap<string, string>,
): CatalogExport {
  return {
    version: CATALOG_EXPORT_VERSION,
    type,
    items: items.map((item) => ({
      name: item.name,
      description: item.description ?? null,
      icon: item.icon ?? null,
      lucide_icon: item.lucide_icon ?? null,
      rarity: item.rarity ?? null,
      stackable: item.stackable !== false,
      max_quantity: item.max_quantity ?? null,
      properties: item.properties ?? [],
      category: item.category_id ? categoryNames.get(item.category_id) ?? null : null,
    })),
  };
}

export type CatalogImportResult =
  | { ok: true; items: CatalogExportItem[] }
  | { ok: false; reason: "json" | "shape" | "type" | "empty" };

/**
 * Lit un fichier d'export, sans rien croire de ce qu'il contient.
 *
 * Le fichier vient de l'extérieur : il peut être tronqué, écrit à la main, ou
 * venir d'un autre catalogue. Chaque entrée est ramenée à ce que la base
 * accepte plutôt que rejetée en bloc — un import qui échoue parce qu'un objet
 * sur cent porte une rareté inconnue n'aide personne.
 *
 * Le `type`, lui, est refusé s'il ne correspond pas : verser des compétences
 * dans l'onglet des objets ne se rattrape pas après coup.
 */
export function parseCatalogImport(
  text: string,
  expectedType: "inventory" | "skills",
): CatalogImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, reason: "shape" };

  const payload = raw as Record<string, unknown>;
  if (!Array.isArray(payload.items)) return { ok: false, reason: "shape" };
  if (payload.type !== undefined && payload.type !== expectedType) return { ok: false, reason: "type" };

  const items: CatalogExportItem[] = [];
  for (const entry of payload.items) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 200) : "";
    if (!name) continue;

    const maxQuantity =
      typeof row.max_quantity === "number" && Number.isFinite(row.max_quantity)
        ? Math.max(1, Math.floor(row.max_quantity))
        : null;

    items.push({
      name,
      description: typeof row.description === "string" ? row.description.slice(0, 5000) : null,
      icon: typeof row.icon === "string" ? row.icon.slice(0, 200) : null,
      lucide_icon: typeof row.lucide_icon === "string" ? row.lucide_icon.slice(0, 100) : null,
      rarity: isCatalogRarity(row.rarity) ? row.rarity : null,
      stackable: row.stackable !== false,
      max_quantity: maxQuantity,
      properties: sanitizeCatalogProperties(row.properties),
      category:
        typeof row.category === "string" && row.category.trim()
          ? row.category.trim().slice(0, 200)
          : null,
    });
    if (items.length === MAX_CATALOG_IMPORT_ITEMS) break;
  }

  if (items.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, items };
}
