import type { RingPlayer } from "./geometry";
import type { CGroup, CPersona } from "./types";

/**
 * Comment découper la couronne (vue Cercle) et les îlots (vue Constellations) :
 * par joueur, ou par groupe de personas. La vue Centré, organisée autour d'un
 * persona, n'en tient pas compte.
 */
export type RingGroupBy = "player" | "group";

/** Préfixe des clés d'arc d'un groupe ; `GROUPLESS_KEY` pour les personas sans groupe. */
export const GROUP_KEY_PREFIX = "group:";
export const GROUPLESS_KEY = "group:none";

export function parseGroupBy(value: unknown): RingGroupBy | null {
  return value === "player" || value === "group" ? value : null;
}

/** L'id du groupe d'une clé d'arc, `null` pour « sans groupe » ou une clé de joueur. */
export function groupIdOfKey(key: string): string | null {
  return key.startsWith(GROUP_KEY_PREFIX) && key !== GROUPLESS_KEY ? key.slice(GROUP_KEY_PREFIX.length) : null;
}

/**
 * Les arcs de la couronne, dans l'ordre : les joueurs tels quels, ou les
 * groupes (dans leur ordre de réglage) puis « sans groupe ». Dans un arc, les
 * personas gardent l'ordre de la liste des joueurs. `keep` écarte les
 * personas masqués (filtres, personas sans relation).
 */
export function ringArcsInput(
  groupBy: RingGroupBy,
  userList: ReadonlyArray<{ member: { user_id: string }; ps: ReadonlyArray<CPersona> }>,
  groups: ReadonlyArray<CGroup>,
  groupByPersona: ReadonlyMap<string, string>,
  keep: (personaId: string) => boolean,
): RingPlayer[] {
  if (groupBy === "player") {
    return userList.map(({ member, ps }) => ({ userId: member.user_id, personaIds: ps.filter((p) => keep(p.id)).map((p) => p.id) }));
  }
  const ordered = userList.flatMap(({ ps }) => ps.filter((p) => keep(p.id)).map((p) => p.id));
  const known = new Set(groups.map((g) => g.id));
  const arcs: RingPlayer[] = [...groups]
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((g) => ({ userId: GROUP_KEY_PREFIX + g.id, personaIds: ordered.filter((id) => groupByPersona.get(id) === g.id) }));
  arcs.push({
    userId: GROUPLESS_KEY,
    personaIds: ordered.filter((id) => {
      const gid = groupByPersona.get(id);
      return !gid || !known.has(gid);
    }),
  });
  return arcs;
}
