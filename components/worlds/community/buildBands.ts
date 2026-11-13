import { applyPersonaFilters, PERSONA_FILTER_ALL as ALL, type PersonaFilters } from "@/components/personas/personaFilters";
import type { PersonaNarrativeStatus, WorldMemberStatus } from "@/types/db";

// Les bandes de la vue « Joueurs » de la page des membres : une par membre,
// avec ses personas, puis celle des PNJ — pur, testé dans
// `__tests__/buildBands.test.ts`.

export type PresenceState = "online" | "away" | "offline";

const PRESENCE_ORDER: Record<PresenceState, number> = { online: 0, away: 1, offline: 2 };

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function normalize(text: string) {
  return text.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

/** Ce que le regroupement lit d'un membre. */
export type BandMember = {
  user_id: string;
  username: string | null;
  isOwner: boolean;
  effectiveStatus: WorldMemberStatus;
  /** Du plus haut au plus bas. */
  roles: { id: string; name: string; hoist: boolean }[];
};

/** Ce que le regroupement lit d'un persona (les critères de `applyPersonaFilters`). */
export type BandPersona = {
  id: string;
  name: string | null;
  user_id: string;
  username: string | null;
  narrative_status: PersonaNarrativeStatus;
  review_status?: unknown;
  sheet_complete?: boolean | null;
  is_npc: boolean;
};

export type Band<M, P> =
  | { key: string; kind: "member"; member: M; personas: P[]; hidden: number }
  | { key: "__npc__"; kind: "npc"; member: null; personas: P[]; hidden: number };

/** Les filtres de la page : ceux des personas, plus « en ligne seulement ». */
export type CommunityFilters = PersonaFilters & { online: boolean };

export function personaFiltersActive(f: PersonaFilters) {
  return f.player !== ALL || f.group !== ALL || f.status !== ALL || f.sheet !== ALL || f.kind !== ALL;
}

/**
 * Les bandes, dans l'ordre : moi, le propriétaire, un groupe par rôle « hoist »
 * (du plus haut au plus bas), les autres membres, puis les PNJ. Dans chaque
 * groupe, les membres actifs avant ceux en pause ou absents, puis par présence,
 * puis par nom.
 *
 * Un membre reste visible si lui (pseudo, rôles) ou l'un de ses personas
 * correspond à la recherche. Quand seule la recherche d'un persona le retient,
 * sa bande ne montre que les personas trouvés ; `hidden` compte les autres
 * (« Voir tout »), et `expanded` les fait revenir.
 */
export function buildBands<M extends BandMember, P extends BandPersona>({
  members,
  personasByUser,
  npcs,
  meId,
  filters,
  groupByPersona,
  hoistedRoleIds,
  presenceOf,
  showNpcBand,
  expanded = new Set(),
}: {
  members: M[];
  personasByUser: Map<string, P[]>;
  npcs: P[];
  meId: string | null;
  filters: CommunityFilters;
  groupByPersona: Map<string, string>;
  /** Les rôles « hoist » du monde, du plus haut au plus bas. */
  hoistedRoleIds: string[];
  presenceOf: (userId: string) => PresenceState;
  /** Le monde a des PNJ, ou le lecteur peut en créer. */
  showNpcBand: boolean;
  /** Bandes dont on veut voir tous les personas malgré la recherche. */
  expanded?: ReadonlySet<string>;
}): Band<M, P>[] {
  const q = normalize(filters.query.trim());
  const withoutQuery: PersonaFilters = { ...filters, query: "" };
  const narrowed = personaFiltersActive(filters);
  const matchesQuery = (p: P) => !q || normalize(p.name ?? "").includes(q);

  const bandOf = (m: M): Band<M, P> | null => {
    if (filters.online && presenceOf(m.user_id) !== "online") return null;
    const passing = applyPersonaFilters(personasByUser.get(m.user_id) ?? [], withoutQuery, groupByPersona);
    const memberMatches = !q
      || normalize(m.username ?? m.user_id).includes(q)
      || m.roles.some((r) => normalize(r.name).includes(q));
    if (memberMatches) {
      if (narrowed && passing.length === 0) return null;
      return { key: m.user_id, kind: "member", member: m, personas: passing, hidden: 0 };
    }
    const found = passing.filter(matchesQuery);
    if (found.length === 0) return null;
    if (expanded.has(m.user_id)) return { key: m.user_id, kind: "member", member: m, personas: passing, hidden: 0 };
    return { key: m.user_id, kind: "member", member: m, personas: found, hidden: passing.length - found.length };
  };

  const byName = (a: M, b: M) => (a.username ?? a.user_id).localeCompare(b.username ?? b.user_id, undefined, { sensitivity: "base" });
  const inGroup = (a: M, b: M) => {
    const byStatus = Number(a.effectiveStatus !== "active") - Number(b.effectiveStatus !== "active");
    if (byStatus !== 0) return byStatus;
    const byPresence = PRESENCE_ORDER[presenceOf(a.user_id)] - PRESENCE_ORDER[presenceOf(b.user_id)];
    if (byPresence !== 0) return byPresence;
    return byName(a, b);
  };

  const hoisted = new Set(hoistedRoleIds);
  const groupKey = (m: M) => {
    if (m.user_id === meId) return "__me__";
    if (m.isOwner) return "__owner__";
    return m.roles.find((r) => r.hoist && hoisted.has(r.id))?.id ?? "__others__";
  };
  const groups = new Map<string, M[]>();
  for (const m of members) {
    const key = groupKey(m);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  const order = ["__me__", "__owner__", ...hoistedRoleIds, "__others__"];

  const bands: Band<M, P>[] = [];
  for (const key of order) {
    for (const m of (groups.get(key) ?? []).slice().sort(inGroup)) {
      const band = bandOf(m);
      if (band) bands.push(band);
    }
  }

  if (!filters.online) {
    const passing = applyPersonaFilters(npcs, withoutQuery, groupByPersona);
    const found = passing.filter(matchesQuery);
    if (found.length > 0 || (showNpcBand && !narrowed && !q)) {
      bands.push({ key: "__npc__", kind: "npc", member: null, personas: found, hidden: 0 });
    }
  }
  return bands;
}
