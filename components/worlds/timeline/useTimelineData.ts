"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RPC } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { TimelineEventItem, TimelineJournalItem } from "@/lib/worldTimelineItems";
import type { WorldTimelineDate } from "@/types/worlds";

/** Qui a ouvert un salon : le membre du premier message, et le persona sous
 *  lequel il l'a écrit, dans la couleur de son groupe (migration 192). */
export type TimelineOpener = { name: string; persona: string | null; personaColor: string | null };
export type TimelineArc = { id: string; name: string; color: string; position: number };
export type TimelineCategory = { id: string; title: string };
/** Un salon daté, tel que la frise le lit : son titre, sa date, son arc, sa
 *  catégorie, son statut enregistré (migration 197) et sa dernière activité
 *  (dernier message, sinon sa création), d'où se déduit « en sommeil ». */
export type TimelineRoomRow = {
  id: string;
  title: string | null;
  name: string | null;
  date: WorldTimelineDate;
  arcId: string | null;
  categoryId: string | null;
  status: "active" | "completed" | "abandoned";
  lastActivity: string | null;
};
/** Un lien de suite (migration 194) : `chatroomId` suit `previousId`. */
export type TimelineSequel = {
  id: string;
  chatroomId: string;
  previousId: string;
  status: "pending" | "accepted";
  createdByName: string | null;
};
export type TimelineEvent = TimelineEventItem & { wikiPage: { slug: string; title: string } | null };
export type TimelinePersona = { id: string; name: string; color: string | null };

/** Ce que rend `get_world_timeline` (migration 198). */
type TimelinePayload = {
  rooms: {
    id: string;
    title: string | null;
    name: string | null;
    timeline_date: WorldTimelineDate;
    arc_id: string | null;
    category_id: string | null;
    status: TimelineRoomRow["status"] | null;
    last_activity: string | null;
    opener_name: string | null;
    opener_persona: string | null;
    opener_color: string | null;
    persona_ids: string[] | null;
  }[];
  personas: TimelinePersona[];
  events: {
    id: string;
    title: string;
    description: string | null;
    timeline_date: WorldTimelineDate;
    end_date: WorldTimelineDate | null;
    wiki_page_id: string | null;
    wiki_page: { slug: string; title: string } | null;
  }[];
  arcs: TimelineArc[];
  categories: TimelineCategory[];
  sequels: {
    id: string;
    chatroom_id: string;
    previous_id: string;
    status: TimelineSequel["status"];
    created_by_name: string | null;
  }[];
  mine: string[];
  journals: { id: string; persona_id: string; persona_name: string | null; body: string; timeline_date: WorldTimelineDate }[];
};

/** Tout ce que la frise affiche, prêt à l'emploi. */
type TimelineData = {
  rooms: TimelineRoomRow[];
  events: TimelineEvent[];
  arcs: TimelineArc[];
  categories: TimelineCategory[];
  journals: TimelineJournalItem[];
  openers: ReadonlyMap<string, TimelineOpener>;
  roomPersonas: ReadonlyMap<string, ReadonlySet<string>>;
  personas: TimelinePersona[];
  sequels: TimelineSequel[];
  mine: ReadonlySet<string>;
};

const EMPTY: TimelineData = {
  rooms: [],
  events: [],
  arcs: [],
  categories: [],
  journals: [],
  openers: new Map(),
  roomPersonas: new Map(),
  personas: [],
  sequels: [],
  mine: new Set(),
};

function fromPayload(p: Partial<TimelinePayload>): TimelineData {
  const rooms = p.rooms ?? [];
  const openers = new Map<string, TimelineOpener>();
  const roomPersonas = new Map<string, ReadonlySet<string>>();
  for (const r of rooms) {
    if (r.opener_name) openers.set(r.id, { name: r.opener_name, persona: r.opener_persona, personaColor: r.opener_color });
    if (r.persona_ids?.length) roomPersonas.set(r.id, new Set(r.persona_ids));
  }
  return {
    rooms: rooms.map((r) => ({
      id: r.id,
      title: r.title,
      name: r.name,
      date: r.timeline_date,
      arcId: r.arc_id,
      categoryId: r.category_id,
      status: r.status ?? "active",
      lastActivity: r.last_activity,
    })),
    events: (p.events ?? []).map((e) => ({
      kind: "event",
      id: e.id,
      date: e.timeline_date,
      endDate: e.end_date ?? null,
      title: e.title,
      description: e.description,
      wikiPageId: e.wiki_page_id,
      wikiPage: e.wiki_page,
    })),
    arcs: p.arcs ?? [],
    categories: p.categories ?? [],
    journals: (p.journals ?? []).map((j) => ({
      kind: "journal",
      id: j.id,
      date: j.timeline_date,
      personaId: j.persona_id,
      personaName: j.persona_name ?? "",
      body: j.body,
    })),
    openers,
    roomPersonas,
    personas: [...(p.personas ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    sequels: (p.sequels ?? []).map((s) => ({
      id: s.id,
      chatroomId: s.chatroom_id,
      previousId: s.previous_id,
      status: s.status,
      createdByName: s.created_by_name,
    })),
    mine: new Set(p.mine ?? []),
  };
}

/**
 * Tout ce que la frise affiche, en une requête (`get_world_timeline`,
 * migration 198) : salons datés (avec arc, catégorie, statut, activité, qui
 * l'a ouvert, personas qui y ont écrit), événements, arcs, catégories,
 * suites, salons où l'on joue et, si le monde les montre, journaux datés.
 *
 * `loading` reste vrai jusqu'à la première réponse : la frise s'affiche alors
 * d'un bloc, sans couleurs ni « par … » qui arrivent après coup. Les
 * rechargements (après une modification) gardent l'affichage en place. Une
 * requête en échec laisse la frise vide, et le dit en console.
 */
export function useTimelineData(worldId: string, showJournals: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TimelineData>(EMPTY);
  const [loading, setLoading] = useState(true);
  // La réponse la plus récente seulement : un rechargement lancé avant la
  // fin du précédent ne se fait pas écraser par lui.
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const { data: payload, error } = await supabase.rpc(RPC.GET_WORLD_TIMELINE, {
      p_world_id: worldId,
      p_with_journals: showJournals,
    });
    if (id !== requestId.current) return;
    if (error) console.error("[WorldTimeline] chronologie", error);
    else setData(fromPayload((payload ?? {}) as Partial<TimelinePayload>));
    setLoading(false);
  }, [supabase, worldId, showJournals]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { supabase, loading, ...data, reload };
}
