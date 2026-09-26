"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RPC, TABLE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { TimelineEventItem, TimelineJournalItem } from "@/lib/worldTimelineItems";
import type { WorldTimelineDate } from "@/types/worlds";

/** Qui a ouvert un salon : le membre du premier message, et le persona sous
 *  lequel il l'a écrit, dans la couleur de son groupe (migration 192). */
export type TimelineOpener = { name: string; persona: string | null; personaColor: string | null };
export type TimelineArc = { id: string; name: string; color: string; position: number };
export type TimelineCategory = { id: string; title: string };
export type TimelineRoomMeta = { arcId: string | null; previousId: string | null; categoryId: string | null };
export type TimelineEvent = TimelineEventItem & { wikiPage: { slug: string; title: string } | null };

type OpenerRow = { chat_id: string; author_name: string | null; persona_name: string | null; group_color: string | null };
type PersonaRow = { chat_id: string; persona_id: string; persona_name: string };
type EventRow = {
  id: string;
  title: string;
  description: string | null;
  timeline_date: WorldTimelineDate;
  wiki_page_id: string | null;
  wiki_page: { slug: string; title: string } | null;
};
type JournalRow = { id: string; persona_id: string; body: string; timeline_date: WorldTimelineDate; persona: { name: string } | null };
type RoomRow = { id: string; arc_id: string | null; previous_chatroom_id: string | null; category_id: string | null };

function logError(what: string, error: unknown) {
  console.error(`[WorldTimeline] ${what}`, error);
}

/**
 * Ce que la frise charge d'elle-même, en plus des salons que la page lui
 * passe : événements, arcs, liens entre salons (arc, suite, catégorie),
 * catégories, journaux datés (si le monde les montre), personas de chaque
 * salon et qui l'a ouvert. Tout part en parallèle à l'ouverture ; les titres
 * des salons s'affichent sans l'attendre. Une requête en échec laisse sa
 * part vide, sans retenir le reste.
 */
export function useTimelineData(worldId: string, showJournals: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [arcs, setArcs] = useState<TimelineArc[]>([]);
  const [roomMeta, setRoomMeta] = useState<ReadonlyMap<string, TimelineRoomMeta>>(new Map());
  const [categories, setCategories] = useState<TimelineCategory[]>([]);
  const [journals, setJournals] = useState<TimelineJournalItem[]>([]);
  const [openers, setOpeners] = useState<ReadonlyMap<string, TimelineOpener>>(new Map());
  const [roomPersonas, setRoomPersonas] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);

  const reloadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from(TABLE.WORLD_TIMELINE_EVENTS)
      .select("id, title, description, timeline_date, wiki_page_id, wiki_page:wiki_page_id(slug, title)")
      .eq("world_id", worldId);
    if (error) return logError("événements", error);
    setEvents(((data ?? []) as unknown as EventRow[]).map((e) => ({
      kind: "event",
      id: e.id,
      date: e.timeline_date,
      title: e.title,
      description: e.description,
      wikiPageId: e.wiki_page_id,
      wikiPage: e.wiki_page,
    })));
  }, [supabase, worldId]);

  const reloadArcs = useCallback(async () => {
    const { data, error } = await supabase
      .from(TABLE.WORLD_TIMELINE_ARCS)
      .select("id, name, color, position")
      .eq("world_id", worldId)
      .order("position")
      .order("name");
    if (error) return logError("arcs", error);
    setArcs((data ?? []) as TimelineArc[]);
  }, [supabase, worldId]);

  const reloadRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from(TABLE.CHATROOMS)
      .select("id, arc_id, previous_chatroom_id, category_id")
      .eq("world_id", worldId)
      .not("timeline_date", "is", null);
    if (error) return logError("liens des salons", error);
    setRoomMeta(new Map(((data ?? []) as RoomRow[]).map((r) => [
      r.id,
      { arcId: r.arc_id, previousId: r.previous_chatroom_id, categoryId: r.category_id },
    ])));
  }, [supabase, worldId]);

  useEffect(() => {
    let cancelled = false;
    void reloadEvents();
    void reloadArcs();
    void reloadRooms();

    void supabase
      .from(TABLE.CHATROOM_CATEGORIES)
      .select("id, title")
      .eq("world_id", worldId)
      .order("position")
      .then(({ data, error }: { data: TimelineCategory[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) return logError("catégories", error);
        setCategories(data ?? []);
      });

    void supabase
      .rpc(RPC.GET_CHATROOM_OPENERS, { p_world_id: worldId })
      .then(({ data, error }: { data: OpenerRow[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) return logError("auteurs des salons", error);
        const map = new Map<string, TimelineOpener>();
        for (const row of data ?? []) {
          if (row.author_name) {
            map.set(row.chat_id, { name: row.author_name, persona: row.persona_name, personaColor: row.group_color });
          }
        }
        setOpeners(map);
      });

    void supabase
      .rpc(RPC.GET_CHATROOM_PERSONAS, { p_world_id: worldId })
      .then(({ data, error }: { data: PersonaRow[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) return logError("personas des salons", error);
        const byRoom = new Map<string, Set<string>>();
        const names = new Map<string, string>();
        for (const row of data ?? []) {
          if (!byRoom.has(row.chat_id)) byRoom.set(row.chat_id, new Set());
          byRoom.get(row.chat_id)!.add(row.persona_id);
          names.set(row.persona_id, row.persona_name);
        }
        setRoomPersonas(byRoom);
        setPersonas([...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      });

    return () => { cancelled = true; };
  }, [supabase, worldId, reloadEvents, reloadArcs, reloadRooms]);

  // Les journaux : seulement si le monde les montre.
  useEffect(() => {
    if (!showJournals) {
      setJournals([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from(TABLE.PERSONA_JOURNAL_ENTRIES)
      .select("id, persona_id, body, timeline_date, persona:persona_id(name)")
      .eq("world_id", worldId)
      .not("timeline_date", "is", null)
      .then(({ data, error }: { data: JournalRow[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) return logError("journaux", error);
        setJournals((data ?? []).map((j) => ({
          kind: "journal",
          id: j.id,
          date: j.timeline_date,
          personaId: j.persona_id,
          personaName: j.persona?.name ?? "",
          body: j.body,
        })));
      });
    return () => { cancelled = true; };
  }, [supabase, worldId, showJournals]);

  return {
    supabase,
    events,
    arcs,
    roomMeta,
    categories,
    journals,
    openers,
    roomPersonas,
    personas,
    reloadEvents,
    reloadArcs,
    reloadRooms,
  };
}
