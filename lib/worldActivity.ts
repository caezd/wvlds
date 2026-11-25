/**
 * Le journal d'activité d'un monde (migration 254) : un événement par ligne,
 * écrit par la base seule. Il ne suit pour l'instant que l'économie, sans les
 * gains automatiques.
 *
 * Fonctions pures et lecture paginée, voir `lib/__tests__/worldActivity.test.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Miroir de `world_activity_kind_check`, dans l'ordre de la base. */
export const ACTIVITY_KINDS = [
  "balance_adjust",
  "item_adjust",
  "slots_purchase",
  "purchase",
  "sale",
  "transfer",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityDomain = "economy";

export const ACTIVITY_PAGE_SIZE = 50;

/** Un objet tel qu'il figurait dans l'événement (quantité signée pour un don ou un retrait). */
export type ActivityItem = {
  catalog_item_id: string | null;
  name: string;
  icon: string | null;
  lucide_icon: string | null;
  image_url: string | null;
  quantity: number;
};

export type WorldActivityEntry = {
  id: string;
  domain: ActivityDomain;
  kind: ActivityKind;
  actor_id: string | null;
  actor: { username: string | null } | null;
  persona_id: string | null;
  persona_name: string | null;
  target_persona_id: string | null;
  target_persona_name: string | null;
  amount: number;
  items: ActivityItem[];
  note: string | null;
  ref_id: string | null;
  data: { shop_name?: string; slots?: number; chat_id?: string };
  created_at: string;
};

export type ActivityFilters = {
  /** Types retenus ; vide ou absent : tous. */
  kinds?: readonly ActivityKind[];
  personaId?: string | null;
  /** Jours locaux, AAAA-MM-JJ, bornes comprises. */
  from?: string | null;
  to?: string | null;
};

export type ActivityCursor = { created_at: string; id: string };

export type ActivityPage = { entries: WorldActivityEntry[]; cursor: ActivityCursor | null; error?: true };

const COLUMNS =
  "id, domain, kind, actor_id, actor:profiles!world_activity_actor_id_fkey(username), persona_id, persona_name, " +
  "target_persona_id, target_persona_name, amount, items, note, ref_id, data, created_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minuit local du jour `AAAA-MM-JJ`, décalé de `offset` jours, en ISO. */
function localMidnight(day: string, offset = 0): string | null {
  const m = DAY.exec(day);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + offset).toISOString();
}

/** Ce que l'événement a fait au solde de son persona (le donneur, pour un échange). */
export function activityBalanceEffect(entry: Pick<WorldActivityEntry, "kind" | "amount">): number {
  switch (entry.kind) {
    case "balance_adjust":
      return entry.amount;
    case "sale":
      return entry.amount;
    case "purchase":
    case "slots_purchase":
    case "transfer":
      return -entry.amount;
    case "item_adjust":
      return 0;
  }
}

/** « Épée, Potion ×3 » ; signé, « +2 Épée » / « −1 Épée ». */
export function formatActivityItems(items: readonly ActivityItem[], opts: { signed?: boolean } = {}): string {
  return items
    .map((i) => {
      if (opts.signed) return `${i.quantity < 0 ? "−" : "+"}${Math.abs(i.quantity)} ${i.name}`;
      return i.quantity === 1 ? i.name : `${i.name} ×${i.quantity}`;
    })
    .join(", ");
}

/**
 * Une page du journal d'un monde, du plus récent au plus ancien. La base ne
 * rend que ce que le lecteur peut voir (RLS).
 */
export async function fetchWorldActivity(
  supabase: SupabaseClient,
  worldId: string,
  filters: ActivityFilters = {},
  cursor: ActivityCursor | null = null,
  pageSize: number = ACTIVITY_PAGE_SIZE,
  domain: ActivityDomain = "economy",
): Promise<ActivityPage> {
  let query = supabase.from("world_activity").select(COLUMNS).eq("world_id", worldId).eq("domain", domain);

  if (filters.kinds?.length) query = query.in("kind", [...filters.kinds]);
  if (filters.personaId && UUID.test(filters.personaId)) {
    query = query.or(`persona_id.eq.${filters.personaId},target_persona_id.eq.${filters.personaId}`);
  }
  const from = filters.from ? localMidnight(filters.from) : null;
  if (from) query = query.gte("created_at", from);
  const to = filters.to ? localMidnight(filters.to, 1) : null;
  if (to) query = query.lt("created_at", to);
  // Le curseur vient d'une page déjà lue en base : date et identifiant sûrs.
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  if (error || !data) return { entries: [], cursor: null, error: true };

  const rows = (data as unknown as WorldActivityEntry[]).map((r) => ({
    ...r,
    amount: Number(r.amount ?? 0),
    items: Array.isArray(r.items) ? r.items : [],
    data: r.data ?? {},
  }));
  const entries = rows.slice(0, pageSize);
  const last = entries[entries.length - 1];
  return {
    entries,
    cursor: rows.length > pageSize && last ? { created_at: last.created_at, id: last.id } : null,
  };
}
