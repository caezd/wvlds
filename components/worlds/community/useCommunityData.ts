"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePersonasChangedVersion } from "@/hooks/usePersonasChanged";

import { createClient } from "@/lib/supabase/client";
import { RPC } from "@/lib/constants";
import { fetchSectionsByPersona } from "@/lib/personaSections";
import { narrativeStatusOf } from "@/lib/personaStatus";
import { reviewStatusOf } from "@/lib/personaReview";
import { fetchWorldMemberActivity, fetchWorldMembers, type WorldMemberActivity, type WorldMemberRow } from "@/lib/worldMembers";
import type { PersonaSectionWithFields } from "@/types/personas";
import type { MaritalStatus, PersonaNarrativeStatus, PersonaReviewStatus } from "@/types/db";
import type { PersonaActivity } from "@/components/personas/shelves/buildShelves";

/** Un persona du monde tel que la page des membres l'affiche et le filtre. */
export type CommunityPersona = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  user_id: string;
  username: string | null;
  created_at: string | null;
  narrative_status: PersonaNarrativeStatus;
  review_status: PersonaReviewStatus;
  sheet_complete: boolean;
  is_npc: boolean;
  // Ce que l'éditeur d'un PNJ demande, pour qui les gère.
  avatar_config?: unknown;
  banner_url?: string | null;
  avatar_frame_id?: string | null;
  frame?: { asset_url?: string | null } | null;
  faceclaim?: string | null;
  marital_status?: MaritalStatus | null;
  spouse_persona_id?: string | null;
};

/** Un membre du monde (ou l'ancien membre auquel appartient encore un persona). */
export type CommunityMemberRow = WorldMemberRow & {
  isOwner: boolean;
  /** Plus membre du monde : seuls ses personas le font figurer ici. */
  former?: boolean;
};

export type PersonaGroup = { id: string; name: string; color: string };

type RawPersona = {
  id: string; name: string | null; avatar_url: string | null; user_id: string; created_at: string | null;
  narrative_status: string | null; review_status?: string | null; sheet_complete?: boolean | null; is_npc?: boolean | null;
  avatar_config?: unknown; banner_url?: string | null; avatar_frame_id?: string | null; faceclaim?: string | null;
  marital_status?: MaritalStatus | null; spouse_persona_id?: string | null; frame?: { asset_url?: string | null } | null;
};

/**
 * Tout ce que la page des membres affiche, chargé en parallèle : les membres
 * (profil, rôles, carte), les personas du monde avec leurs groupes, les PNJ.
 * L'activité — des membres, des personas — arrive à part : elle n'empêche pas
 * d'afficher la page.
 */
