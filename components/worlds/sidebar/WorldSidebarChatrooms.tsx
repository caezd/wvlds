"use client";

import { useEffect, useState } from "react";
import { ChatroomLink } from "@/components/chatrooms/ChatroomLink";
import { usePathname } from "next/navigation";
import { useResetOnKeyChange } from "@/hooks/useResetOnKeyChange";
import { useParticipatedRoomIds, useWorldRooms, type WorldRoom } from "@/lib/worldRoomsStore";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PRESENCE_BG } from "@/components/avatars/PresenceDot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SectionLabel } from "@/components/ui/section-label";
import { CountPip } from "@/components/ui/count-pip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, ChevronRight, ChevronDown, ArrowLeft, MessagesSquare, Hash, ListOrdered } from "lucide-react";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useTranslations } from "next-intl";
import { CategoryAvatar } from "@/components/worlds/catalogue/CategoryAvatar";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { compactTime } from "@/lib/notifHelpers";

// Forme partagée avec le store : une seule définition pour les deux.
type Room = WorldRoom;

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
  icon_url: string | null;
  position: number;
};

type SectionId = "yourTurn" | "active" | "followed" | "all";

// Sections repliées de la liste des salons : une préférence de lecture,
// propre à l'appareil et commune à tous les mondes (cf. lib/catalogueCollapse.ts).
const COLLAPSED_KEY = "sidebar-collapsed-sections";

