"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, ChevronRight, ArrowLeft, MessagesSquare, Hash } from "lucide-react";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useTranslations } from "next-intl";

type Room = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  unread_count: number;
  category_id: string | null;
  last_poster_avatar_url: string | null;
  last_poster_id: string | null;
  participant_count: number;
  second_poster_avatar_url: string | null;
};

type ParticipatedRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  has_unread: boolean;
};

type Category = {
  id: string;
  title: string;
  banner_url: string | null;
  position: number;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase flex gap-1 items-center">
      {children}
    </p>
  );
}

function RoomItem({
  room,
  isActive,
  unread,
  categoryName,
}: {
  room: Room | ParticipatedRoom;
  isActive: boolean;
  unread: number;
  categoryName?: string;
}) {
  const { getUserPresence } = useGlobalPresence();
  const label = (room.title ?? room.name ?? "Chatroom").trim();
  const hasUnread = unread > 0;
  const posterAvatar = "last_poster_avatar_url" in room ? room.last_poster_avatar_url : null;
  const lastPosterId = "last_poster_id" in room ? room.last_poster_id : null;
  const participantCount = "participant_count" in room ? (room.participant_count ?? 0) : 0;
  const secondAvatar = "second_poster_avatar_url" in room ? room.second_poster_avatar_url : null;
  const showOverlay = participantCount >= 2;
  const showCount = participantCount >= 3;
  const presence = !showOverlay && lastPosterId ? getUserPresence(lastPosterId) : null;

  return (
    <Link
      href={`/c/${room.id}`}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm transition-colors",
        "hover:bg-hoverCard",
        isActive ? "bg-hoverCard" : "",
      )}
    >
      {showOverlay && !showCount ? (
        /* 2 avatars, même taille, superposition diagonale */
        <div className="relative shrink-0 size-9">
          <Avatar className="absolute top-0 left-0 size-6 rounded-full ring-3 ring-background z-0">
            {secondAvatar && <AvatarImage src={secondAvatar} className="rounded-full" />}
            <AvatarFallback className="rounded-full text-[11px] bg-muted-foreground/20" />
          </Avatar>
          <Avatar className="absolute bottom-0 right-0 size-6 rounded-full ring-3 ring-background z-10">
            {posterAvatar && <AvatarImage src={posterAvatar} className="rounded-full" />}
            <AvatarFallback className="rounded-full text-[11px] bg-muted-foreground/20">
              {label[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      ) : (
        /* 1 avatar seul ou avatar + badge +N */
        <div className="relative shrink-0 size-9">
          <Avatar className="size-9 rounded-full">
            {posterAvatar && <AvatarImage src={posterAvatar} className="rounded-full" />}
            <AvatarFallback className="rounded-full text-[11px] bg-muted-foreground/20">
              {label[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {showCount && (
            <span className="absolute -bottom-0.5 -right-1.5 h-[18px] min-w-[18px] flex items-center justify-center rounded-full bg-muted border-2 border-background text-[8px] font-bold text-muted-foreground px-0.5 z-10">
              +{participantCount}
            </span>
          )}
          {presence && (
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background z-10",
              presence === "online" ? "bg-green-500" : presence === "away" ? "bg-amber-400" : "bg-red-500",
            )} />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "truncate leading-tight text-sm",
          hasUnread || isActive ? "font-semibold text-mist-100" : "text-mist-50",
        )}>
          {label}
        </p>
        {categoryName && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground/60 leading-tight">
            <MessagesSquare size={9} className="shrink-0 opacity-70" />
            <span className="truncate">{categoryName}</span>
          </p>
        )}
      </div>
      {hasUnread && (
        <span className="shrink-0 min-w-4 h-4 flex items-center justify-center rounded-full bg-accent text-accent-foreground text-[10px] font-bold px-0.5">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

export function WorldSidebarChatrooms({
  worldId,
  initialAll,
  initialParticipated,
  initialFollowedIds,
  categories,
}: {
  worldId: string;
  initialAll: Room[];
  initialParticipated: ParticipatedRoom[];
  initialFollowedIds: string[];
  categories: Category[];
}) {
  const t = useTranslations("worlds");
  const { roomUnread } = useNotifications();
  const pathname = usePathname();
  const [allRooms, setAllRooms] = useState<Room[]>(initialAll);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);

  const activeChatroomId = pathname?.startsWith("/c/")
    ? pathname.split("/c/")[1]?.split("/")[0]
    : undefined;

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // IDs stables des rooms participées (filtre pour ACTIF)
  const participatedIds = new Set(initialParticipated.map((p) => p.id));
  const followedSet = new Set(initialFollowedIds);

  // ACTIF: top 5 rooms participées, triées par last_message_at (allRooms est déjà trié)
  const actif = allRooms.filter((r) => participatedIds.has(r.id)).slice(0, 5);

  // SUIVI: rooms suivies, triées par last_message_at
  const suivi = allRooms.filter((r) => followedSet.has(r.id));

  // TOUS: rooms grouped by category
  const byCategory = new Map<string, Room[]>();
  const uncategorized: Room[] = [];
  for (const room of allRooms) {
    if (room.category_id && categoryById.has(room.category_id)) {
      const list = byCategory.get(room.category_id) ?? [];
      list.push(room);
      byCategory.set(room.category_id, list);
    } else {
      uncategorized.push(room);
    }
  }

  // Realtime: nouvelles chatrooms + mises à jour chatroom_summaries (avatar, last_message_at)
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`sidebar-rooms:${worldId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chatrooms", filter: `world_id=eq.${worldId}` },
        (payload: { new: Record<string, unknown> }) => {
          const r = payload.new as {
            id: string; title: string | null; name: string | null;
            icon_url: string | null; last_message_at: string | null; category_id: string | null;
          };
          setAllRooms((prev) => {
            if (prev.some((x) => x.id === r.id)) return prev;
            return [...prev, { ...r, unread_count: 0, last_poster_avatar_url: null, last_poster_id: null, participant_count: 0, second_poster_avatar_url: null }].sort(
              (a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""),
            );
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chatroom_summaries" },
        (payload: { new: Record<string, unknown> }) => {
          const s = payload.new as {
            chat_id: string;
            last_message_at: string | null;
            last_message_author_id: string | null;
            last_message_persona_avatar_url: string | null;
          };
          setAllRooms((prev) => {
            const updated = prev.map((r) =>
              r.id === s.chat_id
                ? {
                    ...r,
                    last_message_at: s.last_message_at,
                    last_poster_id: s.last_message_author_id,
                    last_poster_avatar_url: s.last_message_persona_avatar_url,
                  }
                : r,
            );
            return updated.sort(
              (a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""),
            );
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chatroom_summaries" },
        (payload: { old: Record<string, unknown> }) => {
          const chatId = (payload.old as { chat_id?: string }).chat_id;
          if (!chatId) return;
          setAllRooms((prev) =>
            prev.map((r) =>
              r.id === chatId
                ? { ...r, last_poster_id: null, last_poster_avatar_url: null, last_message_at: null }
                : r,
            ),
          );
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [worldId]);

  // Vue catégorie (drill-down)
  if (selectedCat) {
    const catRooms = byCategory.get(selectedCat.id) ?? [];
    return (
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          <button
            onClick={() => setSelectedCat(null)}
            className="flex items-center gap-1.5 px-2 py-1.5 mb-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted w-full"
          >
            <ArrowLeft size={12} />
            {t("sidebar.back")}
          </button>
          <p className="px-2 mb-2 text-sm font-semibold text-foreground truncate">
            {selectedCat.title}
          </p>
          {catRooms.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground/60">
              {t("sidebar.noChatroomsInCategory")}
            </p>
          ) : (
            <div className="space-y-0.5">
              {catRooms.map((room) => (
                <RoomItem
                  key={room.id}
                  room={room}
                  isActive={room.id === activeChatroomId}
                  unread={roomUnread[room.id] ?? 0}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-2 space-y-4">

        {/* ACTIF */}
        {actif.length > 0 && (
          <section>
            <SectionLabel><Hash size={12} /> {t("sidebar.active")}</SectionLabel>
            <div className="space-y-0.5">
              {actif.map((room) => (
                <RoomItem
                  key={room.id}
                  room={room}
                  isActive={room.id === activeChatroomId}
                  unread={roomUnread[room.id] ?? 0}
                  categoryName={room.category_id ? categoryById.get(room.category_id)?.title : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* SUIVI */}
        {suivi.length > 0 && (
          <section>
            <SectionLabel><Star size={12} /> {t("sidebar.followed")}</SectionLabel>
            <div className="space-y-0.5">
              {suivi.map((room) => (
                <RoomItem
                  key={room.id}
                  room={room}
                  isActive={room.id === activeChatroomId}
                  unread={roomUnread[room.id] ?? 0}
                  categoryName={room.category_id ? categoryById.get(room.category_id)?.title : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* TOUS — cartes catégories uniquement */}
        <section>
          <SectionLabel>{t("sidebar.all")}</SectionLabel>
          <div className="space-y-1">
            {categories.map((cat) => {
              const rooms = byCategory.get(cat.id) ?? [];
              const hasUnread = rooms.some((r) => (roomUnread[r.id] ?? 0) > 0);
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat)}
                  className="flex items-center gap-2.5 w-full rounded-md px-2 py-1.5 hover:bg-muted transition-colors text-left group"
                >
                  {/* Bannière catégorie */}
                  <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-muted-foreground/10 flex items-center justify-center">
                    {cat.banner_url ? (
                      <img src={cat.banner_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {cat.title[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground leading-tight">
                      {cat.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 leading-tight">
                      {t("sidebar.subjects", { count: rooms.length })}
                    </p>
                  </div>
                  {hasUnread && (
                    <span className="shrink-0 h-2 w-2 rounded-full bg-destructive" />
                  )}
                  <ChevronRight size={12} className="shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" />
                </button>
              );
            })}
            {uncategorized.length > 0 && (
              <button
                onClick={() => setSelectedCat({ id: "__uncategorized__", title: t("sidebar.general"), banner_url: null, position: 9999 })}
                className="flex items-center gap-2.5 w-full rounded-md px-2 py-1.5 hover:bg-muted transition-colors text-left group"
              >
                <div className="h-9 w-9 shrink-0 rounded-lg bg-muted-foreground/10 flex items-center justify-center">
                  <span className="text-[11px] font-medium text-muted-foreground">G</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground leading-tight">{t("sidebar.general")}</p>
                  <p className="text-[10px] text-muted-foreground/60 leading-tight">
                    {t("sidebar.subjects", { count: uncategorized.length })}
                  </p>
                </div>
                {uncategorized.some((r) => (roomUnread[r.id] ?? 0) > 0) && (
                  <span className="shrink-0 h-2 w-2 rounded-full bg-destructive" />
                )}
                <ChevronRight size={12} className="shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" />
              </button>
            )}
            {categories.length === 0 && uncategorized.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground/60">{t("sidebar.noChatrooms")}</p>
            )}
          </div>
        </section>

      </div>
    </ScrollArea>
  );
}
