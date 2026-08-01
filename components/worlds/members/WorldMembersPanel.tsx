"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Users } from "lucide-react";
import { supabaseThumb } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { getLeadingLetter } from "@/lib/textFormatting";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

const WorldInviteDialog = dynamic(() => import("./WorldInviteDialog").then((m) => m.WorldInviteDialog));
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Types ────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Admin",
  editor: "Éditeur",
  player: "Joueur",
  observer: "Observateur",
};

const ROLE_ORDER: Record<string, number> = {
  owner: 0, admin: 1, editor: 2, player: 3, observer: 4,
};

type PersonaInfo = { id: string; name: string; avatar_url: string | null };

type Member = {
  user_id: string;
  role: string;
  username: string | null;
  avatar_url: string | null;
  personas: PersonaInfo[];
};

// ── Avatar helper ─────────────────────────────────────────────────────────────

function Av({
  src,
  alt,
  fallback,
  size = 32,
  className,
}: {
  src?: string | null;
  alt: string;
  fallback: string;
  size?: number;
  className?: string;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => setThumbFailed(false), [src]);
  const thumb = src ? (thumbFailed ? src : (supabaseThumb(src, size * 2) ?? src)) : null;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {thumb ? (
        <Image
          src={thumb}
          alt={alt}
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

// ── MemberRow ─────────────────────────────────────────────────────────────────

function MemberRow({ member }: { member: Member }) {
  const displayName = member.username ? `@${member.username}` : member.user_id.slice(0, 8);
  const letter = getLeadingLetter(displayName);
  const shown = member.personas.slice(0, 5);
  const rest = member.personas.length - shown.length;

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/40">
      <Av src={member.avatar_url} alt={displayName} fallback={letter} size={34} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayName}</span>
      {shown.length > 0 && (
        <div className="flex -space-x-1.5 shrink-0">
          {shown.map((p) => (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <span>
                  <Av
                    src={p.avatar_url}
                    alt={p.name}
                    fallback={(p.name[0] ?? "?").toUpperCase()}
                    size={22}
                    className="border-2 border-background cursor-default"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>{p.name}</TooltipContent>
            </Tooltip>
          ))}
          {rest > 0 && (
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px] font-medium text-muted-foreground">
              +{rest}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── RoleGroup ─────────────────────────────────────────────────────────────────

function RoleGroup({ role, members }: { role: string; members: Member[] }) {
  return (
    <details open className="group/role">
      <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-3 py-2">
        <svg
          className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-open/role:rotate-90"
          viewBox="0 0 6 10"
          fill="none"
        >
          <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {ROLE_LABEL[role] ?? role}
        </span>
        <span className="text-[11px] text-muted-foreground/40">— {members.length}</span>
      </summary>
      <div className="pb-1">
        {members.map((m) => (
          <MemberRow key={m.user_id} member={m} />
        ))}
      </div>
    </details>
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
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(isShared);

  const grouped = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of members) {
      if (!map.has(m.role)) map.set(m.role, []);
      map.get(m.role)!.push(m);
    }
    return Object.keys(ROLE_ORDER)
      .filter((role) => map.has(role))
      .map((role) => ({ role, members: map.get(role)! }));
  }, [members]);

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

    const [{ data: profileRows }, { data: chatrooms }] = await Promise.all([
      supabase.from("profiles").select("id, username, avatar_url").in("id", allUserIds),
      supabase.from("chatrooms").select("id").eq("world_id", worldId),
    ]);

    type ProfileRow = { id: string; username: string | null; avatar_url: string | null };
    const profileByUser = new Map<string, ProfileRow>(
      ((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]),
    );

    const chatroomIds = ((chatrooms ?? []) as Array<{ id: string }>).map((c) => c.id);
    const personasByUser = new Map<string, PersonaInfo[]>();

    if (chatroomIds.length > 0) {
      const { data: msgRows } = await supabase
        .from("chat_messages")
        .select("author_id, persona:persona_id(id, name, avatar_url)")
        .in("chat_id", chatroomIds)
        .not("persona_id", "is", null)
        .limit(2000);

      for (const row of msgRows ?? []) {
        const uid = row.author_id as string | null;
        const p = row.persona as unknown as PersonaInfo | null;
        if (!uid || !p?.id) continue;
        if (!personasByUser.has(uid)) personasByUser.set(uid, []);
        const list = personasByUser.get(uid)!;
        if (!list.some((x) => x.id === p.id)) list.push({ id: p.id, name: p.name, avatar_url: p.avatar_url });
      }
    }

    const result: Member[] = allRows
      .map((row) => {
        const profile = profileByUser.get(row.user_id) ?? null;
        return {
          user_id: row.user_id,
          role: row.role,
          username: profile?.username ?? null,
          avatar_url: profile?.avatar_url ?? null,
          personas: personasByUser.get(row.user_id) ?? [],
        };
      })
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));

    setMembers(result);
    setLoading(false);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WorldPanelHeader
        icon={<Users className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title="Membres"
        right={isShared && canManage && <WorldInviteDialog worldId={worldId} ownerId={ownerId} canManage={canManage} />}
      />

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 py-6">
          {!isShared ? (
            <p className="rounded-xl border border-dashed border-border-soft py-8 text-center text-sm text-muted-foreground">
              Aucun membre.
            </p>
          ) : loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-soft py-8 text-center text-sm text-muted-foreground">
              Aucun membre.
            </p>
          ) : (
            <div className="rounded-xl border border-border-soft">
              {grouped.map((g, i) => (
                <div key={g.role} className={cn(i > 0 && "border-t border-border-soft")}>
                  <RoleGroup role={g.role} members={g.members} />
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
