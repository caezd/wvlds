import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import Link from "next/link";
import { BookOpenText, Globe, GlobeLock, MessageSquare, Network, Users } from "lucide-react";
import { supabaseThumb } from "@/lib/storage";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getTranslations } from "next-intl/server";

type Room = {
  id: string;
  name: string | null;
  title: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  has_unread: boolean;
};

type WorldItem = {
  id: string;
  name: string;
  icon_url: string | null;
  chatrooms: Room[];
  isOwner: boolean;
};

function compactTime(iso: string | null): string {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "< 1min";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

export default async function HomeWorldsSidebar() {
  const t = await getTranslations("home");
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) return null;

  const { data: worldRows } = await supabase
    .from("worlds")
    .select("id, name, icon_url, owner_id")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("name", { ascending: true });

  const worlds = (worldRows ?? []) as { id: string; name: string; icon_url: string | null; owner_id: string }[];

  // Chatrooms récentes (participées) pour chaque monde
  const worldsWithRooms: WorldItem[] = await Promise.all(
    worlds.map(async (w) => {
      const { data: rooms } = await supabase.rpc("list_participated_chatrooms", {
        p_world_id: w.id,
        p_limit: 3,
      });
      return {
        id: w.id,
        name: w.name,
        icon_url: w.icon_url,
        chatrooms: (rooms as Room[] | null) ?? [],
        isOwner: w.owner_id === userId,
      };
    }),
  );

  if (worldsWithRooms.length === 0) return null;

  return (
    <aside className="hidden lg:flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-border-soft">
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("sidebarTitle")}
        </span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {worldsWithRooms.map((w) => (
            <div key={w.id}>
              {/* En-tête monde */}
              <Link
                href={`/w/${w.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted group"
              >
                {w.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={supabaseThumb(w.icon_url, 28) ?? w.icon_url}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted-foreground/20 text-[9px] font-bold">
                    {w.name[0].toUpperCase()}
                  </span>
                )}
                <span className="truncate text-sm font-medium text-foreground">
                  {w.name}
                </span>
                {w.isOwner ? (
                  <GlobeLock size={11} className="ml-auto shrink-0 text-muted-foreground/50" />
                ) : (
                  <Globe size={11} className="ml-auto shrink-0 text-muted-foreground/50" />
                )}
              </Link>

              {/* Liens rapides */}
              <div className="ml-3 flex gap-1 px-2 py-0.5">
                <Link
                  href={`/w/${w.id}?view=members`}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Users size={10} />
                  {t("sidebarMembers")}
                </Link>
                <Link
                  href={`/w/${w.id}?view=wiki`}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <BookOpenText size={10} />
                  {t("sidebarWiki")}
                </Link>
                <Link
                  href={`/w/${w.id}?view=canvas`}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Network size={10} />
                  {t("sidebarRelations")}
                </Link>
              </div>

              {/* Chatrooms récentes */}
              {w.chatrooms.length > 0 && (
                <div className="ml-3 space-y-0.5 px-1 pb-1">
                  {w.chatrooms.map((room) => {
                    const label = (room.title ?? room.name ?? "Chatroom").trim();
                    return (
                      <Link
                        key={room.id}
                        href={`/c/${room.id}`}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {room.has_unread ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        ) : (
                          <MessageSquare size={10} className="shrink-0 opacity-40" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {room.last_message_at && (
                          <span className="shrink-0 text-[10px] opacity-50">
                            {compactTime(room.last_message_at)}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
