"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { MessageSquare, Users } from "lucide-react";
import { useDms } from "@/components/providers/DmsProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabaseThumb } from "@/lib/storage";
import { WorldInviteDialog } from "@/components/worlds/members/WorldInviteDialog";

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

type PersonaInfo = {
  id: string;
  name: string;
  avatar_url: string | null;
};

type Member = {
  user_id: string;
  role: string;
  username: string | null;
  avatar_url: string | null;
  personas: PersonaInfo[];
};

// ---------------------------------------------------------------------------

function Avatar({
  src,
  alt,
  fallback,
  size = 40,
  className = "",
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
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-400 font-semibold text-muted-foreground ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
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

function MemberRow({ member }: { member: Member }) {
  const displayName = member.username
    ? `@${member.username}`
    : member.user_id.slice(0, 8);
  const letter = (displayName.replace(/^@/, "")[0] ?? "?").toUpperCase();
  const shown = member.personas.slice(0, 4);
  const rest = member.personas.length - shown.length;
  const { userId: currentUserId } = useCurrentUser();
  const { openConversation } = useDms();
  const { direct_messages: dmsEnabled } = useFeatureFlags();

  async function handleDm() {
    await openConversation(member.user_id);
  }

  return (
    <div className="group/member flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/40">
      <div className="flex flex-1 shrink-0 flex-col gap-1 min-w-0">

        {/* Avatar avec personas en superposition */}
        <div className="relative w-full flex gap-2 items-center min-w-0">
          <Avatar
            src={member.avatar_url}
            alt={displayName}
            fallback={letter}
            size={34}
            className="text-sm"
          />
          <div className="flex flex-1 items-center min-w-0 gap-2">
            <span className="flex-1 text-xs font-medium leading-none truncate">
              {displayName}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {dmsEnabled && member.user_id !== currentUserId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleDm}
                      aria-label="Envoyer un message privé"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/member:opacity-100 hover:bg-muted hover:text-foreground transition-all"
                    >
                      <MessageSquare size={13} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={4}>Message privé</TooltipContent>
                </Tooltip>
              )}
            {shown.length > 0 && (
              <div className="flex -space-x-1">
                {shown.map((p) => (
                  <Tooltip key={p.id}>
                    <TooltipTrigger asChild>
                      <span>
                        <Avatar
                          src={p.avatar_url}
                          alt={p.name}
                          fallback={(p.name[0] ?? "?").toUpperCase()}
                          size={24}
                          className="border-2 border-background text-[7px] cursor-default"
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={4}>{p.name}</TooltipContent>
                  </Tooltip>
                ))}
                {rest > 0 && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-[7px] font-medium text-muted-foreground">
                    +{rest}
                  </span>
                )}
              </div>
            )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

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

// ---------------------------------------------------------------------------

export function WorldMembersSheet({
  worldId,
  ownerId,
  canManage = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  worldId: string;
  ownerId: string;
  canManage?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  function setOpen(v: boolean) {
    setInternalOpen(v);
    onOpenChange?.(v);
  }
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

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
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, worldId]);

  async function load() {
    setLoading(true);

    // 1. Info du monde (owner_id) + membres — en parallèle
    const [{ data: worldRow }, { data: memberRows }] = await Promise.all([
      supabase.from("worlds").select("owner_id").eq("id", worldId).maybeSingle(),
      supabase.from("world_members").select("user_id, role").eq("world_id", worldId),
    ]);

    const fetchedOwnerId = (worldRow as unknown as { owner_id?: string | null } | null)?.owner_id ?? null;

    // 2. Construire la liste brute (owner toujours présent même s'il n'est pas dans world_members)
    type RawMember = { user_id: string; role: string };
    const memberMap = new Map<string, RawMember>(
      ((memberRows ?? []) as Array<{ user_id: string; role: string }>).map((m) => [m.user_id, { user_id: m.user_id, role: m.role }])
    );
    if (fetchedOwnerId && !memberMap.has(fetchedOwnerId)) {
      memberMap.set(fetchedOwnerId, { user_id: fetchedOwnerId, role: "owner" });
    }
    const allRows = Array.from(memberMap.values());

    // 3. Profils en batch (query séparée — pas de FK world_members.user_id → profiles.id)
    const allUserIds = allRows.map((r) => r.user_id);
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", allUserIds);

    type ProfileRow = { id: string; username: string | null; avatar_url: string | null };
    const profileByUserId = new Map<string, ProfileRow>(
      ((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p])
    );

    // 4. Salles du monde
    const { data: chatrooms } = await supabase
      .from("chatrooms")
      .select("id")
      .eq("world_id", worldId);

    const chatroomIds = ((chatrooms ?? []) as Array<{ id: string }>).map((c) => c.id);

    // 5. Personas distincts par auteur dans les salles du monde
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
        if (!list.some((x) => x.id === p.id)) {
          list.push({ id: p.id, name: p.name, avatar_url: p.avatar_url });
        }
      }
    }

    const result: Member[] = allRows
      .map((row) => {
        const profile = profileByUserId.get(row.user_id) ?? null;
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
    <>
      {!hideTrigger && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Membres du monde"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Users className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>Membres</TooltipContent>
        </Tooltip>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-[320px]">
          <SheetHeader className="border-b border-border-soft px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2">
                Membres
                {!loading && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground">
                    {members.length}
                  </span>
                )}
              </SheetTitle>
              {canManage && (
                <WorldInviteDialog
                  worldId={worldId}
                  ownerId={ownerId}
                  canManage={canManage}
                />
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Aucun membre.
              </p>
            ) : (
              <div className="py-1">
                {grouped.map((g) => (
                  <RoleGroup key={g.role} role={g.role} members={g.members} />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