export function useCommunityData({
  worldId,
  ownerId,
  enabled,
  canManageNpc,
}: {
  worldId: string;
  ownerId: string;
  /** Monde partagé : sans lui, rien à charger. */
  enabled: boolean;
  canManageNpc: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<CommunityMemberRow[]>([]);
  const [personas, setPersonas] = useState<CommunityPersona[]>([]);
  const [npcs, setNpcs] = useState<CommunityPersona[]>([]);
  const [npcSections, setNpcSections] = useState<Map<string, PersonaSectionWithFields[]>>(new Map());
  const [groups, setGroups] = useState<PersonaGroup[]>([]);
  const [groupByPersona, setGroupByPersona] = useState<Map<string, string>>(new Map());
  const [memberActivity, setMemberActivity] = useState<Map<string, WorldMemberActivity>>(new Map());
  const [personaActivity, setPersonaActivity] = useState<Map<string, PersonaActivity>>(new Map());
  const [loading, setLoading] = useState(enabled);
  // Un persona créé ou supprimé depuis un tiroir : on recharge.
  const personasVersion = usePersonasChangedVersion();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      // Un rechargement (signal) garde la liste affichée plutôt que le squelette.
      if (personasVersion === 0) setLoading(true);
      const memberActivityPromise = fetchWorldMemberActivity(supabase, worldId);
      type ActivityRow = { persona_id: string; message_count: number; last_message_at: string };
      const personaActivityPromise: Promise<ActivityRow[]> = supabase
        .rpc(RPC.GET_WORLD_PERSONA_ACTIVITY, { p_world_id: worldId })
        .then(({ data }: { data: ActivityRow[] | null }) => (Array.isArray(data) ? data : []));

      const [members, { data: personaRows }, { data: groupRows }, { data: assignRows }] = await Promise.all([
        fetchWorldMembers(supabase, worldId, ownerId),
        supabase
          .from("personas")
          .select("id, name, avatar_url, user_id, created_at, narrative_status, review_status, sheet_complete, is_npc, avatar_config, banner_url, avatar_frame_id, faceclaim, marital_status, spouse_persona_id, frame:avatar_frame_id(asset_url)")
          .eq("world_id", worldId)
          .eq("is_template", false)
          .is("deleted_at", null),
        supabase.from("world_persona_groups").select("id, name, color").eq("world_id", worldId).order("sort_index"),
        supabase.from("persona_group_assignments").select("persona_id, group_id").eq("world_id", worldId),
      ]);

      const raw = (personaRows ?? []) as RawPersona[];
      const npcRows = raw.filter((r) => !!r.is_npc);
      // Un persona dont le joueur a quitté le monde reste visible, sous son pseudo.
      const memberIds = new Set(members.map((m) => m.user_id));
      const formerIds = [...new Set(raw.filter((r) => !r.is_npc && !memberIds.has(r.user_id)).map((r) => r.user_id))];
      type ProfileLite = { id: string; username: string | null; avatar_url: string | null };
      const [sectionsByNpc, formerProfiles]: [Map<string, PersonaSectionWithFields[]>, ProfileLite[]] = await Promise.all([
        canManageNpc && npcRows.length > 0
          ? fetchSectionsByPersona(supabase, npcRows.map((r) => r.id))
          : Promise.resolve(new Map<string, PersonaSectionWithFields[]>()),
        formerIds.length > 0
          ? supabase.from("profiles").select("id, username, avatar_url").in("id", formerIds).then(({ data }: { data: unknown }) => (data ?? []) as ProfileLite[])
          : Promise.resolve([] as ProfileLite[]),
      ]);
      if (cancelled) return;

      const formerRows: CommunityMemberRow[] = formerIds.map((id) => {
        const profile = formerProfiles.find((p) => p.id === id);
        return {
          user_id: id, username: profile?.username ?? null, avatar_url: profile?.avatar_url ?? null, role_ids: [],
          status: "active", status_until: null, status_note: null, bio: null, availability: null, timezone: null,
          birthday_month: null, birthday_day: null, isOwner: false, former: true,
        };
      });
      const allRows: CommunityMemberRow[] = [...members.map((m) => ({ ...m, isOwner: m.user_id === ownerId })), ...formerRows];
      const usernameByUser = new Map(allRows.map((m) => [m.user_id, m.username]));

      const toPersona = (r: RawPersona): CommunityPersona => ({
        id: r.id,
        name: r.name,
        avatar_url: r.avatar_url,
        user_id: r.user_id,
        username: usernameByUser.get(r.user_id) ?? null,
        created_at: r.created_at,
        narrative_status: narrativeStatusOf(r.narrative_status),
        review_status: reviewStatusOf(r.review_status),
        sheet_complete: r.sheet_complete ?? true,
        is_npc: !!r.is_npc,
        avatar_config: r.avatar_config,
        banner_url: r.banner_url,
        avatar_frame_id: r.avatar_frame_id,
        frame: r.frame,
        faceclaim: r.faceclaim,
        marital_status: r.marital_status,
        spouse_persona_id: r.spouse_persona_id,
      });

      setRows(allRows);
      setPersonas(raw.filter((r) => !r.is_npc).map(toPersona));
      setNpcs(npcRows.map(toPersona));
      setNpcSections(sectionsByNpc);
      setGroups((groupRows ?? []) as PersonaGroup[]);
      setGroupByPersona(new Map(((assignRows ?? []) as { persona_id: string; group_id: string }[]).map((a) => [a.persona_id, a.group_id])));
      setLoading(false);

      const [memberAct, personaAct] = await Promise.all([memberActivityPromise, personaActivityPromise]);
      if (cancelled) return;
      setMemberActivity(memberAct);
      setPersonaActivity(new Map(personaAct.map((r) => [r.persona_id, { count: r.message_count, lastAt: r.last_message_at }])));
    }

    void load();
    return () => { cancelled = true; };
  }, [supabase, worldId, ownerId, enabled, canManageNpc, personasVersion]);

  const patchRow = useCallback((userId: string, fields: Partial<CommunityMemberRow>) => {
    setRows((prev) => prev.map((x) => (x.user_id === userId ? { ...x, ...fields } : x)));
  }, []);
  const removeRow = useCallback((userId: string) => {
    setRows((prev) => prev.filter((x) => x.user_id !== userId));
  }, []);

  return { rows, patchRow, removeRow, personas, npcs, npcSections, groups, groupByPersona, memberActivity, personaActivity, loading };
}
