"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, Drama, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/textFormatting";
import { PersonaCard } from "./PersonaCard";
import { PersonaCreateSheet } from "./PersonaCreateSheet";
import { PersonaProfileSheetTrigger } from "./PersonaProfileSheetTrigger";
import { PersonaStatusBadge } from "./PersonaStatusBadge";
import { PersonaSheetBadge } from "./PersonaSheetBadge";
import { PersonaNpcBadge } from "./PersonaNpcBadge";
import { fetchSectionsByPersona } from "@/lib/personaSections";
import type { PersonaSectionWithFields } from "@/types/personas";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AsidePersona } from "./WorldPersonaAsideClient";
import { useTranslations } from "next-intl";
import { StoredImage } from "@/components/ui/stored-image";
import { avatarThumbWidth } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { effectiveStatus } from "@/lib/worldMembers";
import { isRetiredStatus, narrativeStatusOf } from "@/lib/personaStatus";
import { reviewStatusOf } from "@/lib/personaReview";
import {
  EMPTY_PERSONA_FILTERS,
  PERSONA_FILTER_ALL as ALL,
  applyPersonaFilters,
  letterKey,
  memberLabel,
  sortPersonas,
  type PersonaFilters,
  type PersonaSortKey,
} from "./personaFilters";
import { PersonaFilterBar } from "./PersonaFilterBar";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useWorldReviewActive } from "@/hooks/useWorldReviewActive";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { MemberStatusBadge } from "@/components/worlds/members/WorldMemberCard";
import type { PersonaNarrativeStatus, PersonaReviewStatus, WorldMemberStatus } from "@/types/db";

type OtherPersona = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  user_id: string;
  username: string | null;
  created_at: string | null;
  narrative_status: PersonaNarrativeStatus;
  review_status: PersonaReviewStatus;
  sheet_complete: boolean;
  /** PNJ partagé du monde (migration 182) : dans sa propre section. */
  is_npc: boolean;
  /** Statut du joueur dans ce monde ; « active » quand il n'a rien déclaré. */
  playerStatus: WorldMemberStatus;
  playerStatusUntil: string | null;
};

/** Un PNJ avec tout ce que l'éditeur demande — pour qui le gère. */
type NpcPersona = OtherPersona & Omit<AsidePersona, "sections" | "id" | "name" | "avatar_url" | "narrative_status" | "review_status" | "sheet_complete" | "created_at">;

type Group = { id: string; name: string; color: string };

// Les filtres et le tri vivent dans `personaFilters.ts` ; ré-exportés pour les tests.
export { applyPersonaFilters, sortPersonas, PERSONA_FILTER_ALL, PERSONA_FILTER_NO_GROUP, SHEET_FILTERS } from "./personaFilters";
export type { PersonaFilters } from "./personaFilters";
type SortKey = PersonaSortKey;

// ── Carte lecture seule : persona d'un autre membre ────────────────────────

