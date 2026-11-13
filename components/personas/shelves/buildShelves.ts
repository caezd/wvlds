import { isRetiredStatus } from "@/lib/personaStatus";
import type { PersonaNarrativeStatus, WorldMemberStatus } from "@/types/db";
import { memberLabel, sortPersonas, type PersonaSortKey } from "../personaFilters";

// Le regroupement de la liste des personas en « étagères » — pur, testé dans
// `__tests__/buildShelves.test.ts`. Les listes reçues sont déjà filtrées :
// on ne fait que ranger.

export type ShelfMode = "player" | "group" | "list";
export const SHELF_MODES: readonly ShelfMode[] = ["player", "group", "list"];

export function isShelfMode(value: unknown): value is ShelfMode {
  return typeof value === "string" && (SHELF_MODES as readonly string[]).includes(value);
}

/** Ce que le rangement lit d'un persona ; le reste voyage avec lui. */
export type ShelfPersona = {
  id: string;
  name: string | null;
  created_at?: string | null;
  user_id: string;
  username: string | null;
  is_npc: boolean;
  narrative_status: PersonaNarrativeStatus;
  playerStatus?: WorldMemberStatus;
  playerStatusUntil?: string | null;
};

export type ShelfKind = "me" | "player" | "npc" | "group" | "noGroup" | "all";

export type Shelf<T> = {
  key: string;
  kind: ShelfKind;
  /** « @pseudo » du joueur ou nom du groupe ; null pour les étagères sans nom propre. */
  label: string | null;
  color: string | null;
  items: T[];
  /** Personas encore en jeu (ni décédés ni retirés). */
  alive: number;
  /** Le joueur de l'étagère (mode « Par joueur ») s'est déclaré en pause ou absent. */
  playerStatus: WorldMemberStatus;
  playerStatusUntil: string | null;
  /** La tuile de création : « Nouveau persona » sur ma rangée, « Nouveau PNJ » sur celle des PNJ. */
  create: "persona" | "npc" | null;
};

type Group = { id: string; name: string; color: string };

function shelf<T extends ShelfPersona>(fields: Omit<Shelf<T>, "alive" | "playerStatus" | "playerStatusUntil" | "create"> & Partial<Shelf<T>>): Shelf<T> {
  return {
    playerStatus: "active",
    playerStatusUntil: null,
    create: null,
    ...fields,
    alive: fields.items.filter((p) => !isRetiredStatus(p.narrative_status)).length,
  };
}

export function buildShelves<T extends ShelfPersona>({
  mine,
  others,
  npcs,
  groups,
  groupByPersona,
  mode,
  sort,
  meId,
  myUsername,
  keepMine,
  keepNpcs,
  canCreateNpc,
}: {
  mine: T[];
  others: T[];
  npcs: T[];
  /** Dans l'ordre du monde (`sort_index`). */
  groups: Group[];
  groupByPersona: Map<string, string>;
  mode: ShelfMode;
  sort: PersonaSortKey;
  meId: string | null;
  myUsername: string | null;
  /** Garder ma rangée même vide (mode « Par joueur ») : elle porte la tuile de création. */
  keepMine: boolean;
  /** Garder la rangée des PNJ même vide, pour qui peut en créer. */
  keepNpcs: boolean;
  /** Gestionnaire des PNJ : la rangée des PNJ porte « Nouveau PNJ ». */
  canCreateNpc: boolean;
}): Shelf<T>[] {
  if (mode === "list") {
    const items = sortPersonas([...mine, ...others, ...npcs], sort);
    return items.length > 0 ? [shelf({ key: "__all__", kind: "all", label: null, color: null, items })] : [];
  }

  if (mode === "group") {
    const all = sortPersonas([...mine, ...others, ...npcs], sort);
    const known = new Set(groups.map((g) => g.id));
    const byGroup = new Map<string, T[]>();
    const loose: T[] = [];
    for (const p of all) {
      const g = groupByPersona.get(p.id);
      if (g && known.has(g)) {
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(p);
      } else loose.push(p);
    }
    const shelves = groups
      .filter((g) => byGroup.has(g.id))
      .map((g) => shelf({ key: g.id, kind: "group", label: g.name, color: g.color, items: byGroup.get(g.id)! }));
    if (loose.length > 0) shelves.push(shelf({ key: "__none__", kind: "noGroup", label: null, color: null, items: loose }));
    return shelves;
  }

  // Par joueur : moi, puis les autres par pseudo, puis les PNJ.
  const shelves: Shelf<T>[] = [];
  if (mine.length > 0 || keepMine) {
    shelves.push(shelf({
      key: meId ?? "__me__", kind: "me", label: memberLabel(meId ?? "", myUsername), color: null, items: mine, create: "persona",
    }));
  }
  const byPlayer = new Map<string, T[]>();
  for (const p of others) {
    if (!byPlayer.has(p.user_id)) byPlayer.set(p.user_id, []);
    byPlayer.get(p.user_id)!.push(p);
  }
  const players = [...byPlayer.entries()]
    .map(([userId, items]) => ({ userId, items, label: memberLabel(userId, items[0].username) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  for (const { userId, items, label } of players) {
    shelves.push(shelf({
      key: userId, kind: "player", label, color: null, items,
      playerStatus: items[0].playerStatus ?? "active",
      playerStatusUntil: items[0].playerStatusUntil ?? null,
    }));
  }
  if (npcs.length > 0 || keepNpcs) {
    shelves.push(shelf({ key: "__npc__", kind: "npc", label: null, color: null, items: npcs, create: canCreateNpc ? "npc" : null }));
  }
  return shelves;
}

/** À partir de combien de personas une étagère met l'un d'eux en vedette. */
export const FEATURED_MIN = 5;

/** L'activité récente d'un persona (migration 200) : ses messages publics des 30 derniers jours. */
export type PersonaActivity = { count: number; lastAt: string };

/**
 * Le persona en vedette d'une étagère (tuile deux sur deux) : le plus actif —
 * le plus de messages publics ces 30 derniers jours, le plus récent en cas
 * d'égalité — parmi ceux encore en jeu, dès que l'étagère en compte au moins
 * `FEATURED_MIN`. Personne n'a écrit : pas de vedette, la grille reste régulière.
 */
export function featuredPersonaId(
  items: Pick<ShelfPersona, "id" | "narrative_status">[],
  activity: Map<string, PersonaActivity>,
): string | undefined {
  if (items.length < FEATURED_MIN) return undefined;
  let best: { id: string; count: number; lastAt: string } | undefined;
  for (const p of items) {
    if (isRetiredStatus(p.narrative_status)) continue;
    const a = activity.get(p.id);
    if (!a || a.count <= 0) continue;
    if (!best || a.count > best.count || (a.count === best.count && a.lastAt > best.lastAt)) best = { id: p.id, ...a };
  }
  return best?.id;
}
