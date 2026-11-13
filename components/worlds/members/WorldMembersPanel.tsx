"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleDot, ClipboardCheck, Ghost, Plus, Send, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useDms } from "@/components/providers/DmsProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useWorldReviewActive } from "@/hooks/useWorldReviewActive";
import { effectiveStatus } from "@/lib/worldMembers";
import { isRetiredStatus } from "@/lib/personaStatus";
import { sortRolesByPosition, type WorldRoleRow } from "@/lib/worldPermissions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import { PersonaCreateSheet } from "@/components/personas/PersonaCreateSheet";
import { PersonaFilterBar } from "@/components/personas/PersonaFilterBar";
import {
  EMPTY_PERSONA_FILTERS,
  PERSONA_FILTER_ALL as ALL,
  PERSONA_FILTER_OFFSTAGE as OFFSTAGE,
  applyPersonaFilters,
  letterKey,
  memberLabel,
  sortPersonas,
} from "@/components/personas/personaFilters";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import { buildShelves, featuredPersonaId, type Shelf } from "@/components/personas/shelves/buildShelves";
import { LetterDivider, PersonaListGrid, PersonaWall } from "@/components/personas/shelves/PersonaShelf";
import { PersonaStatCards, type PersonaStatCard } from "@/components/personas/shelves/PersonaStatCards";
import { AlphaIndex } from "@/components/personas/shelves/AlphaIndex";
import type { MiniFace } from "@/components/personas/shelves/MiniAvatarStack";
import { buildBands, type CommunityFilters } from "@/components/worlds/community/buildBands";
import { CommunityPersonaTile } from "@/components/worlds/community/CommunityPersonaTile";
import { PlayerShelf, PlayerShelfHeader, SHELF_ACTION_CLASS, ShelfHeader } from "@/components/worlds/community/PlayerShelf";
import { CommunityViewToggle, COMMUNITY_VIEWS, isCommunityView, type CommunityView } from "@/components/worlds/community/CommunityViewToggle";
import { useCommunityData, type CommunityMemberRow, type CommunityPersona } from "@/components/worlds/community/useCommunityData";
import { MemberManageMenu } from "./MemberManageMenu";
import { displayNameOf, type WorldMemberCardData } from "./WorldMemberCard";
import { WorldMemberCardDialog } from "./WorldMemberCardDialog";

const WorldInviteDialog = dynamic(() => import("./WorldInviteDialog").then((m) => m.WorldInviteDialog));

const EMPTY_FILTERS: CommunityFilters = { ...EMPTY_PERSONA_FILTERS, online: false };

function viewKey(worldId: string) {
  return `community.view.${worldId}`;
}

/** Un membre prêt à afficher : rôles résolus, statut effectif. */
type Member = WorldMemberCardData & { former?: boolean };

/**
 * La page « Joueurs & personas » d'un monde : chaque membre avec ses personas
 * (vue « Joueurs »), ou tous les personas en murs par groupe, ou de A à Z.
 * Les cartes du haut et la barre de filtres filtrent les trois vues.
 */
