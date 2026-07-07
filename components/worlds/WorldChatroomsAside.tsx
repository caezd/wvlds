"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { TABLE, channel as CH } from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNotifications } from "@/components/providers/NotificationsProvider";

export type ChatroomNavItem = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  unread_count: number;
};

function sortRooms(a: ChatroomNavItem, b: ChatroomNavItem) {
  const da = a.last_message_at ? Date.parse(a.last_message_at) : 0;
  const db = b.last_message_at ? Date.parse(b.last_message_at) : 0;
  if (da !== db) return db - da;

  const la = String(a.title ?? a.name ?? "");
  const lb = String(b.title ?? b.name ?? "");
  return la.localeCompare(lb, "fr");
}

type Props = {
  worldId: string;
  selfId: string;
  currentChatId?: string | null;
  initialRooms: ChatroomNavItem[];
  chatroomBaseHref?: string;
  className?: string;
};

export default function WorldChatroomsAside({
  worldId,
  selfId: _selfId,
  currentChatId = null,
  initialRooms,
  chatroomBaseHref,
  className,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const reconnectEpoch = useReconnectEpoch();
  const { roomUnread } = useNotifications();
  const [rooms, setRooms] = useState<ChatroomNavItem[]>(() =>
    [...(initialRooms ?? [])].sort(sortRooms),
  );

  // re-hydrate when SSR data changes (ex: navigation)
  useEffect(() => {
    setRooms([...(initialRooms ?? [])].sort(sortRooms));
  }, [worldId, initialRooms]);
  const base = (chatroomBaseHref ?? "/c").replace(/\/$/, "");
  const toChat = (id: string) => `${base}/${id}`;

  // Realtime: new message -> update last_message_at for sorting
  useEffect(() => {
    if (!worldId) return;

    const ids = rooms.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return;

    const filter = `chat_id=in.(${ids.join(",")})`;

    const ch = supabase
      .channel(CH.navMessages(worldId))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLE.CHAT_MESSAGES, filter },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const m = payload.new as { chat_id: string; created_at: string | null };
          const createdAt = m.created_at ?? new Date().toISOString();

          setRooms((prev) =>
            prev
              .map((r) => r.id === m.chat_id ? { ...r, last_message_at: createdAt } : r)
              .sort(sortRooms),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, worldId, rooms.map((r) => r.id).join(","), reconnectEpoch]);

  // 3) Realtime: new chatroom created in this world -> append to nav
  useEffect(() => {
    if (!worldId) return;

    const ch = supabase
      .channel(`nav-chatrooms-${worldId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: TABLE.CHATROOMS,
          filter: `world_id=eq.${worldId}`,
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const r = payload.new as {
            id: string;
            title: string | null;
            name: string | null;
            icon_url: string | null;
            updated_at: string | null;
          };
          setRooms((prev) => {
            if (prev.some((x) => x.id === r.id)) return prev;
            const next: ChatroomNavItem = {
              id: r.id,
              title: r.title ?? null,
              name: r.name ?? null,
              icon_url: r.icon_url ?? null,
              last_message_at: r.updated_at ?? null,
              unread_count: 0,
            };
            return [...prev, next].sort(sortRooms);
          });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [supabase, worldId, reconnectEpoch]);

  return (
    <aside
      className={className ?? "h-full w-[320px] border-r border-border-soft"}
    >
      <ScrollArea className="h-full">
        <nav className="p-2 space-y-1">
          {rooms.map((r) => {
            const label = (r.title ?? r.name ?? "Chatroom").trim();
            const isActive = r.id === currentChatId;
            const unreadCount = roomUnread[r.id] ?? 0;

            return (
              <Link
                key={r.id}
                href={toChat(r.id)}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex items-center gap-2 rounded-lg px-2 py-2 text-sm",
                  "hover:bg-muted",
                  isActive ? "bg-muted font-medium" : "",
                ].join(" ")}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={r.icon_url ?? undefined} alt={label} />
                  <AvatarFallback>
                    {label.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <span className={["truncate flex-1", unreadCount > 0 ? "font-semibold" : ""].join(" ")}>
                  {label}
                </span>

                {unreadCount > 0 && (
                  <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-medium px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}

                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}

