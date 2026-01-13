"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  chatroomHref?: (chatId: string) => string;
  className?: string;
};

export default function WorldChatroomsAside({
  worldId,
  selfId,
  currentChatId = null,
  initialRooms,
  chatroomBaseHref,
  className,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [rooms, setRooms] = useState<ChatroomNavItem[]>(() =>
    [...(initialRooms ?? [])].sort(sortRooms),
  );

  // re-hydrate when SSR data changes (ex: navigation)
  useEffect(() => {
    setRooms([...(initialRooms ?? [])].sort(sortRooms));
  }, [worldId, initialRooms]);
  const base = (chatroomBaseHref ?? "/c").replace(/\/$/, "");
  const toChat = (id: string) => `${base}/${id}`;

  // 1) Realtime: new message -> unread + last_message_at
  useEffect(() => {
    if (!worldId) return;

    // filter = chat_id in (all rooms ids) to avoid receiving everything
    const ids = rooms.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return;

    const filter = `chat_id=in.(${ids.join(",")})`;

    const ch = supabase
      .channel(`nav-messages-${worldId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter },
        (payload) => {
          const m: any = payload.new;
          const chatId = m.chat_id as string;
          const createdAt = (m.created_at ??
            new Date().toISOString()) as string;
          const authorId = m.author_id as string | null;

          setRooms((prev) => {
            const next = prev.map((r) => {
              if (r.id !== chatId) return r;

              // Si l’utilisateur est dans cette chatroom, on considère “lu” (unread=0)
              // Sinon, si le message vient d’un autre utilisateur, on incrémente.
              const shouldUnread =
                chatId !== currentChatId && authorId && authorId !== selfId;

              return {
                ...r,
                last_message_at: createdAt,
                unread_count: shouldUnread ? (r.unread_count ?? 0) + 1 : 0,
              };
            });

            return next.sort(sortRooms);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
    // rooms ids affect the filter, so we rebuild if list changes
  }, [
    supabase,
    worldId,
    selfId,
    currentChatId,
    rooms.map((r) => r.id).join(","),
  ]);

  // 2) Realtime: read cursor updates -> unread=0
  useEffect(() => {
    if (!selfId) return;

    const ch = supabase
      .channel(`nav-reads-${selfId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chatroom_reads",
          filter: `user_id=eq.${selfId}`,
        },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          const chatId = (row.chat_id ?? null) as string | null;
          if (!chatId) return;

          setRooms((prev) =>
            prev.map((r) => (r.id === chatId ? { ...r, unread_count: 0 } : r)),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, selfId]);

  useEffect(() => {
    if (!currentChatId) return;
    setRooms((prev) =>
      prev.map((r) => (r.id === currentChatId ? { ...r, unread_count: 0 } : r)),
    );
  }, [currentChatId]);

  return (
    <aside
      className={className ?? "h-full w-[320px] border-r border-border-soft"}
    >
      <ScrollArea className="h-full">
        <nav className="p-2 space-y-1">
          {rooms.map((r) => {
            const label = (r.title ?? r.name ?? "Chatroom").trim();
            const isActive = r.id === currentChatId;
            const unread = (r.unread_count ?? 0) > 0;

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
                onClick={() => {
                  setRooms((prev) =>
                    prev.map((x) =>
                      x.id === r.id ? { ...x, unread_count: 0 } : x,
                    ),
                  );
                }}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={r.icon_url ?? undefined} alt={label} />
                  <AvatarFallback>
                    {label.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <span className="truncate flex-1">{label}</span>

                {unread && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    {r.unread_count > 1 && (
                      <span className="text-xs text-muted-foreground">
                        {r.unread_count}
                      </span>
                    )}
                  </span>
                )}

                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