function loadCollapsedSections(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedSections(ids: Set<string>): void {
  try {
    if (ids.size === 0) localStorage.removeItem(COLLAPSED_KEY);
    else localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore (mode privé, quota…)
  }
}

/** Une section de la liste, repliable par son intitulé. */
function SidebarSection({
  label,
  icon,
  collapsed,
  onToggle,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="group/section mb-1 flex w-full items-center rounded px-2 text-left hover:text-foreground"
      >
        <SectionLabel as="span" className="flex flex-1 items-center gap-1 group-hover/section:text-foreground">
          {icon} {label}
        </SectionLabel>
        <ChevronDown
          size={12}
          aria-hidden
          className={cn("shrink-0 text-muted-foreground opacity-0 transition group-hover/section:opacity-100 group-focus-visible/section:opacity-100", collapsed && "-rotate-90 opacity-100")}
        />
      </button>
      {!collapsed && children}
    </section>
  );
}

function RoomItem({
  room,
  isActive,
  unread,
  categoryName,
  turnWait,
}: {
  room: Room | ParticipatedRoom;
  isActive: boolean;
  unread: number;
  categoryName?: string;
  /** C'est votre tour ici (ordre de passage) : depuis combien de temps. */
  turnWait?: string;
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
  // Le liseré qui détache les avatars superposés prend la couleur du fond de
  // la ligne : celui de la barre, ou celui du survol et du salon ouvert.
  const ringBg = isActive ? "ring-muted" : "ring-background group-hover:ring-muted";
  const borderBg = isActive ? "border-muted" : "border-background group-hover:border-muted";

  return (
    <ChatroomLink
      href={`/c/${room.id}`}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        "hover:bg-muted min-w-0",
        isActive ? "bg-muted" : "",
      )}
    >
      {showOverlay && !showCount ? (
        /* 2 avatars, même taille, superposition diagonale */
        <div className="relative shrink-0 size-9">
          <Avatar className={cn("absolute top-0 left-0 size-6 rounded-full ring-3 z-0 transition-colors", ringBg)}>
            {secondAvatar && <AvatarImage src={secondAvatar} className="rounded-full" />}
            <AvatarFallback className="rounded-full text-xs-plus bg-muted-foreground/20" />
          </Avatar>
          <Avatar className={cn("absolute bottom-0 right-0 size-6 rounded-full ring-3 z-10 transition-colors", ringBg)}>
            {posterAvatar && <AvatarImage src={posterAvatar} className="rounded-full" />}
            <AvatarFallback className="rounded-full text-xs-plus bg-muted-foreground/20">
              {label[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      ) : (
        /* 1 avatar seul ou avatar + badge +N */
        <div className="relative shrink-0 size-9">
          <Avatar className="size-9 rounded-full">
            {posterAvatar && <AvatarImage src={posterAvatar} className="rounded-full" />}
            <AvatarFallback className="rounded-full text-xs-plus bg-muted-foreground/20">
              {label[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {showCount && (
            <span className={cn(
              "absolute -bottom-0.5 -right-1.5 h-[18px] min-w-[18px] flex items-center justify-center rounded-full bg-muted border-2 text-2xs font-bold text-muted-foreground px-0.5 z-10 transition-colors",
              borderBg,
            )}>
              +{participantCount}
            </span>
          )}
          {presence && (
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 z-10 transition-colors",
              borderBg,
              PRESENCE_BG[presence],
            )} />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "truncate leading-tight text-sm",
          hasUnread || isActive || turnWait ? "font-semibold text-foreground" : "text-foreground",
        )}>
          {label}
        </p>
        {categoryName && (
          <p className="flex items-center gap-1 text-2xs text-muted-foreground leading-tight">
            <MessagesSquare size={9} className="shrink-0 opacity-70" />
            <span className="truncate">{categoryName}</span>
          </p>
        )}
      </div>
      {turnWait && (
        <span className="shrink-0 text-2xs tabular-nums text-foreground">{turnWait}</span>
      )}
      <CountPip count={unread} className="shrink-0" />
    </ChatroomLink>
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
  const tNotif = useTranslations("notifications");
  const { userId } = useCurrentUser();
  const { roomUnread } = useNotifications();
  const pathname = usePathname();
  // Liste partagée : les deux instances de ce composant (aside desktop et
  // tiroir mobile) lisent le même store, qui n'ouvre qu'un seul canal
  // Realtime pour les deux. Cf. lib/worldRoomsStore.
  const allRooms = useWorldRooms(worldId, initialAll);
  // Salons créés depuis le chargement : la liste du serveur n'est pas relue.
  const createdHere = useParticipatedRoomIds(worldId);

  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => { setCollapsed(loadCollapsedSections()); }, []);
  const toggleSection = (id: SectionId) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    saveCollapsedSections(next);
  };

  // Passer d'un monde à l'autre ne remonte pas ce composant : sans ce
  // resemis, la liste affichée reste celle du monde quitté, les props du
  // nouveau monde étant purement ignorés. Cf. useResetOnKeyChange.
  useResetOnKeyChange(worldId, () => {
    // `allRooms` est resemé par le store lui-même ; seule la vue
    // « catégorie » ouverte est un état propre à cette instance.
    setSelectedCat(null);
  });

  const activeChatroomId = pathname?.startsWith("/c/")
    ? pathname.split("/c/")[1]?.split("/")[0]
    : undefined;

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // IDs stables des rooms participées (filtre pour ACTIF)
  const participatedIds = new Set(initialParticipated.map((p) => p.id));
  const followedSet = new Set(initialFollowedIds);

  // À VOUS DE JOUER : salons où c'est votre tour (migration 280), celui qui
  // attend depuis le plus longtemps en tête. Ils ne se répètent pas plus bas.
  const aVous = userId
    ? allRooms
      .filter((r) => r.turn_user_id === userId)
      .sort((a, b) => (a.turn_started_at ?? "").localeCompare(b.turn_started_at ?? ""))
    : [];
  const aVousIds = new Set(aVous.map((r) => r.id));

  // ACTIF: top 5 rooms participées, triées par last_message_at (allRooms est déjà trié)
  const actif = allRooms
    .filter((r) => !aVousIds.has(r.id) && (participatedIds.has(r.id) || createdHere.has(r.id)))
    .slice(0, 5);

  // SUIVI: rooms suivies, triées par last_message_at
  const suivi = allRooms.filter((r) => !aVousIds.has(r.id) && followedSet.has(r.id));

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


  // Vue catégorie (drill-down)
  if (selectedCat) {
    const catRooms =
      selectedCat.id === "__uncategorized__"
        ? uncategorized
        : byCategory.get(selectedCat.id) ?? [];
    return (
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedCat(null)}
            className="mb-2 w-full justify-start px-2 text-xs"
          >
            <ArrowLeft size={12} />
            {t("sidebar.back")}
          </Button>
          <p className="px-2 mb-2 text-sm font-semibold text-foreground truncate">
            {selectedCat.title}
          </p>
          {catRooms.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
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
    <ScrollArea className="flex-1 min-h-0 min-w-0">
      <div className="p-2 space-y-4 min-w-0">

        {/* À VOUS DE JOUER */}
        {aVous.length > 0 && (
          <SidebarSection label={t("sidebar.yourTurn")} icon={<ListOrdered size={12} />} collapsed={collapsed.has("yourTurn")} onToggle={() => toggleSection("yourTurn")}>
            <div className="space-y-0.5 min-w-0">
              {aVous.map((room) => (
                <RoomItem
                  key={room.id}
                  room={room}
                  isActive={room.id === activeChatroomId}
                  unread={roomUnread[room.id] ?? 0}
                  categoryName={room.category_id ? categoryById.get(room.category_id)?.title : undefined}
                  turnWait={room.turn_started_at ? compactTime(room.turn_started_at, tNotif("text.dayAbbr")) : ""}
                />
              ))}
            </div>
          </SidebarSection>
        )}

        {/* ACTIF */}
        {actif.length > 0 && (
          <SidebarSection label={t("sidebar.active")} icon={<Hash size={12} />} collapsed={collapsed.has("active")} onToggle={() => toggleSection("active")}>
            <div className="space-y-0.5 min-w-0">
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
          </SidebarSection>
        )}

        {/* SUIVI */}
        {suivi.length > 0 && (
          <SidebarSection label={t("sidebar.followed")} icon={<Star size={12} />} collapsed={collapsed.has("followed")} onToggle={() => toggleSection("followed")}>
            <div className="space-y-0.5 min-w-0">
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
          </SidebarSection>
        )}

        {/* TOUS — cartes catégories uniquement */}
        <SidebarSection label={t("sidebar.all")} collapsed={collapsed.has("all")} onToggle={() => toggleSection("all")}>
          <div className="space-y-1">
            {categories.map((cat) => {
              const rooms = byCategory.get(cat.id) ?? [];
              const hasUnread = rooms.some((r) => (roomUnread[r.id] ?? 0) > 0);
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat)}
                  className="flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 hover:bg-muted transition-colors text-left group"
                >
                  <CategoryAvatar
                    title={cat.title}
                    bannerUrl={cat.banner_url}
                    iconUrl={cat.icon_url}
                    className="h-9 w-9 rounded-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground leading-tight">
                      {cat.title}
                    </p>
                    <p className="text-2xs text-muted-foreground leading-tight">
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
                onClick={() => setSelectedCat({ id: "__uncategorized__", title: t("sidebar.general"), banner_url: null, icon_url: null, position: 9999 })}
                className="flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 hover:bg-muted transition-colors text-left group"
              >
                <div className="h-9 w-9 shrink-0 rounded-lg bg-muted-foreground/10 flex items-center justify-center">
                  <span className="text-xs-plus font-medium text-muted-foreground">G</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground leading-tight">{t("sidebar.general")}</p>
                  <p className="text-2xs text-muted-foreground leading-tight">
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
              <p className="px-2 py-1 text-xs text-muted-foreground">{t("sidebar.noChatrooms")}</p>
            )}
          </div>
        </SidebarSection>

      </div>
    </ScrollArea>
  );
}
