"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, Drama, Ghost, Pencil, Plus, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RPC } from "@/lib/constants";
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
import { Button } from "@/components/ui/button";
import type { AsidePersona } from "./WorldPersonaAsideClient";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { effectiveStatus } from "@/lib/worldMembers";
import { isRetiredStatus, narrativeStatusOf } from "@/lib/personaStatus";
import { reviewStatusOf } from "@/lib/personaReview";
import {
  EMPTY_PERSONA_FILTERS,
  PERSONA_FILTER_ALL as ALL,
  PERSONA_FILTER_OFFSTAGE as OFFSTAGE,
  applyPersonaFilters,
  letterKey,
  memberLabel,
  sortPersonas,
  type PersonaFilters,
} from "./personaFilters";
import { PersonaFilterBar } from "./PersonaFilterBar";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useWorldReviewActive } from "@/hooks/useWorldReviewActive";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { MemberStatusBadge } from "@/components/worlds/members/WorldMemberCard";
import { ChatroomAvatarWithPresence } from "@/components/chatrooms/persona/ChatroomAvatarWithPresence";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import type { PersonaNarrativeStatus, PersonaReviewStatus, WorldMemberStatus } from "@/types/db";
import { buildShelves, featuredPersonaId, isShelfMode, type PersonaActivity, SHELF_MODES, type Shelf, type ShelfMode } from "./shelves/buildShelves";
import { PersonaShelfTile, SHELF_TILE_CLASS } from "./shelves/PersonaShelfTile";
import { LetterDivider, PersonaListGrid, PersonaWall } from "./shelves/PersonaShelf";
import { PersonaStatCards, type PersonaStatCard } from "./shelves/PersonaStatCards";
import { ShelfGroupingToggle } from "./shelves/ShelfGroupingToggle";
import { AlphaIndex } from "./shelves/AlphaIndex";
import type { MiniFace } from "./shelves/MiniAvatarStack";
import { usePersonasChangedVersion } from "@/hooks/usePersonasChanged";

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
export { applyPersonaFilters, sortPersonas, PERSONA_FILTER_ALL, PERSONA_FILTER_NO_GROUP, PERSONA_FILTER_OFFSTAGE, SHEET_FILTERS } from "./personaFilters";
export type { PersonaFilters } from "./personaFilters";

// ── Tuile lecture seule : persona d'un autre membre ────────────────────────

/** Les badges posés sur le portrait, fond sombre pour rester lisibles sur l'image. */
const TILE_BADGE_CLASS = "bg-black/60 text-white";

function OtherPersonaCard({ persona, groupColor, line2, lineSwatch, featured, unnamed, openOnMount, reviewActive = true }: { persona: OtherPersona; groupColor?: string; line2?: string | null; lineSwatch?: boolean; featured?: boolean; unnamed: string; openOnMount?: boolean; reviewActive?: boolean }) {
  const name = persona.name ?? unnamed;
  return (
    <PersonaProfileSheetTrigger
      personaId={persona.id}
      userId={persona.user_id}
      label={name}
      openOnMount={openOnMount}
      triggerClassName={SHELF_TILE_CLASS}
    >
      <PersonaShelfTile
        name={name}
        avatarUrl={persona.avatar_url}
        narrativeStatus={persona.narrative_status}
        groupColor={groupColor}
        line2={line2}
        lineSwatch={lineSwatch}
        featured={featured}
        badges={
          <>
            <PersonaNpcBadge isNpc={persona.is_npc} className={TILE_BADGE_CLASS} />
            <PersonaStatusBadge status={persona.narrative_status} className={TILE_BADGE_CLASS} />
            <PersonaSheetBadge persona={persona} reviewActive={reviewActive} className={TILE_BADGE_CLASS} />
            {/* Le joueur est en pause ou absent : autant le savoir avant de lui écrire. */}
            {!persona.is_npc && persona.playerStatus !== "active" && (
              <MemberStatusBadge
                status={persona.playerStatus}
                until={persona.playerStatusUntil}
                note={null}
                className={`${TILE_BADGE_CLASS} backdrop-blur-sm`}
              />
            )}
          </>
        }
      />
    </PersonaProfileSheetTrigger>
  );
}