function OtherPersonaCard({ persona, groupColor, unnamed, openOnMount, reviewActive = true }: { persona: OtherPersona; groupColor?: string; unnamed: string; openOnMount?: boolean; reviewActive?: boolean }) {
  const name = persona.name ?? unnamed;
  const retired = isRetiredStatus(persona.narrative_status);
  return (
    <PersonaProfileSheetTrigger
      personaId={persona.id}
      userId={persona.user_id}
      label={name}
      openOnMount={openOnMount}
      triggerClassName="group relative block w-full aspect-square rounded-lg overflow-hidden bg-muted shadow-sm hover:shadow-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span data-narrative-status={persona.narrative_status} className="contents">
        {persona.avatar_url ? (
          <StoredImage
            url={persona.avatar_url}
            width={avatarThumbWidth(160)}
            alt={name}
            className={cn("object-cover", retired && "grayscale opacity-80")}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-2xl font-bold text-muted-foreground select-none">
            {getInitials(name, "P")}
          </div>
        )}
      </span>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      {groupColor && <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: groupColor }} />}
      <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
        <PersonaNpcBadge isNpc={persona.is_npc} className="bg-black/60 text-white dark:text-white" />
        <PersonaStatusBadge status={persona.narrative_status} className="bg-black/60 text-white dark:text-white" />
        <PersonaSheetBadge persona={persona} reviewActive={reviewActive} className="bg-black/60 text-white dark:text-white" />
        {/* Le joueur est en pause ou absent : autant le savoir avant de lui écrire. */}
        {!persona.is_npc && persona.playerStatus !== "active" && (
          <MemberStatusBadge
            status={persona.playerStatus}
            until={persona.playerStatusUntil}
            note={null}
            className="bg-black/60 text-white backdrop-blur-sm dark:text-white"
          />
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <span className="block text-sm font-semibold text-white leading-tight line-clamp-2">{name}</span>
        {!persona.is_npc && (
          <span className="block text-xs text-white/70 leading-tight truncate">{memberLabel(persona.user_id, persona.username)}</span>
        )}
      </div>
    </PersonaProfileSheetTrigger>
  );
}

// ── WorldPersonasPanel ──────────────────────────────────────────────────────

