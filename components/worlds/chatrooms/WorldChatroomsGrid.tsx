"use client";

import { useEffect, useState } from "react";
import type { WorldHomeRoom as Room } from "@/types/worlds";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


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

/** Hauteur d'une ligne de la liste (py-3 + contenu ≈ 66px) — sert à traduire
 *  `visibleRows` en hauteur maximale avant défilement. */
const ROOM_ROW_HEIGHT = 66;

export function WorldChatroomsGrid({
  worldId,
  initialRooms,
  onRoomClick,
  categoryId,
  visibleRows,
}: {
  worldId: string;
  initialRooms: Room[];
  onRoomClick?: (href: string) => void;
  /** Filtre l'affichage sur une catégorie ; "__uncategorized__" pour les chatrooms sans catégorie. */
  categoryId?: string | null;
  /** Nombre de lignes visibles avant que le reste ne défile — réglage du
   *  widget sur la page d'accueil (voir WORLD_HOME_WIDGET_OPTIONS). Non
   *  défini = pas de limite de hauteur. */
  visibleRows?: number;
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chatroom_summaries" },
        (payload: { new: Record<string, unknown> }) => {
          const s = payload.new as {
            chat_id: string;
            last_message_at: string | null;
            last_message_persona_avatar_url: string | null;
          };
          setRooms((prev) =>
            prev.map((r) =>
              r.id === s.chat_id
                ? { ...r, last_message_at: s.last_message_at, last_poster_avatar_url: s.last_message_persona_avatar_url }
                : r,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chatroom_summaries" },
        (payload: { old: Record<string, unknown> }) => {
          const chatId = (payload.old as { chat_id?: string }).chat_id;
          if (!chatId) return;
          setRooms((prev) =>
            prev.map((r) =>
              r.id === chatId ? { ...r, last_poster_avatar_url: null, last_message_at: null } : r,
            ),
          );
        },
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
      <div className="rounded-lg border border-border-soft p-8 text-center text-sm text-muted-foreground">
        Aucune partie pour le moment — lance la première !
      </div>
    );
  }

  if (visibleRooms.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Aucune partie dans cette catégorie.
      </div>
    );
  }

  return (
    <div
      className="overflow-y-auto rounded-lg border p-2"
      // `visibleRows` borne la hauteur d'affichage, le reste défile ici même
      // — réglage d'affichage seulement : toutes les parties restent listées.
      style={visibleRows ? { maxHeight: visibleRows * ROOM_ROW_HEIGHT } : undefined}
    >
      {/* @sm (largeur du conteneur), pas md: (viewport) — ce widget peut être
          placé dans une cellule de grille étroite même sur un écran large,
          voir WorldHomeGridView.tsx. */}
      <ul className="grid gap-x-2 @sm:grid-cols-2">
        {visibleRooms.map((room) => {
          const href = `/c/${room.id}`;
          const unread = roomUnread[room.id] ?? room.unread_count ?? 0;
          const label = room.title || room.name || "Sans titre";
          const subtitle = relativeTime(room.last_message_at);
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
                className="group flex items-center gap-3.5 rounded-md px-3 py-3 hover:bg-hoverCard transition-colors"
              >
                <span className="relative shrink-0 size-9">
                  <span
                    className={cn(
                      "absolute left-0 top-0 flex size-6 items-center justify-center overflow-hidden rounded-full ring-2 ring-background",
                      !room.icon_url && "bg-card-400",
                    )}
                  >
                    {room.icon_url ? (
                      <Image
                        src={room.icon_url}
                        alt=""
                        fill
                        sizes="24px"
                        className="object-cover"
                      />
                    ) : (
                      <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                  {room.last_poster_avatar_url && (
                    <Avatar className="absolute bottom-0 right-0 size-6 rounded-full ring-2 ring-background">
                      <AvatarImage src={room.last_poster_avatar_url} alt="" className="rounded-full" />
                      <AvatarFallback className="rounded-full" />
                    </Avatar>
                  )}
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
