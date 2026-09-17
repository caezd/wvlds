"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getLeadingLetter, getInitials } from "@/lib/textFormatting";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { fetchPersonasByMember, type WorldMemberPersona } from "@/lib/worldMemberPersonas";
import { ChatroomAvatarWithPresence } from "@/components/chatrooms/persona/ChatroomAvatarWithPresence";
import { PresenceDot } from "@/components/avatars/PresenceDot";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

const WorldInviteDialog = dynamic(() => import("./WorldInviteDialog").then((m) => m.WorldInviteDialog));

// ── Types ────────────────────────────────────────────────────────────────────

type Role = "owner" | "admin" | "editor" | "player" | "viewer";
type PresenceState = "online" | "away" | "offline";

const ROLE_ORDER: Record<Role, number> = {
  owner: 0, admin: 1, editor: 2, player: 3, viewer: 4,
};

const PRESENCE_ORDER: Record<PresenceState, number> = { online: 0, away: 1, offline: 2 };

type Member = {
  user_id: string;
  role: string;
  username: string | null;
  avatar_url: string | null;
  personas: WorldMemberPersona[];
};

const MAX_PERSONA_CHIPS = 4;

function isRole(role: string): role is Role {
  return role in ROLE_ORDER;
}

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

function MemberCard({ member, presence }: { member: Member; presence: PresenceState }) {
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
          {/* Le rôle est le titre de la section : pas de badge ici. La pastille
              accompagne le statut, comme sur la fiche de profil. */}
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <PresenceDot state={presence} />
            {tPresence(presence)}
          </p>
        </div>
      </div>

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
  role,
  members,
  presenceOf,
}: {
  role: string;
  members: Member[];
  presenceOf: (userId: string) => PresenceState;
}) {
  const t = useTranslations("worlds.members");
  const heading = isRole(role) ? t(`rolesPlural.${role}`, { count: members.length }) : role;
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        {heading}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{members.length}</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <MemberCard key={m.user_id} member={m} presence={presenceOf(m.user_id)} />
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
  canManage: boolean;
  isShared: boolean;
}) {
  const t = useTranslations("worlds.members");
  const supabase = useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(isShared);
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
        m.personas.some((p) => normalize(p.name).includes(q))
      );
    });
  }, [members, query, onlineOnly, getUserPresence]);

  // Par rôle, puis les membres en ligne d'abord, puis par nom.
  const grouped = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of filtered) {
      if (!map.has(m.role)) map.set(m.role, []);
      map.get(m.role)!.push(m);
    }
    const roles = Array.from(map.keys()).sort(
      (a, b) => (isRole(a) ? ROLE_ORDER[a] : 99) - (isRole(b) ? ROLE_ORDER[b] : 99),
    );
    return roles.map((role) => ({
      role,
      members: map
        .get(role)!
        .slice()
        .sort((a, b) => {
          const byPresence =
            PRESENCE_ORDER[getUserPresence(a.user_id)] - PRESENCE_ORDER[getUserPresence(b.user_id)];
          if (byPresence !== 0) return byPresence;
          return displayNameOf(a).localeCompare(displayNameOf(b), undefined, { sensitivity: "base" });
        }),
    }));
  }, [filtered, getUserPresence]);

  useEffect(() => {
    if (!isShared) return;
    void fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  async function fetchMembers() {
    setLoading(true);

    const [{ data: worldRow }, { data: memberRows }] = await Promise.all([
      supabase.from("worlds").select("owner_id").eq("id", worldId).maybeSingle(),
      supabase.from("world_members").select("user_id, role").eq("world_id", worldId),
    ]);

    const fetchedOwner = (worldRow as unknown as { owner_id?: string | null } | null)?.owner_id ?? null;

    type RawMember = { user_id: string; role: string };
    const memberMap = new Map<string, RawMember>(
      ((memberRows ?? []) as RawMember[]).map((m) => [m.user_id, m]),
    );
    if (fetchedOwner && !memberMap.has(fetchedOwner)) {
      memberMap.set(fetchedOwner, { user_id: fetchedOwner, role: "owner" });
    }
    const allRows = Array.from(memberMap.values());
    const allUserIds = allRows.map((r) => r.user_id);

    // La déduplication (membre, persona) est faite par Postgres — la requête
    // `chatrooms` puis les 2000 `chat_messages` qu'elle servait à filtrer ne
    // sont plus nécessaires (cf. lib/worldMemberPersonas.ts, migration 118).
    const [{ data: profileRows }, personasByUser] = await Promise.all([
      supabase.from("profiles").select("id, username, avatar_url").in("id", allUserIds),
      fetchPersonasByMember(supabase, worldId),
    ]);

    type ProfileRow = { id: string; username: string | null; avatar_url: string | null };
    const profileByUser = new Map<string, ProfileRow>(
      ((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]),
    );

    setMembers(
      allRows.map((row) => {
        const profile = profileByUser.get(row.user_id) ?? null;
        return {
          user_id: row.user_id,
          role: row.role,
          username: profile?.username ?? null,
          avatar_url: profile?.avatar_url ?? null,
          personas: personasByUser.get(row.user_id) ?? [],
        };
      }),
    );
    setLoading(false);
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
        right={isShared && canManage && <WorldInviteDialog worldId={worldId} ownerId={ownerId} canManage={canManage} />}
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
              <RoleSection key={g.role} role={g.role} members={g.members} presenceOf={getUserPresence} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
