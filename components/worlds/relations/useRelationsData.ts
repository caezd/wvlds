"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { messageErreurAction } from "@/lib/actionErrors";
import {
  acceptPersonaRelation,
  createPersonaRelation,
  deletePersonaRelation,
  updatePersonaRelation,
} from "@/app/actions/personaRelations";
import { BLOCK_W } from "./geometry";
import type { BlockPos, CGroup, CMember, CPersona, CRelType, CRelation } from "./types";

// Les données du canevas de relations, et tout ce qu'on peut y écrire.
//
// Le canevas desktop et la liste mobile montrent la même chose par deux
// chemins ; ce crochet est leur seule source. Les écritures sur les relations
// passent par les actions serveur (validation, décision « acceptée ou en
// attente ») ; les positions de blocs et les groupes restent des écritures
// directes, la RLS suffisant à les garder.

const RELATION_COLUMNS = "id, from_persona_id, to_persona_id, type, label, description, status";
const TYPE_COLUMNS = "id, name, color, dash, sort_index, mutual, marital_status";

export function useRelationsData(worldId: string, userId: string, canAdmin: boolean) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  // `load` ne dépend pas de `t` : sa seule lecture (les noms des types par
  // défaut) passe par une ref, sans quoi un `t` d'identité changeante
  // relancerait le chargement à chaque rendu.
  const tRef = React.useRef(t);
  tRef.current = t;

  const [loading, setLoading] = React.useState(true);
  const [personas, setPersonas] = React.useState<CPersona[]>([]);
  const [members, setMembers] = React.useState<CMember[]>([]);
  const [groups, setGroups] = React.useState<CGroup[]>([]);
  const [relTypes, setRelTypes] = React.useState<CRelType[]>([]);
  const [groupByPersona, setGroupByPersona] = React.useState<Map<string, string>>(new Map());
  const [relations, setRelations] = React.useState<CRelation[]>([]);
  const [blockPos, setBlockPos] = React.useState<Map<string, BlockPos>>(new Map());
  const [ownerId, setOwnerId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: pRows },
        { data: mRows },
        { data: wRow },
        { data: gRows },
        { data: aRows },
        { data: rRows },
        { data: posRows },
        { data: rtRows },
      ] = await Promise.all([
        supabase.from("personas").select("id, name, avatar_url, user_id, narrative_status").eq("world_id", worldId).eq("is_template", false).is("deleted_at", null),
        supabase.from("world_members").select("user_id").eq("world_id", worldId),
        supabase.from("worlds").select("owner_id").eq("id", worldId).single(),
        supabase.from("world_persona_groups").select("id, name, color, sort_index").eq("world_id", worldId).order("sort_index"),
        supabase.from("persona_group_assignments").select("persona_id, group_id").eq("world_id", worldId),
        supabase.from("persona_relations").select(RELATION_COLUMNS).eq("world_id", worldId),
        supabase.from("user_canvas_positions").select("user_id, x, y").eq("world_id", worldId),
        supabase.from("world_relation_types").select(TYPE_COLUMNS).eq("world_id", worldId).order("sort_index"),
      ]);

      const allPersonas = (pRows ?? []) as CPersona[];
      setPersonas(allPersonas);
      setGroups((gRows ?? []) as CGroup[]);
      setRelations((rRows ?? []) as CRelation[]);

      // Un monde sans type reçoit deux types par défaut à sa première visite
      // par un admin. Écriture directe : la RLS des types est propriétaire
      // seulement, un admin qui n'est pas propriétaire échoue en silence et
      // retombe sur une liste vide — le message « aucun type » le lui dira.
      let loadedTypes = (rtRows ?? []) as CRelType[];
      if (loadedTypes.length === 0 && canAdmin) {
        const defaults = [
          { world_id: worldId, name: tRef.current("defaultAlly"), color: "#22c55e", dash: "", sort_index: 0 },
          { world_id: worldId, name: tRef.current("defaultEnemy"), color: "#ef4444", dash: "", sort_index: 1 },
        ];
        const { data: seeded } = await supabase.from("world_relation_types").insert(defaults).select(TYPE_COLUMNS);
        loadedTypes = (seeded ?? []) as CRelType[];
      }
      setRelTypes(loadedTypes);

      const gbp = new Map<string, string>();
      for (const a of (aRows ?? []) as { persona_id: string; group_id: string }[]) gbp.set(a.persona_id, a.group_id);
      setGroupByPersona(gbp);

      const owner = (wRow as { owner_id: string | null } | null)?.owner_id ?? null;
      setOwnerId(owner);
      const uids = new Set<string>(((mRows ?? []) as { user_id: string }[]).map((m) => m.user_id));
      if (owner) uids.add(owner);
      const { data: profs } = await supabase.from("profiles").select("id, username, avatar_url").in("id", Array.from(uids));
      setMembers(((profs ?? []) as { id: string; username: string | null; avatar_url: string | null }[])
        .map((p) => ({ user_id: p.id, username: p.username, avatar_url: p.avatar_url })));

      // Une position par joueur : celle qu'il a enregistrée, sinon une case
      // d'une grille de trois colonnes.
      const saved = new Map<string, BlockPos>();
      for (const p of (posRows ?? []) as { user_id: string; x: number; y: number }[]) saved.set(p.user_id, { x: p.x, y: p.y });
      const hasPersonas = new Set(allPersonas.map((p) => p.user_id));
      let autoIdx = 0;
      const next = new Map<string, BlockPos>();
      for (const uid of uids) {
        if (!hasPersonas.has(uid)) continue;
        const s = saved.get(uid);
        if (s) next.set(uid, s);
        else {
          next.set(uid, { x: 24 + (autoIdx % 3) * (BLOCK_W + 56), y: 24 + Math.floor(autoIdx / 3) * 320 });
          autoIdx++;
        }
      }
      setBlockPos(next);
    } finally {
      setLoading(false);
    }
  }, [supabase, worldId, canAdmin]);

  React.useEffect(() => { void load(); }, [load]);

  /** Relit les relations seules — après un geste dont la base a pu faire plus que demandé. */
  const reloadRelations = React.useCallback(async () => {
    const { data } = await supabase.from("persona_relations").select(RELATION_COLUMNS).eq("world_id", worldId);
    setRelations((data ?? []) as CRelation[]);
  }, [supabase, worldId]);

  // ── Écritures ──

  async function createRelation(input: { fromPersonaId: string; toPersonaId: string; typeId: string; description: string | null }) {
    const existing = relations.find((r) => r.from_persona_id === input.fromPersonaId && r.to_persona_id === input.toPersonaId);
    const typeName = relTypes.find((tp) => tp.id === input.typeId)?.name ?? input.typeId;
    if (existing) {
      // Une relation par sens et par paire : recréer vers la même cible, c'est
      // la retyper (et refusé si l'une des deux est réciproque).
      const res = await updatePersonaRelation(existing.id, { typeId: input.typeId, description: input.description });
      if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return false; }
      setRelations((p) => p.map((r) => (r.id === existing.id ? { ...r, type: input.typeId, description: input.description } : r)));
      toast.success(t("typeChanged", { name: typeName }));
      return true;
    }
    const res = await createPersonaRelation({ worldId, ...input });
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return false; }
    setRelations((p) => [...p, res.relation]);
    toast.success(res.relation.status === "pending" ? t("relRequested", { name: typeName }) : t("relCreated", { name: typeName }));
    if (res.relation.status === "accepted" && relTypes.find((tp) => tp.id === input.typeId)?.mutual) void reloadRelations();
    return true;
  }

  async function updateRelation(id: string, patch: { typeId?: string; description?: string | null }) {
    const res = await updatePersonaRelation(id, patch);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return false; }
    setRelations((p) => p.map((r) => (r.id === id
      ? { ...r, ...(patch.typeId !== undefined ? { type: patch.typeId } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) }
      : r)));
    return true;
  }

  async function deleteRelation(id: string) {
    const res = await deletePersonaRelation(id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    // Le miroir d'une relation réciproque part avec elle (déclencheur) : on relit.
    void reloadRelations();
  }

  async function acceptRelation(id: string) {
    const res = await acceptPersonaRelation(id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    toast.success(t("relAccepted"));
    void reloadRelations();
  }

  async function assignGroup(personaId: string, gid: string | null) {
    const { error } = !gid
      ? await supabase.from("persona_group_assignments").delete().eq("persona_id", personaId).eq("world_id", worldId)
      : await supabase.from("persona_group_assignments").upsert({ persona_id: personaId, world_id: worldId, group_id: gid });
    if (error) { toast.error(tCommon("saveError"), { description: error.message }); return; }
    setGroupByPersona((p) => {
      const n = new Map(p);
      if (gid) n.set(personaId, gid); else n.delete(personaId);
      return n;
    });
  }

  async function savePos(uid: string, x: number, y: number) {
    const { error } = await supabase
      .from("user_canvas_positions")
      .upsert({ user_id: uid, world_id: worldId, x, y }, { onConflict: "user_id,world_id" });
    if (error) toast.error(t("savePositionError"), { description: error.message });
  }

  // ── Dérivés ──

  const personaMap = React.useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas]);
  const relTypeMap = React.useMemo(() => new Map(relTypes.map((tp) => [tp.id, tp])), [relTypes]);
  const myPersonaIds = React.useMemo(() => new Set(personas.filter((p) => p.user_id === userId).map((p) => p.id)), [personas, userId]);
  const personasByUser = React.useMemo(() => {
    const m = new Map<string, CPersona[]>();
    for (const p of personas) {
      if (!m.has(p.user_id)) m.set(p.user_id, []);
      m.get(p.user_id)!.push(p);
    }
    return m;
  }, [personas]);
  const userList = React.useMemo(
    () => members
      .filter((m) => (personasByUser.get(m.user_id)?.length ?? 0) > 0)
      .map((m) => ({ member: m, ps: personasByUser.get(m.user_id) ?? [] })),
    [members, personasByUser],
  );

  /** Le joueur peut écrire au départ de ce persona. */
  const canEditFrom = React.useCallback((personaId: string) => canAdmin || myPersonaIds.has(personaId), [canAdmin, myPersonaIds]);

  return {
    loading, personas, members, groups, relTypes, groupByPersona, relations, blockPos, ownerId,
    personaMap, relTypeMap, myPersonaIds, personasByUser, userList, canEditFrom,
    setBlockPos,
    createRelation, updateRelation, deleteRelation, acceptRelation, assignGroup, savePos,
  };
}

export type RelationsData = ReturnType<typeof useRelationsData>;