/** L'avatar du joueur en tête de son étagère, avec sa pastille de présence. */
function PlayerChip({ userId, avatarUrl, name }: { userId: string; avatarUrl: string | null; name: string }) {
  const { getUserPresence } = useGlobalPresence();
  const tPresence = useTranslations("presence");
  const presence = getUserPresence(userId);
  return (
    <span className="shrink-0" title={tPresence(presence)} data-presence={presence}>
      <ChatroomAvatarWithPresence url={avatarUrl} fallback={name} presenceState={presence} size={36} />
      <span className="sr-only">{tPresence(presence)}</span>
    </span>
  );
}

/** La pastille de l'étagère des PNJ. */
function ShelfChip({ text }: { text: string }) {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-xs-plus font-bold text-foreground ring-1 ring-inset ring-border"
    >
      {text}
    </span>
  );
}

function shelfModeKey(worldId: string) {
  return `personas.shelfMode.${worldId}`;
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
  const tCommon = useTranslations("common");
  const tMember = useTranslations("worlds.members.status");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const { userId: meId, username: myUsername, avatarUrl: myAvatarUrl } = useCurrentUser();
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
  const [avatarByUser, setAvatarByUser] = useState<Map<string, string | null>>(new Map());
  // L'activité récente de chaque persona : elle choisit la vedette de chaque étagère.
  // Chargée à part, elle ne retarde pas la liste.
  const [activity, setActivity] = useState<Map<string, PersonaActivity>>(new Map());
  useEffect(() => {
    let cancelled = false;
    type ActivityRow = { persona_id: string; message_count: number; last_message_at: string };
    void supabase
      .rpc(RPC.GET_WORLD_PERSONA_ACTIVITY, { p_world_id: worldId })
      .then(({ data }: { data: ActivityRow[] | null }) => {
        if (cancelled || !Array.isArray(data)) return;
        setActivity(new Map(data.map((r) => [r.persona_id, { count: r.message_count, lastAt: r.last_message_at }])));
      });
    return () => { cancelled = true; };
  }, [supabase, worldId]);
  const myIds = useMemo(() => new Set(myPersonas.map((p) => p.id)), [myPersonas]);
  // Les personas des autres et les PNJ se chargent ici, côté client :
  // `router.refresh()` ne les recharge pas, le signal des tiroirs si.
  const personasVersion = usePersonasChangedVersion();

  const [filters, setFilters] = useState<PersonaFilters>(EMPTY_PERSONA_FILTERS);
  const effectiveFilters = useMemo(() => ({ ...filters, reviewActive }), [filters, reviewActive]);

  // Le rangement est une préférence de lecture, propre à l'appareil : lu après
  // le montage (le rendu serveur ne connaît pas localStorage).
  const [mode, setModeState] = useState<ShelfMode>("player");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(shelfModeKey(worldId));
      setModeState(isShelfMode(saved) ? saved : "player");
    } catch {
      // ignore (mode privé…)
    }
  }, [worldId]);
  const setMode = (next: ShelfMode) => {
    setModeState(next);
    try {
      localStorage.setItem(shelfModeKey(worldId), next);
    } catch {
      // ignore (mode privé, quota…)
    }
  };

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
      let avatarsByUser = new Map<string, string | null>();
      type StatusRow = { user_id: string; status: WorldMemberStatus; status_until: string | null };
      let statusByUser = new Map<string, StatusRow>();
      if (userIds.length > 0) {
        const [{ data: profileRows }, { data: memberRows }] = await Promise.all([
          supabase.from("profiles").select("id, username, avatar_url").in("id", userIds),
          supabase.from("world_members").select("user_id, status, status_until").eq("world_id", worldId).in("user_id", userIds),
        ]);
        type ProfileRow = { id: string; username: string | null; avatar_url?: string | null };
        usernameByUser = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p.username]));
        avatarsByUser = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p.avatar_url ?? null]));
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
      setAvatarByUser(avatarsByUser);
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
  }, [worldId, canManageNpc, personasVersion]);


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
    return sortPersonas(applyPersonaFilters(withOwner, effectiveFilters, groupByPersona), "name");
  }, [myPersonas, meId, myUsername, effectiveFilters, groupByPersona]);

  const filteredOthers = useMemo(
    () => sortPersonas(applyPersonaFilters(others ?? [], effectiveFilters, groupByPersona), "name"),
    [others, effectiveFilters, groupByPersona],
  );

  const filteredNpcs = useMemo(
    () => sortPersonas(applyPersonaFilters(npcs, effectiveFilters, groupByPersona), "name"),
    [npcs, effectiveFilters, groupByPersona],
  );

  // Les fiches des autres qui attendent un relecteur — un raccourci vers le filtre.
  const toReview = useMemo(
    () => (reviewActive ? (others ?? []).filter((p) => p.review_status === "submitted").length : 0),
    [others, reviewActive],
  );

  const loadingOthers = others === null;
  const total = myPersonas.length + (others?.length ?? 0) + npcs.length;
  const filtering = filters.query.trim() !== "" || filters.player !== ALL || filters.group !== ALL || filters.status !== ALL || filters.sheet !== ALL || filters.kind !== ALL;
  const showPlayers = filters.kind !== "npc";
  const showNpcs = filters.kind !== "player" && (npcs.length > 0 || canManageNpc);
  const unnamed = t("unnamed");
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  // « Par groupe » n'a de sens que si le monde a des groupes.
  const modes = groups.length > 0 ? SHELF_MODES : SHELF_MODES.filter((m) => m !== "group");
  const effectiveMode: ShelfMode = modes.includes(mode) ? mode : "player";

  // Une seule liste, trois provenances : la tuile ouvre l'éditeur ou la fiche selon elle.
  type Item =
    | ((typeof mine)[number] & { source: "mine" })
    | (OtherPersona & { source: "other" })
    | (NpcPersona & { source: "npc" });

  const shelves = useMemo(
    () => buildShelves<Item>({
      mine: showPlayers ? mine.map((p) => ({ ...p, source: "mine" as const })) : [],
      others: showPlayers ? filteredOthers.map((p) => ({ ...p, source: "other" as const })) : [],
      npcs: showNpcs ? filteredNpcs.map((p) => ({ ...p, source: "npc" as const })) : [],
      groups,
      groupByPersona,
      mode: effectiveMode,
      sort: "name",
      meId,
      myUsername: myUsername ?? null,
      keepMine: showPlayers && !filtering,
      keepNpcs: showNpcs && canManageNpc && !filtering,
      canCreateNpc: canManageNpc,
    }),
    [mine, filteredOthers, filteredNpcs, showPlayers, showNpcs, groups, groupByPersona, effectiveMode, meId, myUsername, filtering, canManageNpc],
  );

  // ── Cartes de tête : chacune bascule un filtre existant ──
  const faceOf = (p: { id: string; name: string | null; avatar_url?: string | null; narrative_status?: PersonaNarrativeStatus | null }): MiniFace => ({
    id: p.id, name: p.name, avatar_url: p.avatar_url ?? null, narrative_status: narrativeStatusOf(p.narrative_status),
  });
  const everyone = useMemo(() => [...myPersonas, ...(others ?? []), ...npcs], [myPersonas, others, npcs]);
  const toggle = (key: "player" | "sheet" | "kind" | "status", value: string) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? ALL : value }));
  const statCards: PersonaStatCard[] = [];
  if (meId) {
    statCards.push({
      key: "mine", label: t("mine"), icon: UserRound, value: myPersonas.length, faces: myPersonas.map(faceOf),
      active: filters.player === meId, onToggle: () => toggle("player", meId),
    });
  }
  if (reviewActive && canReview) {
    statCards.push({
      key: "toReview", label: t("shelves.stats.toReview"), icon: ClipboardCheck, tone: "warning", value: toReview,
      faces: (others ?? []).filter((p) => p.review_status === "submitted").map(faceOf),
      active: filters.sheet === "submitted", onToggle: () => toggle("sheet", "submitted"),
    });
  }
  if (npcs.length > 0 || canManageNpc) {
    statCards.push({
      key: "npc", label: tNpc("pickerGroup"), icon: Drama, value: npcs.length, faces: npcs.map(faceOf),
      active: filters.kind === "npc", onToggle: () => toggle("kind", "npc"),
    });
  }
  const offstage = everyone.filter((p) => isRetiredStatus(narrativeStatusOf(p.narrative_status)));
  statCards.push({
    key: "offstage", label: t("shelves.stats.offstage"), icon: Ghost, value: offstage.length, faces: offstage.map(faceOf),
    active: filters.status === OFFSTAGE, onToggle: () => toggle("status", OFFSTAGE),
  });

  const createSheet = (trigger: ReactNode, npc = false) => (
    <PersonaCreateSheet
      worldId={worldId}
      restrictInventory={restrictInventory}
      restrictSkills={restrictSkills}
      defaultNpc={npc}
      trigger={trigger}
    />
  );

  const newTile = (npc: boolean) => createSheet(
    <button
      type="button"
      className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 text-center text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="h-5 w-5" aria-hidden />
      {npc ? tNpc("newNpc") : t("newPersona")}
    </button>,
    npc,
  );

  const editCorner = (
    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs-plus font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      <Pencil className="h-3 w-3" aria-hidden />
      {tCommon("edit")}
    </span>
  );

  const renderTile = (p: Item, featured = false) => {
    const groupId = groupByPersona.get(p.id);
    const group = groupId ? groupById.get(groupId) : undefined;
    // Sous le nom : le groupe quand on range par joueur, le joueur sinon (le PNJ a déjà son badge).
    const line2 = effectiveMode === "player" ? group?.name ?? null : p.is_npc ? null : memberLabel(p.user_id, p.username);
    // Le carré de couleur accompagne le nom du groupe, pas le pseudo du joueur.
    const lineSwatch = effectiveMode === "player";
    const name = p.name ?? unnamed;
    if (p.source === "other" || (p.source === "npc" && !canManageNpc)) {
      return (
        <OtherPersonaCard
          persona={p}
          groupColor={group?.color}
          line2={line2}
          lineSwatch={lineSwatch}
          featured={featured}
          unnamed={unnamed}
          openOnMount={p.id === focusPersonaId}
          reviewActive={reviewActive}
        />
      );
    }
    const reviewStatus = p.review_status ?? null;
    const sheetComplete = p.sheet_complete ?? null;
    return (
      <PersonaCard
        personaId={p.id}
        personaName={name}
        avatarUrl={p.avatar_url}
        avatarConfig={p.avatar_config as never}
        bannerUrl={p.banner_url}
        initialFrameId={p.avatar_frame_id}
        initialFrameUrl={p.frame?.asset_url}
        initialFaceclaim={p.faceclaim ?? null}
        initialMaritalStatus={p.marital_status ?? null}
        initialSpousePersonaId={p.spouse_persona_id ?? null}
        narrativeStatus={p.narrative_status}
        reviewStatus={reviewStatus}
        sheetComplete={sheetComplete}
        reviewActive={reviewActive}
        isNpc={p.source === "npc"}
        openOnMount={p.id === focusPersonaId}
        initialSections={p.source === "mine" ? p.sections : npcSections.get(p.id) ?? []}
        worldId={worldId}
        restrictInventory={restrictInventory}
        restrictSkills={restrictSkills}
        faceclaimsEnabled={faceclaimsEnabled}
        trigger={
          <button type="button" aria-label={name} className={SHELF_TILE_CLASS}>
            <PersonaShelfTile
              name={name}
              avatarUrl={p.avatar_url}
              narrativeStatus={p.narrative_status}
              groupColor={group?.color}
              line2={line2}
              lineSwatch={lineSwatch}
              featured={featured}
              corner={editCorner}
              badges={
                <>
                  <PersonaNpcBadge isNpc={p.source === "npc"} className={TILE_BADGE_CLASS} />
                  <PersonaStatusBadge status={p.narrative_status} className={TILE_BADGE_CLASS} />
                  <PersonaSheetBadge persona={{ review_status: reviewStatus, sheet_complete: sheetComplete }} reviewActive={reviewActive} className={TILE_BADGE_CLASS} />
                </>
              }
            />
          </button>
        }
      />
    );
  };

  const awayLabel = (status: WorldMemberStatus, until: string | null) => {
    const date = until
      ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${until}T00:00:00Z`))
      : null;
    return date ? tMember(`${status}Until`, { date }) : tMember(status);
  };

  // L'en-tête d'un mur : qui (ou quel groupe), une éventuelle absence, les chiffres.
  const wallHeader = (shelf: Shelf<Item>): { title: ReactNode; accent?: ReactNode; note?: string; stat: string } => {
    const count = shelf.items.length;
    const offstageCount = count - shelf.alive;
    const toReviewCount = reviewActive ? shelf.items.filter((p) => p.review_status === "submitted").length : 0;
    const stat = [
      t("shelves.statAlive", { count: shelf.alive }),
      offstageCount > 0 && t("shelves.statOffstage", { count: offstageCount }),
      toReviewCount > 0 && t("shelves.statToReview", { count: toReviewCount }),
    ].filter(Boolean).join(" · ");
    switch (shelf.kind) {
      case "me":
        return {
          title: t("shelves.me", { name: shelf.label ?? "" }),
          accent: meId ? <PlayerChip userId={meId} avatarUrl={myAvatarUrl ?? null} name={myUsername ?? ""} /> : undefined,
          stat: count === 0 ? t("noneMine") : stat,
        };
      case "player":
        return {
          title: shelf.label,
          accent: <PlayerChip userId={shelf.key} avatarUrl={avatarByUser.get(shelf.key) ?? null} name={shelf.items[0]?.username ?? ""} />,
          note: shelf.playerStatus !== "active" ? awayLabel(shelf.playerStatus, shelf.playerStatusUntil) : undefined,
          stat,
        };
      case "npc":
        return { title: tNpc("pickerGroup"), accent: <ShelfChip text={tNpc("badge")} />, stat: count === 0 ? tNpc("none") : stat };
      case "group":
        return { title: shelf.label, stat };
      default:
        return { title: t("noGroup"), stat };
    }
  };

  // Mode Liste : intercalaires et index des lettres présentes.
  const byLetter = effectiveMode === "list";
  const letters = byLetter ? Array.from(new Set((shelves[0]?.items ?? []).map((p) => letterKey(p.name)))) : [];

  const renderListGrid = (items: Item[]) => {
    const out: ReactNode[] = [];
    let current = "";
    for (const p of items) {
      if (byLetter) {
        const letter = letterKey(p.name);
        if (letter !== current) {
          current = letter;
          out.push(<LetterDivider key={`letter-${letter}`} letter={letter} />);
        }
      }
      out.push(<div key={p.id} className="min-w-0">{renderTile(p)}</div>);
    }
    return out;
  };

  const skeletonRow = (
    <PersonaListGrid>
      {[1, 2, 3].map((i) => (
        <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
      ))}
    </PersonaListGrid>
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
        right={createSheet(
          <Button variant="outline" type="button" size="sm">
            <Plus className="h-3.5 w-3.5" />
            {t("newPersona")}
          </Button>,
        )}
      />

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">
          {total > 0 && (
            <>
              <PersonaStatCards cards={statCards} />

              {/* ── Vue, filtres, recherche ── */}
              <PersonaFilterBar
                filters={filters}
                onFiltersChange={setFilters}
                players={players}
                groups={groups}
                showKind={npcs.length > 0 || canManageNpc}
                reviewActive={reviewActive}
                leading={<ShelfGroupingToggle mode={effectiveMode} onModeChange={setMode} modes={modes} />}
                actions={
                  // Hors du rangement par joueur, plus de rangée des PNJ : leur création passe ici.
                  canManageNpc && effectiveMode !== "player" && createSheet(
                    <Button type="button" variant="outline">
                      <Plus className="h-3.5 w-3.5" />
                      {tNpc("newNpc")}
                    </Button>,
                    true,
                  )
                }
              />
            </>
          )}

          {byLetter && <AlphaIndex letters={letters} />}

          {loadingOthers && effectiveMode !== "player" ? (
            skeletonRow
          ) : (
            <div className="space-y-7">
              {shelves.map((shelf) => {
                if (shelf.kind === "all") {
                  return <PersonaListGrid key={shelf.key}>{renderListGrid(shelf.items)}</PersonaListGrid>;
                }
                const head = wallHeader(shelf);
                const featuredId = featuredPersonaId(shelf.items, activity);
                return (
                  <PersonaWall key={shelf.key} title={head.title} accent={head.accent} color={shelf.color} note={head.note} stat={head.stat}>
                    {shelf.items.map((p) => (
                      <div key={p.id} className={cn("min-w-0", p.id === featuredId && "col-span-2 row-span-2")}>
                        {renderTile(p, p.id === featuredId)}
                      </div>
                    ))}
                    {shelf.create && newTile(shelf.create === "npc")}
                  </PersonaWall>
                );
              })}
              {loadingOthers && skeletonRow}
              {!loadingOthers && shelves.length === 0 && (
                <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  {filtering ? t("noMatch") : t("shelves.empty")}
                </p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
