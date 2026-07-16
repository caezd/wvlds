"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { cn } from "@/lib/utils";

type Room = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  last_message_excerpt?: string | null;
  unread_count: number;
  category_id?: string | null;
};

function relativeTime(iso: string | null) {
  if (!iso) return "Aucun message";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `Il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function WorldChatroomsGrid({
  worldId,
  initialRooms,
  onRoomClick,
  categoryId,
}: {
  worldId: string;
  initialRooms: Room[];
  onRoomClick?: (href: string) => void;
  /** Filtre l'affichage sur une catégorie ; "__uncategorized__" pour les chatrooms sans catégorie. */
  categoryId?: string | null;
}) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const { roomUnread } = useNotifications();
  const reconnectEpoch = useReconnectEpoch();

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      const { data, error } = await supabase.rpc("list_chatrooms_nav", {
        p_world_id: worldId,
      });
      if (!error && data) setRooms(data as Room[]);
    };

    const channel = supabase
      .channel(`world_rooms_grid:${worldId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chatrooms",
          filter: `world_id=eq.${worldId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [worldId, reconnectEpoch]);

  const visibleRooms =
    categoryId === undefined || categoryId === null
      ? rooms
      : rooms.filter((room) =>
          categoryId === "__uncategorized__" ? !room.category_id : room.category_id === categoryId,
        );

  if (rooms.length === 0) {
    return (
      <div className="rounded-3xl border border-border-soft p-8 text-center text-sm text-muted-foreground">
        Aucune partie pour le moment — lance la première !
      </div>
    );
  }

  if (visibleRooms.length === 0) {
    return (
      <div className="rounded-3xl border border-border-soft p-8 text-center text-sm text-muted-foreground">
        Aucune partie dans cette catégorie.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border-soft p-3 md:p-4">
      <ul className="grid gap-x-6 md:grid-cols-2">
        {visibleRooms.map((room) => {
          const href = `/c/${room.id}`;
          const unread = roomUnread[room.id] ?? room.unread_count ?? 0;
          const label = room.title || room.name || "Sans titre";
          const excerpt = room.last_message_excerpt?.trim();
          const subtitle =
            (excerpt && !excerpt.startsWith("enc:") ? excerpt : null) ??
            relativeTime(room.last_message_at);
          return (
            <li key={room.id}>
              <Link
                href={href}
                onClick={
                  onRoomClick
                    ? (e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        onRoomClick(href);
                      }
                    : undefined
                }
                className="group flex items-center gap-3.5 rounded-2xl px-3 py-3 hover:bg-secondary transition-colors"
              >
                <span className="relative shrink-0">
                  <span
                    className={cn(
                      "relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full",
                      !room.icon_url && "bg-card-400",
                    )}
                  >
                    {room.icon_url ? (
                      <Image
                        src={room.icon_url}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <MessagesSquare className="h-4.5 w-4.5 text-muted-foreground" />
                    )}
                  </span>
                  {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm font-semibold",
                      unread > 0 ? "text-foreground" : "text-foreground/90",
                    )}
                  >
                    {label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {subtitle}
                  </span>
                </span>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
