"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { IdCard, Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { fetchPersonasByMember, type WorldMemberPersona } from "@/lib/worldMemberPersonas";
import {
  effectiveStatus,
  fetchWorldMemberActivity,
  fetchWorldMembers,
  type WorldMemberActivity,
  type WorldMemberCardFields,
} from "@/lib/worldMembers";
import { highestHoistedRole, sortRolesByPosition, type WorldRoleRow } from "@/lib/worldPermissions";
import { PresenceDot } from "@/components/avatars/PresenceDot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MemberManageMenu } from "./MemberManageMenu";
import { WorldMemberCard, displayNameOf, type PresenceState, type WorldMemberCardData } from "./WorldMemberCard";
import { WorldMemberCardDialog } from "./WorldMemberCardDialog";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";

const WorldInviteDialog = dynamic(() => import("./WorldInviteDialog").then((m) => m.WorldInviteDialog));

// ── Types ────────────────────────────────────────────────────────────────────

const PRESENCE_ORDER: Record<PresenceState, number> = { online: 0, away: 1, offline: 2 };

type MemberRow = WorldMemberCardFields & {
  user_id: string;
  isOwner: boolean;
  role_ids: string[];
  username: string | null;
  avatar_url: string | null;
  personas: WorldMemberPersona[];
};

/** Clés de la section « Propriétaire » et de celle des membres sans rôle « hoist ». */
const OWNER_GROUP = "__owner__";
const OTHERS_GROUP = "__others__";

/** Comparaison sans casse ni accents, pour le filtre de recherche. */
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function normalize(text: string) {
  return text.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

// ── RoleSection ──────────────────────────────────────────────────────────────

function RoleSection({
  heading,
  role,
  members,
  presenceOf,
  activityOf,
  manageFor,
}: {
  heading: string;
  /** Le rôle qui groupe cette section — sa couleur et son icône titrent. */
  role?: WorldRoleRow | null;
  members: WorldMemberCardData[];
  presenceOf: (userId: string) => PresenceState;
  activityOf: (userId: string) => WorldMemberActivity | undefined;
  manageFor: (m: WorldMemberCardData) => ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        {role?.lucide_icon ? (
          <LazyLucideIcon name={role.lucide_icon} width={16} height={16} className="shrink-0" style={{ color: role.color }} />
        ) : (
          role && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: role.color }} />
        )}
        {heading}
        <span className="text-xs font-normal text-muted-foreground">{members.length}</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <WorldMemberCard
            key={m.user_id}
            member={m}
            presence={presenceOf(m.user_id)}
            activity={activityOf(m.user_id)}
            manage={manageFor(m)}
          />
        ))}
      </div>
    </section>
  );
}

// ── WorldMembersPanel ─────────────────────────────────────────────────────────

