"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronRight, MessagesSquare } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 5;

export type NavRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  last_message_excerpt?: string | null;
  unread_count: number;
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

/**
 * Breadcrumb de la chatroom : titre + chevron, badge de non-lus.
 * Le dropdown liste les conversations du monde (5 d'abord, le reste
 * chargé graduellement au scroll), avec le visuel des cartes de
 * l'accueil de monde.
 */
export function ChatroomsNavDropdown({
  worldId,
  currentChatId,
  label,
  initialRooms = [],
}: {
  worldId: string | null;
  currentChatId: string;
  label: string;
  initialRooms?: NavRoom[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { roomUnread } = useNotifications();
  const [rooms, setRooms] = useState<NavRoom[]>(initialRooms);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Rafraîchit la liste à l'ouverture, et repart sur la première page
  useEffect(() => {
    if (!open || !worldId) return;
    setVisible(PAGE_SIZE);
    (async () => {
      const { data, error } = await supabase.rpc("list_chatrooms_nav", {
        p_world_id: worldId,
      });
      if (!error && data) setRooms(data as NavRoom[]);
    })();
  }, [open, worldId, supabase]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
      setVisible((v) => Math.min(v + PAGE_SIZE, rooms.length));
    }
  }

  const otherRooms = rooms.filter((r) => r.id !== currentChatId);

  const unreadOf = (r: NavRoom) => roomUnread[r.id] ?? r.unread_count ?? 0;
  const totalUnread = otherRooms.reduce((acc, r) => acc + unreadOf(r), 0);

  if (otherRooms.length === 0) {
    return (
      <span className="truncate px-3 py-1.5 text-sm font-medium">{label}</span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-hoverCard transition-colors"
          aria-label="Conversations du monde"
        >
          <span className="truncate">{label}</span>
          {totalUnread > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-80 p-1.5">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="max-h-80 overflow-y-auto [scrollbar-width:thin]"
        >
          {otherRooms.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Aucune conversation dans ce monde.
            </p>
          )}

          {otherRooms.slice(0, visible).map((room) => {
            const unread = unreadOf(room);
            const isCurrent = room.id === currentChatId;
            const title = room.title || room.name || "Sans titre";
            const subtitle = relativeTime(room.last_message_at);
            return (
              <Link
                key={room.id}
                href={`/c/${room.id}`}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
                  isCurrent ? "bg-secondary/60" : "hover:bg-secondary",
                )}
              >
                <span className="relative shrink-0">
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center overflow-hidden rounded-full",
                      !room.icon_url && "bg-card-400",
                    )}
                  >
                    {room.icon_url ? (
                      <Image
                        src={room.icon_url}
                        alt=""
                        width={36}
                        height={36}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <MessagesSquare className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-popover" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {subtitle}
                  </span>
                </span>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}

          {visible < otherRooms.length && (
            <p className="py-2 text-center text-[11px] text-muted-foreground">
              Faites défiler pour en voir plus…
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