export function WorldMembersPanel({
  worldId,
  ownerId,
  canManage,
  isShared,
  myPersonas = [],
  restrictInventory = false,
  restrictSkills = false,
  faceclaimsEnabled,
}: {
  worldId: string;
  ownerId: string;
  /** `members.manage` : inviter, attribuer des rôles, retirer, changer un statut. */
  canManage: boolean;
  isShared: boolean;
  /** Mes personas avec leurs sections, pour l'éditeur (chargés par la page serveur). */
  myPersonas?: AsidePersona[];
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  faceclaimsEnabled?: boolean;
}) {
  const t = useTranslations("worlds.members");
  const tc = useTranslations("worlds.community");
  const tList = useTranslations("personas.list");
  const tNpc = useTranslations("personas.npc");
  const { getUserPresence } = useGlobalPresence();
  const { roles: worldRoles, membership, can } = useWorldMembership();
  const { userId: currentUserId } = useCurrentUser();
  const meId = membership?.userId ?? currentUserId ?? null;
  const { openConversation } = useDms();
  const canReview = can("personas.review");
  const canManageNpc = can("npc.manage");
  const reviewActive = useWorldReviewActive(worldId) === true;
  // `?persona=<id>` (lien d'une notification) : la fiche s'ouvre d'elle-même.
  const focusPersonaId = useSearchParams()?.get("persona") ?? null;

  const data = useCommunityData({ worldId, ownerId, enabled: isShared, canManageNpc });
  const { rows, patchRow, removeRow, groups, groupByPersona } = data;
  const roleById = useMemo(() => new Map(worldRoles.map((r) => [r.id, r])), [worldRoles]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const myById = useMemo(() => new Map(myPersonas.map((p) => [p.id, p])), [myPersonas]);

  const [filters, setFilters] = useState<CommunityFilters>(EMPTY_FILTERS);
  const personaFilters = useMemo(() => ({ ...filters, reviewActive }), [filters, reviewActive]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /** Membre dont un gestionnaire change le statut. */
  const [statusTarget, setStatusTarget] = useState<CommunityMemberRow | null>(null);

  // La vue est une préférence de lecture, propre à l'appareil : lue après le montage.
  const [view, setViewState] = useState<CommunityView>("players");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(viewKey(worldId));
      setViewState(isCommunityView(saved) ? saved : "players");
    } catch {
      // ignore (mode privé…)
    }
  }, [worldId]);
  const setView = (next: CommunityView) => {
    setViewState(next);
    try {
      localStorage.setItem(viewKey(worldId), next);
    } catch {
      // ignore (mode privé, quota…)
    }
  };
  // « Par groupe » n'a de sens que si le monde a des groupes.
  const views = groups.length > 0 ? COMMUNITY_VIEWS : COMMUNITY_VIEWS.filter((v) => v !== "groups");
  const effectiveView: CommunityView = views.includes(view) ? view : "players";

  // Les rôles sont résolus au rendu, pas au chargement : un rôle renommé ou
  // recoloré dans les réglages se reflète ici sans recharger la liste.
  const members = useMemo<Member[]>(
    () =>
      rows.map((row) => ({
        ...row,
        roles: sortRolesByPosition(row.role_ids.map((id) => roleById.get(id)).filter((r): r is WorldRoleRow => !!r)),
        effectiveStatus: effectiveStatus(row),
      })),
    [rows, roleById],
  );

  const personasByUser = useMemo(() => {
    const map = new Map<string, CommunityPersona[]>();
    for (const p of sortPersonas(data.personas, "name")) {
      if (!map.has(p.user_id)) map.set(p.user_id, []);
      map.get(p.user_id)!.push(p);
    }
    return map;
  }, [data.personas]);
  const npcs = useMemo(() => sortPersonas(data.npcs, "name"), [data.npcs]);

  const hoistedRoleIds = useMemo(() => sortRolesByPosition(worldRoles.filter((r) => r.hoist)).map((r) => r.id), [worldRoles]);

  const bands = useMemo(
    () => buildBands({
      members: members.filter((m) => !m.former || (personasByUser.get(m.user_id)?.length ?? 0) > 0),
      personasByUser,
      npcs,
      meId,
      filters: personaFilters,
      groupByPersona,
      hoistedRoleIds,
      presenceOf: getUserPresence,
      showNpcBand: npcs.length > 0 || canManageNpc,
      expanded,
    }),
    [members, personasByUser, npcs, meId, personaFilters, groupByPersona, hoistedRoleIds, getUserPresence, canManageNpc, expanded],
  );

  // Les vues « Personas » : tous les personas filtrés, rangés par groupe ou de A à Z.
  const shelves = useMemo(() => {
    const online = (p: CommunityPersona) => !filters.online || getUserPresence(p.user_id) === "online";
    const players = applyPersonaFilters(data.personas, personaFilters, groupByPersona).filter(online);
    const npcList = filters.online ? [] : applyPersonaFilters(data.npcs, personaFilters, groupByPersona);
    return buildShelves<CommunityPersona>({
      mine: [],
      others: players,
      npcs: npcList,
      groups,
      groupByPersona,
      mode: effectiveView === "groups" ? "group" : "list",
      sort: "name",
      meId,
      myUsername: null,
      keepMine: false,
      keepNpcs: false,
      canCreateNpc: false,
    });
  }, [data.personas, data.npcs, personaFilters, groupByPersona, groups, effectiveView, meId, filters.online, getUserPresence]);

  // ── Cartes de tête : chacune bascule un filtre ──
  const everyone = useMemo(() => [...data.personas, ...data.npcs], [data.personas, data.npcs]);
  const faceOf = (p: CommunityPersona): MiniFace => ({ id: p.id, name: p.name, avatar_url: p.avatar_url, narrative_status: p.narrative_status });
  const toggle = (key: "player" | "sheet" | "status", value: string) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? ALL : value }));
  const onlineMembers = members.filter((m) => !m.former && getUserPresence(m.user_id) === "online");
  const mine = meId ? personasByUser.get(meId) ?? [] : [];
  const toReview = everyone.filter((p) => p.review_status === "submitted");
  const offstage = everyone.filter((p) => isRetiredStatus(p.narrative_status));
  const statCards: PersonaStatCard[] = [
    {
      key: "online", label: tc("stats.online"), icon: CircleDot, tone: "online", value: onlineMembers.length,
      faces: onlineMembers.map((m) => ({ id: m.user_id, name: m.username, avatar_url: m.avatar_url, narrative_status: "alive" })),
      active: filters.online, onToggle: () => setFilters((f) => ({ ...f, online: !f.online })),
    },
  ];
  if (meId) {
    statCards.push({
      key: "mine", label: tList("mine"), icon: UserRound, value: mine.length, faces: mine.map(faceOf),
      active: filters.player === meId, onToggle: () => toggle("player", meId),
    });
  }
  if (reviewActive && canReview) {
    statCards.push({
      key: "toReview", label: tList("shelves.stats.toReview"), icon: ClipboardCheck, tone: "warning", value: toReview.length,
      faces: toReview.map(faceOf), active: filters.sheet === "submitted", onToggle: () => toggle("sheet", "submitted"),
    });
  }
  statCards.push({
    key: "offstage", label: tList("shelves.stats.offstage"), icon: Ghost, value: offstage.length, faces: offstage.map(faceOf),
    active: filters.status === OFFSTAGE, onToggle: () => toggle("status", OFFSTAGE),
  });

  const filterPlayers = useMemo(
    () => members
      .filter((m) => (personasByUser.get(m.user_id)?.length ?? 0) > 0)
      .map((m) => ({ id: m.user_id, label: memberLabel(m.user_id, m.username) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [members, personasByUser],
  );

  // ── Rendu des personas ──
  const createSheet = (trigger: ReactNode, npc = false) => (
    <PersonaCreateSheet worldId={worldId} restrictInventory={restrictInventory} restrictSkills={restrictSkills} defaultNpc={npc} trigger={trigger} />
  );
  // Un carré aligné sur les images des tuiles, sans s'étirer à la hauteur du nom.
  const newTile = (label: string, npc: boolean) => createSheet(
    <button
      type="button"
      className="flex aspect-square w-full flex-col items-center justify-center gap-2 self-start rounded-lg border border-dashed border-border px-2 text-center text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="h-5 w-5" aria-hidden />
      {label}
    </button>,
    npc,
  );

  const renderTile = (p: CommunityPersona, { onShelf, featured = false }: { onShelf: boolean; featured?: boolean }) => {
    const groupId = groupByPersona.get(p.id);
    const group = groupId ? groupById.get(groupId) : undefined;
    // Sous le nom : le groupe sur l'étagère de son joueur, le joueur ailleurs (le PNJ a déjà son badge).
    const line2 = onShelf ? group?.name ?? null : p.is_npc ? null : memberLabel(p.user_id, p.username);
    return (
      <CommunityPersonaTile
        persona={p}
        mine={myById.get(p.id)}
        npcSections={data.npcSections.get(p.id)}
        canManageNpc={canManageNpc}
        variant={onShelf ? "shelf" : "wall"}
        line2={line2}
        lineSwatch={onShelf}
        // La couleur du groupe ne sert qu'à sa pastille : pas de fond teinté sur les murs.
        groupColor={onShelf ? group?.color : undefined}
        featured={featured}
        openOnMount={p.id === focusPersonaId}
        reviewActive={reviewActive}
        worldId={worldId}
        restrictInventory={restrictInventory}
        restrictSkills={restrictSkills}
        faceclaimsEnabled={faceclaimsEnabled}
      />
    );
  };

  const wallStat = (items: CommunityPersona[]) => {
    const alive = items.filter((p) => !isRetiredStatus(p.narrative_status)).length;
    const toReviewCount = reviewActive ? items.filter((p) => p.review_status === "submitted").length : 0;
    return [
      tList("shelves.statAlive", { count: alive }),
      items.length - alive > 0 && tList("shelves.statOffstage", { count: items.length - alive }),
      toReviewCount > 0 && tList("shelves.statToReview", { count: toReviewCount }),
    ].filter(Boolean).join(" · ");
  };

  function manageFor(m: Member): ReactNode {
    if (!canManage || m.isOwner || m.former || !membership || m.user_id === membership.userId) return null;
    return (
      <MemberManageMenu
        worldId={worldId}
        member={m}
        memberRoles={m.roles}
        membership={membership}
        allRoles={worldRoles}
        onRolesChanged={(userId, roleIds) => patchRow(userId, { role_ids: roleIds })}
        onRemoved={removeRow}
        onChangeStatus={() => setStatusTarget(rows.find((r) => r.user_id === m.user_id) ?? null)}
      />
    );
  }

  // Ma carte se règle dans « Mon profil » (menu principal) : rien à faire sur ma propre étagère.
  function actionsFor(m: Member): ReactNode {
    if (m.user_id === meId) return null;
    const name = displayNameOf(m);
    return (
      <>
        <UserProfileSheetTrigger userId={m.user_id} label={t("openProfile", { name })}>
          <span className={SHELF_ACTION_CLASS}>
            <UserRound className="size-3.5" aria-hidden />
            {tc("shelf.profile")}
          </span>
        </UserProfileSheetTrigger>
        {meId && (
          <button type="button" className={SHELF_ACTION_CLASS} onClick={() => void openConversation(m.user_id)}>
            <Send className="size-3.5" aria-hidden />
            {tc("shelf.write")}
          </button>
        )}
        {manageFor(m)}
      </>
    );
  }

  function renderPlayers() {
    return (
      <div className="flex flex-col gap-10">
        {bands.map((band) => {
          if (band.kind === "npc") {
            return (
              <PlayerShelf
                key={band.key}
                header={
                  <ShelfHeader
                    avatar={
                      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-muted text-xs font-bold text-foreground">
                        {tNpc("badge")}
                      </span>
                    }
                    title={tNpc("pickerGroup")}
                    line={tc("shelf.npcSubtitle")}
                  />
                }
                footer={band.personas.length === 0 && !canManageNpc && <p className="text-xs italic text-muted-foreground">{tNpc("none")}</p>}
              >
                {band.personas.map((p) => <div key={p.id} className="min-w-0">{renderTile(p, { onShelf: true })}</div>)}
                {canManageNpc && newTile(tNpc("newNpc"), true)}
              </PlayerShelf>
            );
          }
          const m = band.member;
          const isMe = m.user_id === meId;
          return (
            <PlayerShelf
              key={band.key}
              header={
                <PlayerShelfHeader
                  member={m}
                  title={isMe ? tList("shelves.me", { name: displayNameOf(m) }) : undefined}
                  presence={getUserPresence(m.user_id)}
                  activity={data.memberActivity.get(m.user_id)}
                  actions={!m.former && actionsFor(m)}
                />
              }
              footer={
                band.hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => new Set(prev).add(m.user_id))}
                    className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {tc("shelf.showAll", { count: band.hidden })}
                  </button>
                ) : band.personas.length === 0 && !isMe ? (
                  <p className="text-xs italic text-muted-foreground">{t("noPersona")}</p>
                ) : null
              }
            >
              {band.personas.map((p) => <div key={p.id} className="min-w-0">{renderTile(p, { onShelf: true })}</div>)}
              {isMe && newTile(tList("newPersona"), false)}
            </PlayerShelf>
          );
        })}
      </div>
    );
  }

  function renderWalls() {
    return (
      <div className="space-y-7">
        {shelves.map((shelf: Shelf<CommunityPersona>) => {
          const featuredId = featuredPersonaId(shelf.items, data.personaActivity);
          return (
            <PersonaWall
              key={shelf.key}
              title={shelf.kind === "group" ? shelf.label : tList("noGroup")}
              color={shelf.color}
              stat={wallStat(shelf.items)}
            >
              {shelf.items.map((p) => (
                <div key={p.id} className={featuredId === p.id ? "col-span-2 row-span-2 min-w-0" : "min-w-0"}>
                  {renderTile(p, { onShelf: false, featured: featuredId === p.id })}
                </div>
              ))}
            </PersonaWall>
          );
        })}
      </div>
    );
  }

  function renderAlpha() {
    const items = shelves[0]?.items ?? [];
    const out: ReactNode[] = [];
    let current = "";
    for (const p of items) {
      const letter = letterKey(p.name);
      if (letter !== current) {
        current = letter;
        out.push(<LetterDivider key={`letter-${letter}`} letter={letter} />);
      }
      out.push(<div key={p.id} className="min-w-0">{renderTile(p, { onShelf: false })}</div>);
    }
    return <PersonaListGrid>{out}</PersonaListGrid>;
  }

  const letters = effectiveView === "alpha" ? Array.from(new Set((shelves[0]?.items ?? []).map((p) => letterKey(p.name)))) : [];
  const nothing = effectiveView === "players" ? bands.length === 0 : shelves.length === 0;
  const empty = !isShared || (!data.loading && members.length === 0);
  const memberCount = members.filter((m) => !m.former).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WorldPanelHeader
        icon={<Users className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={
          <>
            {tc("title")}
            {memberCount > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{memberCount}</span>}
          </>
        }
        right={
          isShared && (
            <div className="flex items-center gap-2">
              {canManage && <WorldInviteDialog worldId={worldId} />}
              {createSheet(
                <Button variant="outline" type="button" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  {tList("newPersona")}
                </Button>,
              )}
            </div>
          )
        }
      />

      {statusTarget && (
        <WorldMemberCardDialog
          worldId={worldId}
          userId={statusTarget.user_id}
          mode="status"
          initial={statusTarget}
          open
          onOpenChange={(o) => {
            if (!o) setStatusTarget(null);
          }}
          onSaved={(fields) => patchRow(statusTarget.user_id, fields)}
        />
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">
          {empty ? (
            <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <>
              <PersonaStatCards cards={statCards} neutral />

              <PersonaFilterBar
                filters={filters}
                onFiltersChange={(next) => {
                  setFilters((f) => ({ ...next, online: f.online }));
                  setExpanded(new Set());
                }}
                players={filterPlayers}
                groups={groups}
                showKind={npcs.length > 0 || canManageNpc}
                reviewActive={reviewActive}
                searchPlaceholder={tc("searchPlaceholder")}
                leading={<CommunityViewToggle view={effectiveView} onViewChange={setView} views={views} />}
                actions={
                  canManageNpc && effectiveView !== "players" && createSheet(
                    <Button type="button" variant="outline">
                      <Plus className="h-3.5 w-3.5" />
                      {tNpc("newNpc")}
                    </Button>,
                    true,
                  )
                }
              />

              {effectiveView === "alpha" && <AlphaIndex letters={letters} />}

              {data.loading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
                </div>
              ) : nothing ? (
                <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>
              ) : effectiveView === "players" ? (
                renderPlayers()
              ) : effectiveView === "groups" ? (
                renderWalls()
              ) : (
                renderAlpha()
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
