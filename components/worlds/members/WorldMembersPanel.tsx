"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getLeadingLetter, getInitials } from "@/lib/textFormatting";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { fetchPersonasByMember, type WorldMemberPersona } from "@/lib/worldMemberPersonas";
import { fetchWorldMembers } from "@/lib/worldMembers";
import { highestHoistedRole, sortRolesByPosition, type WorldRoleRow } from "@/lib/worldPermissions";
import { ChatroomAvatarWithPresence } from "@/components/chatrooms/persona/ChatroomAvatarWithPresence";
import { PresenceDot } from "@/components/avatars/PresenceDot";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { RoleChip } from "./RoleChip";
import { MemberManageMenu } from "./MemberManageMenu";

const WorldInviteDialog = dynamic(() => import("./WorldInviteDialog").then((m) => m.WorldInviteDialog));

// ── Types ────────────────────────────────────────────────────────────────────

type PresenceState = "online" | "away" | "offline";

const PRESENCE_ORDER: Record<PresenceState, number> = { online: 0, away: 1, offline: 2 };

type MemberRow = {
  user_id: string;
  isOwner: boolean;
  role_ids: string[];
  username: string | null;
  avatar_url: string | null;
  personas: WorldMemberPersona[];
};

/** Un membre avec ses rôles résolus, du plus haut au plus bas. */
type Member = MemberRow & { roles: WorldRoleRow[] };

/** Clés de la section « Propriétaire » et de celle des membres sans rôle « hoist ». */
const OWNER_GROUP = "__owner__";
const OTHERS_GROUP = "__others__";

const MAX_PERSONA_CHIPS = 4;

function displayNameOf(member: Pick<Member, "username" | "user_id">) {
  return member.username ? `@${member.username}` : member.user_id.slice(0, 8);
}

/** Comparaison sans casse ni accents, pour le filtre de recherche. */
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function normalize(text: string) {
  return text.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

// ── PersonaChip ──────────────────────────────────────────────────────────────

function PersonaChip({ persona, userId }: { persona: WorldMemberPersona; userId: string }) {
  const name = persona.name || "?";
  return (
    <PersonaProfileSheetTrigger
      personaId={persona.id}
      userId={userId}
      label={name}
      triggerClassName="flex max-w-full items-center gap-1.5 rounded-full border border-border-soft bg-muted/40 py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChatroomAvatarWithPresence
        url={persona.avatar_url}
        alt=""
        fallback={getInitials(name, "P")}
        presenceState="invisible"
        size={20}
        className="rounded-full"
      />
      <span className="truncate">{name}</span>
    </PersonaProfileSheetTrigger>
  );
}

// ── MemberCard ───────────────────────────────────────────────────────────────

function MemberCard({
  member,
  presence,
  manage,
}: {
  member: Member;
  presence: PresenceState;
  /** Le menu « ⋯ », quand le lecteur peut gérer ce membre. */
  manage?: ReactNode;
}) {
  const t = useTranslations("worlds.members");
  const tPresence = useTranslations("presence");
  const displayName = displayNameOf(member);
  const shown = member.personas.slice(0, MAX_PERSONA_CHIPS);
  const rest = member.personas.length - shown.length;

  return (
    <article
      data-presence={presence}
      className="flex flex-col gap-3 rounded-lg border border-border-soft p-3"
    >
      <div className="flex items-start gap-3">
        <UserProfileSheetTrigger userId={member.user_id} label={t("openProfile", { name: displayName })}>
          <ChatroomAvatarWithPresence
            url={member.avatar_url}
            alt=""
            fallback={getLeadingLetter(displayName)}
            presenceState="invisible"
            size={48}
            className="rounded-full text-base"
          />
        </UserProfileSheetTrigger>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-sm font-semibold">{displayName}</p>
          {/* La pastille accompagne le statut, comme sur la fiche de profil. */}
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <PresenceDot state={presence} />
            {tPresence(presence)}
          </p>
        </div>
        {manage}
      </div>

      {/* Un membre peut cumuler plusieurs rôles : la section ne dit que le plus
          haut, les puces disent tous les autres. */}
      {member.roles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" data-testid="member-roles">
          {member.roles.map((r) => (
            <RoleChip key={r.id} role={r} />
          ))}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((p) => (
            <PersonaChip key={p.id} persona={p} userId={member.user_id} />
          ))}
          {rest > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs text-muted-foreground">
              {t("morePersonas", { count: rest })}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs italic text-muted-foreground">{t("noPersona")}</p>
      )}
    </article>
  );
}

// ── RoleSection ──────────────────────────────────────────────────────────────

function RoleSection({
  heading,
  color,
  members,
  presenceOf,
  manageFor,
}: {
  heading: string;
  color?: string;
  members: Member[];
  presenceOf: (userId: string) => PresenceState;
  manageFor: (m: Member) => ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        {color && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
        {heading}
        <span className="text-xs font-normal text-muted-foreground">{members.length}</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <MemberCard key={m.user_id} member={m} presence={presenceOf(m.user_id)} manage={manageFor(m)} />
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
  /** `members.manage` : inviter, attribuer des rôles, retirer. */
  canManage: boolean;
  isShared: boolean;
}) {
  const t = useTranslations("worlds.members");
  const supabase = useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();
  const { roles: worldRoles, membership } = useWorldMembership();
  const roleById = useMemo(() => new Map(worldRoles.map((r) => [r.id, r])), [worldRoles]);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(isShared);

  // Les rôles sont résolus au rendu, pas au chargement : un rôle renommé ou
  // recoloré dans les réglages se reflète ici sans recharger la liste.
  const members = useMemo<Member[]>(
    () =>
      rows.map((row) => ({
        ...row,
        roles: sortRolesByPosition(row.role_ids.map((id) => roleById.get(id)).filter((r): r is WorldRoleRow => !!r)),
      })),
    [rows, roleById],
  );
  const [query, setQuery] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);

  const onlineCount = members.filter((m) => getUserPresence(m.user_id) === "online").length;

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
  // ligne d'abord, puis par nom.
  const grouped = useMemo(() => {
    const map = new Map<string, Member[]>();
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
    const [fetched, personasByUser] = await Promise.all([
      fetchWorldMembers(supabase, worldId, ownerId),
      fetchPersonasByMember(supabase, worldId),
    ]);

    setRows(
      fetched.map((row) => ({
        user_id: row.user_id,
        isOwner: row.user_id === ownerId,
        role_ids: row.role_ids,
        username: row.username,
        avatar_url: row.avatar_url,
        personas: personasByUser.get(row.user_id) ?? [],
      })),
    );
    setLoading(false);
  }

  function manageFor(m: Member): ReactNode {
    if (!canManage || m.isOwner || !membership) return null;
    return (
      <MemberManageMenu
        worldId={worldId}
        member={m}
        memberRoles={m.roles}
        membership={membership}
        allRoles={worldRoles}
        onRolesChanged={(userId, roleIds) =>
          setRows((prev) => prev.map((x) => (x.user_id === userId ? { ...x, role_ids: roleIds } : x)))
        }
        onRemoved={(userId) => setRows((prev) => prev.filter((x) => x.user_id !== userId))}
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
        right={isShared && canManage && <WorldInviteDialog worldId={worldId} />}
      />

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
                color={g.role?.color}
                members={g.members}
                presenceOf={getUserPresence}
                manageFor={manageFor}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