export function WorldMembersPanel({
  worldId,
  ownerId,
  canManage,
  isShared,
}: {
  worldId: string;
  ownerId: string;
  /** `members.manage` : inviter, attribuer des rôles, retirer, changer un statut. */
  canManage: boolean;
  isShared: boolean;
}) {
  const t = useTranslations("worlds.members");
  const supabase = useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();
  const { roles: worldRoles, membership } = useWorldMembership();
  const roleById = useMemo(() => new Map(worldRoles.map((r) => [r.id, r])), [worldRoles]);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [activity, setActivity] = useState<Map<string, WorldMemberActivity>>(new Map());
  const [loading, setLoading] = useState(isShared);
  const [query, setQuery] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  /** Membre dont un gestionnaire change le statut. */
  const [statusTarget, setStatusTarget] = useState<MemberRow | null>(null);

  // Les rôles sont résolus au rendu, pas au chargement : un rôle renommé ou
  // recoloré dans les réglages se reflète ici sans recharger la liste.
  const members = useMemo<WorldMemberCardData[]>(
    () =>
      rows.map((row) => ({
        ...row,
        roles: sortRolesByPosition(row.role_ids.map((id) => roleById.get(id)).filter((r): r is WorldRoleRow => !!r)),
        effectiveStatus: effectiveStatus(row),
      })),
    [rows, roleById],
  );

  const onlineCount = members.filter((m) => getUserPresence(m.user_id) === "online").length;
  /** Ma propre ligne : le bouton « Ma carte » n'a de sens que pour un membre. */
  const me = membership ? rows.find((r) => r.user_id === membership.userId) ?? null : null;

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return members.filter((m) => {
      if (onlineOnly && getUserPresence(m.user_id) !== "online") return false;
      if (!q) return true;
      return (
        normalize(displayNameOf(m)).includes(q) ||
        m.personas.some((p) => normalize(p.name).includes(q)) ||
        m.roles.some((r) => normalize(r.name).includes(q))
      );
    });
  }, [members, query, onlineOnly, getUserPresence]);

  // Le propriétaire d'abord, puis une section par rôle « hoist » (du plus haut
  // au plus bas), puis les autres membres ; dans chaque section les membres en
  // ligne d'abord, les membres en pause ou absents en dernier, puis par nom.
  const grouped = useMemo(() => {
    const map = new Map<string, WorldMemberCardData[]>();
    for (const m of filtered) {
      const key = m.isOwner ? OWNER_GROUP : (highestHoistedRole(m.roles)?.id ?? OTHERS_GROUP);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    const order = [
      OWNER_GROUP,
      ...sortRolesByPosition(worldRoles.filter((r) => r.hoist)).map((r) => r.id),
      OTHERS_GROUP,
    ];
    return order
      .filter((key) => map.has(key))
      .map((key) => ({
        key,
        role: roleById.get(key) ?? null,
        members: map
          .get(key)!
          .slice()
          .sort((a, b) => {
            const byStatus = Number(a.effectiveStatus !== "active") - Number(b.effectiveStatus !== "active");
            if (byStatus !== 0) return byStatus;
            const byPresence =
              PRESENCE_ORDER[getUserPresence(a.user_id)] - PRESENCE_ORDER[getUserPresence(b.user_id)];
            if (byPresence !== 0) return byPresence;
            return displayNameOf(a).localeCompare(displayNameOf(b), undefined, { sensitivity: "base" });
          }),
      }));
  }, [filtered, getUserPresence, worldRoles, roleById]);

  useEffect(() => {
    if (!isShared) return;
    void fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  async function fetchMembers() {
    setLoading(true);

    // La déduplication (membre, persona) est faite par Postgres — la requête
    // `chatrooms` puis les 2000 `chat_messages` qu'elle servait à filtrer ne
    // sont plus nécessaires (cf. lib/worldMemberPersonas.ts, migration 118).
    // L'activité arrive à part : elle n'empêche pas d'afficher les cartes.
    const activityPromise = fetchWorldMemberActivity(supabase, worldId);
    const [fetched, personasByUser] = await Promise.all([
      fetchWorldMembers(supabase, worldId, ownerId),
      fetchPersonasByMember(supabase, worldId),
    ]);

    setRows(
      fetched.map((row) => ({
        ...row,
        isOwner: row.user_id === ownerId,
        personas: personasByUser.get(row.user_id) ?? [],
      })),
    );
    setLoading(false);
    setActivity(await activityPromise);
  }

  function patchRow(userId: string, fields: Partial<MemberRow>) {
    setRows((prev) => prev.map((x) => (x.user_id === userId ? { ...x, ...fields } : x)));
  }

  function manageFor(m: WorldMemberCardData): ReactNode {
    if (!canManage || m.isOwner || !membership || m.user_id === membership.userId) return null;
    return (
      <MemberManageMenu
        worldId={worldId}
        member={m}
        memberRoles={m.roles}
        membership={membership}
        allRoles={worldRoles}
        onRolesChanged={(userId, roleIds) => patchRow(userId, { role_ids: roleIds })}
        onRemoved={(userId) => setRows((prev) => prev.filter((x) => x.user_id !== userId))}
        onChangeStatus={() => setStatusTarget(rows.find((r) => r.user_id === m.user_id) ?? null)}
      />
    );
  }

  function headingOf(g: { key: string; role: WorldRoleRow | null }) {
    if (g.key === OWNER_GROUP) return t("ownerSection");
    if (g.key === OTHERS_GROUP) return t("othersSection");
    return g.role?.name ?? "";
  }

  const empty = !isShared || (!loading && members.length === 0);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WorldPanelHeader
        icon={<Users className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={
          <>
            {t("title")}
            {members.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{members.length}</span>
            )}
          </>
        }
        right={
          isShared && (
            <div className="flex items-center gap-2">
              {me && (
                <WorldMemberCardDialog
                  worldId={worldId}
                  userId={me.user_id}
                  mode="self"
                  initial={me}
                  onSaved={(fields) => patchRow(me.user_id, fields)}
                  trigger={
                    <Button size="sm" variant="ghost">
                      <IdCard className="mr-2 h-4 w-4" />
                      {t("card.mine")}
                    </Button>
                  }
                />
              )}
              {canManage && <WorldInviteDialog worldId={worldId} />}
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
        <div className="space-y-6 px-6 py-6">
          {!empty && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1 basis-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  className="pl-9"
                />
              </div>
              {/* Le compteur est aussi un filtre : un clic ne garde que les
                  membres en ligne, un second clic rétablit tout le monde. */}
              <button
                type="button"
                aria-pressed={onlineOnly}
                onClick={() => setOnlineOnly((v) => !v)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  onlineOnly
                    ? "border-transparent bg-muted text-foreground"
                    : "border-border-soft text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <PresenceDot state={onlineCount > 0 ? "online" : "offline"} />
                {t("onlineCount", { count: onlineCount })}
              </button>
            </div>
          )}

          {empty ? (
            <p className="rounded-2xl border border-dashed border-border-soft py-10 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-soft py-10 text-center text-sm text-muted-foreground">
              {t("noResults")}
            </p>
          ) : (
            grouped.map((g) => (
              <RoleSection
                key={g.key}
                heading={headingOf(g)}
                role={g.role}
                members={g.members}
                presenceOf={getUserPresence}
                activityOf={(id) => activity.get(id)}
                manageFor={manageFor}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
