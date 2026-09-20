import type { PersonaNarrativeStatus } from "@/types/db";
import { sheetBadgeOf, type PersonaSheetBadgeKind } from "@/lib/personaReview";

// Les filtres et le tri de la liste des personas d'un monde — pur, testé dans
// `__tests__/WorldPersonasPanel.filters.test.tsx`. Partagé entre le panneau
// (qui les applique) et la barre de filtres (qui les édite).

export const PERSONA_FILTER_ALL = "__all__";
export const PERSONA_FILTER_NO_GROUP = "__none__";
const ALL = PERSONA_FILTER_ALL;
const NO_GROUP = PERSONA_FILTER_NO_GROUP;

export type PersonaSortKey = "name" | "newest" | "oldest";

export function memberLabel(userId: string, username: string | null) {
  return username ? `@${username}` : userId.slice(0, 8);
}

/** Lettre d'index (accents ignorés) ; "#" pour les noms vides ou non alphabétiques. */
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

export function letterKey(name: string | null): string {
  const normalized = (name ?? "").trim().normalize("NFD").replace(DIACRITICS_RE, "");
  const c = normalized[0]?.toUpperCase() ?? "";
  return /[A-Z]/.test(c) ? c : "#";
}

function normalize(text: string) {
  return text.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

/** Les critères de la barre de filtres, appliqués à une liste. */
export type PersonaFilters = {
  query: string;
  player: string; // ALL | user_id
  group: string; // ALL | NO_GROUP | group_id
  status: string; // ALL | PersonaNarrativeStatus
  /** ALL | PersonaSheetBadgeKind — l'état de la fiche (migration 181). */
  sheet: string;
  /** ALL | "player" | "npc" — personas des joueurs ou PNJ (migration 182). */
  kind: string;
  /** Le monde relit-il ses fiches (migration 184) ? Sinon le filtre « Fiche » ne connaît qu'« incomplète ». */
  reviewActive?: boolean;
};

export const EMPTY_PERSONA_FILTERS: PersonaFilters = { query: "", player: ALL, group: ALL, status: ALL, sheet: ALL, kind: ALL };

export const SHEET_FILTERS: readonly PersonaSheetBadgeKind[] = ["submitted", "draft", "incomplete", "approved"];

export function applyPersonaFilters<
  T extends {
    id: string; name: string | null; user_id: string; username?: string | null;
    narrative_status: PersonaNarrativeStatus; review_status?: unknown; sheet_complete?: boolean | null; is_npc?: boolean | null;
  },
>(list: T[], filters: PersonaFilters, groupByPersona: Map<string, string>): T[] {
  const q = normalize(filters.query.trim());
  return list.filter((p) => {
    if (filters.kind === "npc" && !p.is_npc) return false;
    if (filters.kind === "player" && p.is_npc) return false;
    if (filters.player !== ALL && p.user_id !== filters.player) return false;
    if (filters.group === NO_GROUP && groupByPersona.has(p.id)) return false;
    if (filters.group !== ALL && filters.group !== NO_GROUP && groupByPersona.get(p.id) !== filters.group) return false;
    if (filters.status !== ALL && p.narrative_status !== filters.status) return false;
    if (filters.sheet !== ALL && (sheetBadgeOf(p, filters.reviewActive ?? true) ?? "approved") !== filters.sheet) return false;
    if (q && !normalize(p.name ?? "").includes(q) && !normalize(p.username ?? "").includes(q)) return false;
    return true;
  });
}

export function sortPersonas<T extends { name: string | null; created_at?: string | null }>(list: T[], sort: PersonaSortKey): T[] {
  const byName = (a: T, b: T) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
  const byDate = (a: T, b: T) => (a.created_at ?? "").localeCompare(b.created_at ?? "");
  return [...list].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    const d = byDate(a, b);
    if (d !== 0) return sort === "newest" ? -d : d;
    return byName(a, b);
  });
}