export function WorldPersonasPanel({
  worldId,
  myPersonas,
  restrictInventory = false,
  restrictSkills = false,
  faceclaimsEnabled,
}: {
  worldId: string;
  myPersonas: AsidePersona[];
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  faceclaimsEnabled?: boolean;
}) {
  const t = useTranslations("personas.list");
  const tNpc = useTranslations("personas.npc");
  const supabase = useMemo(() => createClient(), []);
  const { userId: meId, username: myUsername } = useCurrentUser();
  const { can } = useWorldMembership();
  const canReview = can("personas.review");
  const canManageNpc = can("npc.manage");
  // La relecture est une option du monde (migration 184) : sans elle, ni
  // raccourci « à relire », ni états de relecture dans le filtre et les badges.
  const reviewActive = useWorldReviewActive(worldId) === true;
  // `?persona=<id>` (lien d'une notification de relecture) : la fiche s'ouvre d'elle-même.
  const focusPersonaId = useSearchParams()?.get("persona") ?? null;
  const [others, setOthers] = useState<OtherPersona[] | null>(null);
  const [npcs, setNpcs] = useState<NpcPersona[]>([]);
  const [npcSections, setNpcSections] = useState<Map<string, PersonaSectionWithFields[]>>(new Map());
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupByPersona, setGroupByPersona] = useState<Map<string, string>>(new Map());
  const myIds = useMemo(() => new Set(myPersonas.map((p) => p.id)), [myPersonas]);

  const [filters, setFilters] = useState<PersonaFilters>(EMPTY_PERSONA_FILTERS);
  const effectiveFilters = useMemo(() => ({ ...filters, reviewActive }), [filters, reviewActive]);
  const [sort, setSort] = useState<SortKey>("name");

  useEffect(() => {
    let cancelled = false;

    async function loadOthers() {
      const [{ data: personaRows }, { data: groupRows }, { data: assignRows }] = await Promise.all([
        supabase
          .from("personas")
          .select("id, name, avatar_url, user_id, created_at, narrative_status, review_status, sheet_complete, is_npc, avatar_config, banner_url, avatar_frame_id, faceclaim, marital_status, spouse_persona_id, frame:avatar_frame_id(asset_url)")
          .eq("world_id", worldId)
          .eq("is_template", false)
          .is("deleted_at", null),
        supabase.from("world_persona_groups").select("id, name, color").eq("world_id", worldId).order("sort_index"),
        supabase.from("persona_group_assignments").select("persona_id, group_id").eq("world_id", worldId),
      ]);

      type RawPersona = {
        id: string; name: string | null; avatar_url: string | null; user_id: string; created_at: string | null;
        narrative_status: string | null; review_status?: string | null; sheet_complete?: boolean | null; is_npc?: boolean | null;
        avatar_config?: unknown; banner_url?: string | null; avatar_frame_id?: string | null; faceclaim?: string | null;
        marital_status?: AsidePersona["marital_status"]; spouse_persona_id?: string | null; frame?: { asset_url?: string | null } | null;
      };
      // Les PNJ (dont les miens : ils ont leur section) et les personas des autres.
      const allRows = ((personaRows ?? []) as RawPersona[]).filter((r) => !myIds.has(r.id));
      const otherRows = allRows.filter((r) => !r.is_npc);
      const npcRows = allRows.filter((r) => !!r.is_npc);
      const userIds = Array.from(new Set(otherRows.map((r) => r.user_id)));
      // L'éditeur d'un PNJ (gestionnaires) veut ses sections.
      const sectionsByNpc = canManageNpc && npcRows.length > 0
        ? await fetchSectionsByPersona(supabase, npcRows.map((r) => r.id))
        : new Map<string, PersonaSectionWithFields[]>();

      let usernameByUser = new Map<string, string | null>();
      type StatusRow = { user_id: string; status: WorldMemberStatus; status_until: string | null };
      let statusByUser = new Map<string, StatusRow>();
      if (userIds.length > 0) {
        const [{ data: profileRows }, { data: memberRows }] = await Promise.all([
          supabase.from("profiles").select("id, username").in("id", userIds),
          supabase.from("world_members").select("user_id, status, status_until").eq("world_id", worldId).in("user_id", userIds),
        ]);
        type ProfileRow = { id: string; username: string | null };
        usernameByUser = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p.username]));
        statusByUser = new Map(((memberRows ?? []) as StatusRow[]).map((m) => [m.user_id, m]));
      }

      if (cancelled) return;
      setGroups(((groupRows ?? []) as Group[]));
      setGroupByPersona(
        new Map(((assignRows ?? []) as { persona_id: string; group_id: string }[]).map((a) => [a.persona_id, a.group_id])),
      );
      const toOther = (r: RawPersona): OtherPersona => {
        const member = statusByUser.get(r.user_id);
        return {
          id: r.id,
          name: r.name,
          avatar_url: r.avatar_url,
          user_id: r.user_id,
          created_at: r.created_at,
          narrative_status: narrativeStatusOf(r.narrative_status),
          review_status: reviewStatusOf(r.review_status),
          sheet_complete: r.sheet_complete ?? true,
          is_npc: !!r.is_npc,
          username: usernameByUser.get(r.user_id) ?? null,
          playerStatus: member ? effectiveStatus(member) : "active",
          playerStatusUntil: member?.status_until ?? null,
        };
      };
      setOthers(otherRows.map(toOther));
      setNpcs(npcRows.map((r) => ({
        ...toOther(r),
        avatar_config: r.avatar_config,
        banner_url: r.banner_url,
        avatar_frame_id: r.avatar_frame_id,
        frame: r.frame,
        faceclaim: r.faceclaim,
        marital_status: r.marital_status,
        spouse_persona_id: r.spouse_persona_id,
      })));
      setNpcSections(sectionsByNpc);
    }

    void loadOthers();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, canManageNpc]);

  const groupColorById = useMemo(() => new Map(groups.map((g) => [g.id, g.color])), [groups]);

  // Les joueurs proposés par le filtre : ceux qui ont au moins un persona ici.
  const players = useMemo(() => {
    const map = new Map<string, string | null>();
    if (meId && myPersonas.length > 0) map.set(meId, myUsername ?? null);
    for (const p of others ?? []) if (!map.has(p.user_id)) map.set(p.user_id, p.username);
    return [...map.entries()]
      .map(([id, username]) => ({ id, label: memberLabel(id, username) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [others, meId, myUsername, myPersonas.length]);

  const mine = useMemo(() => {
    const withOwner = myPersonas.map((p) => ({
      ...p,
      user_id: meId ?? "",
      username: myUsername ?? null,
      narrative_status: narrativeStatusOf(p.narrative_status),
      is_npc: false,
    }));
    return sortPersonas(applyPersonaFilters(withOwner, effectiveFilters, groupByPersona), sort);
  }, [myPersonas, meId, myUsername, effectiveFilters, groupByPersona, sort]);

  const filteredOthers = useMemo(
    () => sortPersonas(applyPersonaFilters(others ?? [], effectiveFilters, groupByPersona), sort),
    [others, effectiveFilters, groupByPersona, sort],
  );

  const filteredNpcs = useMemo(
    () => sortPersonas(applyPersonaFilters(npcs, effectiveFilters, groupByPersona), sort),
    [npcs, effectiveFilters, groupByPersona, sort],
  );

  // Les fiches des autres qui attendent un relecteur — un raccourci vers le filtre.
  const toReview = useMemo(
    () => (reviewActive ? (others ?? []).filter((p) => p.review_status === "submitted").length : 0),
    [others, reviewActive],
  );

  // Par lettre quand on trie par nom ; à plat sinon, l'ordre parle de lui-même.
  const otherGroups = useMemo(() => {
    if (sort !== "name") return [["", filteredOthers] as [string, OtherPersona[]]];
    const map = new Map<string, OtherPersona[]>();
    for (const p of filteredOthers) {
      const key = letterKey(p.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [filteredOthers, sort]);

  const loadingOthers = others === null;
  const total = myPersonas.length + (others?.length ?? 0) + npcs.length;
  const filtering = filters.query.trim() !== "" || filters.player !== ALL || filters.group !== ALL || filters.status !== ALL || filters.sheet !== ALL || filters.kind !== ALL;
  const showPlayers = filters.kind !== "npc";
  const showNpcs = filters.kind !== "player" && (npcs.length > 0 || canManageNpc);
  const unnamed = t("unnamed");

  const createTrigger = (className: string, label: string, npc = false) => (
    <PersonaCreateSheet
      worldId={worldId}
      restrictInventory={restrictInventory}
      restrictSkills={restrictSkills}
      defaultNpc={npc}
      trigger={
        <button type="button" className={className}>
          <Plus className="h-3.5 w-3.5" />
          {label}
        </button>
      }
    />
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WorldPanelHeader
        icon={<Drama className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={
          <>
            {t("title")}
            {total > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{total}</span>}
          </>
        }
        right={createTrigger(
          "flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          t("newPersona"),
        )}
      />

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-8 px-6 py-6">
          {/* ── Recherche, filtres, tri ── */}
          {total > 0 && (
            <PersonaFilterBar
              filters={filters}
              onFiltersChange={setFilters}
              sort={sort}
              onSortChange={setSort}
              players={players}
              groups={groups}
              showKind={npcs.length > 0 || canManageNpc}
              reviewActive={reviewActive}
            />
          )}

          {/* ── Fiches à relire (relecteurs) ── */}
          {canReview && toReview > 0 && filters.sheet !== "submitted" && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, sheet: "submitted" }))}
              className="flex w-full items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-left text-sm text-sky-800 transition-colors hover:bg-sky-500/15 dark:text-sky-200"
            >
              <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden />
              {toReview === 1 ? t("toReviewOne") : t("toReview", { count: toReview })}
            </button>
          )}

          {/* ── Mes personas ── */}
          {showPlayers && (mine.length > 0 || !filtering) && (
            <section>
              <h3 className="mb-4 text-sm font-semibold text-foreground">
                {t("mine")}
                {mine.length > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{mine.length}</span>}
              </h3>

              {myPersonas.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-soft py-10 text-center">
                  <p className="text-sm text-muted-foreground">{t("noneMine")}</p>
                  {createTrigger(
                    "flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
                    t("createFirst"),
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {mine.map((p) => (
                    <PersonaCard
                      key={p.id}
                      personaId={p.id}
                      personaName={p.name ?? unnamed}
                      avatarUrl={p.avatar_url}
                      avatarConfig={p.avatar_config as never}
                      bannerUrl={p.banner_url}
                      initialFrameId={p.avatar_frame_id}
                      initialFrameUrl={p.frame?.asset_url}
                      initialFaceclaim={p.faceclaim ?? null}
                      initialMaritalStatus={p.marital_status ?? null}
                      initialSpousePersonaId={p.spouse_persona_id ?? null}
                      narrativeStatus={p.narrative_status}
                      reviewStatus={p.review_status ?? null}
                      sheetComplete={p.sheet_complete ?? null}
                      reviewActive={reviewActive}
                      openOnMount={p.id === focusPersonaId}
                      initialSections={p.sections}
                      worldId={worldId}
                      restrictInventory={restrictInventory}
                      restrictSkills={restrictSkills}
                      faceclaimsEnabled={faceclaimsEnabled}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── PNJ partagés ── */}
          {showNpcs && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {tNpc("section")}
                  {filteredNpcs.length > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{filteredNpcs.length}</span>
                  )}
                </h3>
                {canManageNpc && createTrigger(
                  "flex items-center gap-1 rounded-full border border-border-soft px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  tNpc("newNpc"),
                  true,
                )}
              </div>
              {filteredNpcs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border-soft py-6 text-center text-sm text-muted-foreground">
                  {filtering ? t("noMatch") : tNpc("none")}
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {filteredNpcs.map((p) => canManageNpc ? (
                    <PersonaCard
                      key={p.id}
                      personaId={p.id}
                      personaName={p.name ?? unnamed}
                      avatarUrl={p.avatar_url}
                      avatarConfig={p.avatar_config as never}
                      bannerUrl={p.banner_url}
                      initialFrameId={p.avatar_frame_id}
                      initialFrameUrl={p.frame?.asset_url}
                      initialFaceclaim={p.faceclaim ?? null}
                      initialMaritalStatus={p.marital_status ?? null}
                      initialSpousePersonaId={p.spouse_persona_id ?? null}
                      narrativeStatus={p.narrative_status}
                      reviewStatus={p.review_status}
                      sheetComplete={p.sheet_complete}
                      reviewActive={reviewActive}
                      isNpc
                      openOnMount={p.id === focusPersonaId}
                      initialSections={npcSections.get(p.id) ?? []}
                      worldId={worldId}
                      restrictInventory={restrictInventory}
                      restrictSkills={restrictSkills}
                      faceclaimsEnabled={faceclaimsEnabled}
                    />
                  ) : (
                    <OtherPersonaCard
                      key={p.id}
                      persona={p}
                      groupColor={groupColorById.get(groupByPersona.get(p.id) ?? "")}
                      unnamed={unnamed}
                      openOnMount={p.id === focusPersonaId}
                      reviewActive={reviewActive}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Autres personas ── */}
          {showPlayers && (
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("others")}
              {filteredOthers.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{filteredOthers.length}</span>
              )}
            </h3>

            {loadingOthers ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : filteredOthers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-soft py-8 text-center text-sm text-muted-foreground">
                {filtering ? t("noMatch") : t("noOthers")}
              </p>
            ) : (
              <div className="space-y-5">
                {otherGroups.map(([letter, list]) => (
                  <div key={letter || "flat"}>
                    {letter && (
                      <div className="px-0.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {letter}
                      </div>
                    )}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                      {list.map((p) => (
                        <OtherPersonaCard
                          key={p.id}
                          persona={p}
                          groupColor={groupColorById.get(groupByPersona.get(p.id) ?? "")}
                          unnamed={unnamed}
                          openOnMount={p.id === focusPersonaId}
                          reviewActive={reviewActive}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
