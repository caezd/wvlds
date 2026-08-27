"use client";

import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { decryptMessage, generateRoomKey } from "@/lib/crypto";
import Link from "next/link";
import { BarChart3, Globe, GlobeLock, Menu, MoreVertical, Pin, Search, Settings, Star } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toggleFollowChatroom } from "@/app/(protected)/w/actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Panneaux pilotés par une prop `open` : montés en permanence mais affichés à
// la demande. En `dynamic()` (comme ChatroomStatsSheet juste en dessous), leur
// code sort du bundle initial du salon et n'est téléchargé qu'après hydratation
// — ChatroomSettingsSheet fait à lui seul 630 lignes.
const ChatroomSettingsSheet = dynamic(() => import("@/components/chatrooms/settings/ChatroomSettingsSheet"));
const ChatroomStatsSheet = dynamic(() => import("@/components/chatrooms/settings/ChatroomStatsSheet"));
import { ScrollAreaWithJumpToBottom } from "@/components/ScrollAreaWithJumpToBottom";
import { ChatroomComposer } from "@/components/chatrooms/composer/ChatroomComposer";
import ChatroomMessage from "@/components/chatrooms/message/ChatroomMessage";
import { GameBlockSurface } from "@/components/chatrooms/blocks/GameBlockShell";
import { groupMessagesForRender, computeSmsRunFlags, aggregateContentWarnings, type SmsRunFlags } from "@/lib/chatroomMessageGrouping";
import { applyRemoteVoteChange } from "@/lib/choiceVotes";
import { ContentWarningBanner } from "@/components/chatrooms/composer/ContentWarningBanner";
import { PersonaProfileSheet } from "@/components/chatrooms/persona/PersonaProfileSheet";
import { ChatroomsNavDropdown } from "@/components/chatrooms/settings/ChatroomsNavDropdown";
import { WorldMembershipGuard } from "@/components/worlds/members/WorldMembershipGuard";

/** Salon tel qu'affiché dans les listes de navigation (dropdown, aside). */
export type ChatroomNavItem = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  unread_count: number;
};

import {
  TABLE,
  RPC,
  SCROLL_THRESHOLD_PX,
  CHAT_MESSAGES_PAGE_SIZE,
  LOAD_OLDER_THRESHOLD_PX,
} from "@/lib/constants";
import type { ChatMessageWithPersona, Persona, ReactionSummary, ChallengeBadge, ActiveDailyChallenge } from "@/types/db";
import { validateChallenge } from "@/lib/validateChallenge";
import { buildActiveChallenges, type DailyChallengeRow } from "@/lib/activeChallenges";
import { useRealtimeChatSync } from "@/hooks/useRealtimeChatSync";
import { usePresenceChannel } from "@/hooks/usePresenceChannel";
import { useNotificationsActions } from "@/components/providers/NotificationsProvider";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import { useChatPins } from "@/hooks/useChatPins";
import { PinBar } from "@/components/chatrooms/message/PinBar";
import { PinsSheet } from "@/components/chatrooms/message/PinsSheet";
const SearchCenter = dynamic(() =>
  import("@/components/chatrooms/search/SearchCenter").then((m) => m.SearchCenter),
);

export type { Persona, ChatMessageWithPersona, ReactionSummary } from "@/types/db";

function ChatroomHeader({
  chat,
  chatId,
  rooms,
  rightSlot,
}: {
  chat: { title: string; worlds: { id: string; name: string; isShared: boolean; owner_id: string | null; restrict_inventory: boolean; restrict_skills: boolean; timeline_config: import("@/types/worlds").WorldTimelineConfig | null } | null } | null;
  chatId: string;
  rooms: ChatroomNavItem[];
  rightSlot?: React.ReactNode;
}) {
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");
  const world = chat?.worlds ?? null;
  const { setDrawerOpen } = useMobileSidebar();

  return (
    <header className="draggable no-draggable-children sticky top-0 p-2 touch:p-2.5 flex items-center justify-between z-20 h-header-height bg-background pointer-events-none select-none [view-transition-name:var(--vt-page-header)] *:pointer-events-auto motion-safe:transition [box-shadow:var(--sharp-edge-top-shadow-placeholder)] border-b border-border-soft">
      <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
        <div className="flex min-w-0 items-center gap-0.5">
          {/* Ouvre le menu (rail + sidebar du monde) — remplace la barre
              générique de AppShell sur les pages de chatroom (cf. AppShell.tsx). */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={tCommon("openMenu")}
            className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </button>
          {chat && (
            <>
              {/* Breadcrumbs : retour au monde / conversations */}
              <div className="flex min-w-0 items-center gap-0.5">
                {world && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={`/w/${world.id}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-hoverCard hover:text-foreground transition-colors"
                      >
                        {world.isShared
                          ? <Globe className="h-4 w-4" />
                          : <GlobeLock className="h-4 w-4" />
                        }
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8}>{t("backTo", { name: world.name })}</TooltipContent>
                  </Tooltip>
                )}
                <span className="px-0.5 text-muted-foreground/50">/</span>
                <ChatroomsNavDropdown
                  worldId={world?.id ?? null}
                  currentChatId={chatId}
                  label={chat.title}
                  initialRooms={rooms}
                />
              </div>

            </>
          )}
        </div>
        {rightSlot && (
          <div className="flex shrink-0 items-center gap-0.5">
            {rightSlot}
          </div>
        )}
      </div>
    </header>
  );
}

function isMyMessage(
  m: {
    author_id?: string | null;
    persona?: { user_id?: string | null } | null;
  },
  myId?: string | null,
) {
  if (!myId) return false;
  // Priorité au champ author_id du message; sinon on retombe sur l'user_id du persona
  return (m.author_id ?? m.persona?.user_id ?? null) === myId;
}

export default function ChatRoomView({
  chatId,
  initialChat,
  initialMessages,
  initialHasMore,
  initialPersona,
  selfId,
  canEdit,
  canWorldAdmin: _canWorldAdmin,
  canPost,
  initialChatrooms,
  chatroomKey: initialChatroomKey,
  initialIsFollowed,
  initialPersonaGroupColors,
  initialChallengeBadges,
}: {
  chatId: string;
  initialChat: {
    id: string;
    title: string;
    banner_url: string | null;
    icon_url: string | null;
    timeline_date: import("@/types/worlds").WorldTimelineDate | null;
    map_pin_id: string | null;
    category_id: string | null;
    worlds: { id: string; name: string; isShared: boolean; owner_id: string | null; restrict_inventory: boolean; restrict_skills: boolean; timeline_config: import("@/types/worlds").WorldTimelineConfig | null } | null;
  };
  initialMessages: ChatMessageWithPersona[];
  initialHasMore: boolean;
  initialPersona: Persona | null;
  selfId: string | null;
  canEdit: boolean;
  canWorldAdmin: boolean;
  canPost: boolean;
  initialChatrooms: ChatroomNavItem[];
  chatroomKey: string | null;
  initialIsFollowed: boolean;
  /** Couleurs de groupe des personas, résolues côté serveur (cf. ChatRoomContent). */
  initialPersonaGroupColors: Record<string, string>;
  /** Badges « défi remporté » des messages initiaux, résolus côté serveur. */
  initialChallengeBadges: [number, ChallengeBadge][];
}) {
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");
  const supabase = useMemo(() => createClient(), []);
  const reconnectEpoch = useReconnectEpoch();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Contexte des actions seules : ChatRoomView n'a besoin que de ces deux
  // callbacks. Via `useNotifications()`, ce composant (le plus lourd de l'app)
  // se re-rendait à chaque message reçu dans n'importe lequel de vos mondes,
  // parce que la valeur du contexte complet porte aussi les compteurs.
  const { setActiveChat, markChatRead: markChatReadCtx } = useNotificationsActions();
  const { post_message, quests } = useFeatureFlags();
  const { setActiveWorldId } = useMobileSidebar();

  const [isFollowed, setIsFollowed] = useState(initialIsFollowed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  async function handleToggleFollow() {
    const next = !isFollowed;
    setIsFollowed(next);
    await toggleFollowChatroom(chatId, next);
    router.refresh();
  }

  // Clé de chiffrement AES-256-GCM pour ce chatroom
  const [roomKey, setRoomKey] = useState<string | null>(initialChatroomKey);
  const roomKeyRef = useRef<string | null>(initialChatroomKey);

  const [chat, setChat] = useState(initialChat);
  const [messages, setMessages] = useState(initialMessages);
  const [challengeBadges, setChallengeBadges] = useState<Map<number, ChallengeBadge>>(
    () => new Map(initialChallengeBadges),
  );
  const [activeChallenges, setActiveChallenges] = useState<ActiveDailyChallenge[]>([]);
  const wonChallengeIdsRef = useRef(new Set<string>());

  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
    initialPersona,
  );
  const [openPersona, setOpenPersona] = useState<Persona | null>(null);
  const [editMessageId, setEditMessageId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(selfId);

  // Couleur de groupe par persona_id (monde du chatroom)
  // Statiques pour la durée de la page : plus aucun code ne les met à jour
  // depuis que le serveur les fournit — un état n'aurait plus de raison d'être.
  const personaGroupColors = useMemo(
    () => new Map(Object.entries(initialPersonaGroupColors)),
    [initialPersonaGroupColors],
  );

  // Signale le monde du chatroom courant pour le surlignage actif de
  // WorldsRail (le pathname `/c/[id]` seul ne le révèle pas).
  useEffect(() => {
    setActiveWorldId(chat.worlds?.id ?? null);
    return () => setActiveWorldId(null);
  }, [chat.worlds?.id, setActiveWorldId]);

  // Les couleurs de groupe arrivent en props (résolues côté serveur) : plus
  // d'aller-retour réseau après l'hydratation pour cette donnée.

  /* challenge badges — charge + met à jour en Realtime */
  const loadChallengeBadges = useCallback(async (ids: number[]) => {
    if (!ids.length) return;
    type Row = { message_id: number; challenge: { title: string; description: string | null } | null };
    const { data } = await supabase
      .from(TABLE.CHALLENGE_ATTEMPTS)
      .select("message_id, challenge:challenge_id(title, description)")
      .in("message_id", ids)
      .eq("status", "won");
    if (!data) return;
    setChallengeBadges((prev) => {
      const next = new Map(prev);
      for (const row of data as Row[]) {
        if (row.challenge) next.set(Number(row.message_id), row.challenge);
      }
      return next;
    });
  }, [supabase]);

  useEffect(() => {
    // Les badges des messages initiaux viennent des props ; `loadChallengeBadges`
    // ne sert plus qu'au Realtime ci-dessous et aux pages d'historique.

    const sub = supabase
      .channel(`challenge-badges-${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLE.CHALLENGE_ATTEMPTS, filter: `chat_id=eq.${chatId}` },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { message_id: number; challenge_id: string; status: string };
          if (row.status !== "won") return;
          void (async () => {
            const { data } = await supabase
              .from(TABLE.CHALLENGES)
              .select("title, description")
              .eq("id", row.challenge_id)
              .single();
            if (data) setChallengeBadges((prev) => new Map(prev).set(Number(row.message_id), data));
          })();
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(sub); };
  }, [chatId, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  /* défis actifs du jour — chargés une fois à l'ouverture du chatroom */
  useEffect(() => {
    if (!quests || !userId) return;
    const today = new Date().toISOString().split("T")[0];
    void (async () => {
      // Une seule requête : les tentatives gagnées de l'utilisateur sont
      // embarquées (le filtre user_id est indispensable — depuis la policy
      // « read won », les victoires des autres joueurs sont visibles).
      const { data: rows } = await supabase
        .from(TABLE.CHALLENGES)
        .select(
          "id, title, description, validation, reward_coins, reward_xp, min_word_count, source, active_date, challenge_attempts(challenge_id)",
        )
        .eq("active_date", today)
        .is("world_id", null)
        .eq("challenge_attempts.status", "won")
        .eq("challenge_attempts.user_id", userId);
      if (!rows?.length) return;

      const { challenges, wonIds } = buildActiveChallenges(rows as DailyChallengeRow[]);
      wonChallengeIdsRef.current = wonIds;
      setActiveChallenges(challenges);
    })();
  }, [quests, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMessageSent = useCallback(
    async (messageId: number, chatId: string, plainText: string) => {
      const pending = activeChallenges.filter((c) => !wonChallengeIdsRef.current.has(c.id));
      if (!pending.length) return;
      for (const challenge of pending) {
        if (validateChallenge(plainText, challenge.validation, challenge.min_word_count)) {
          type ClaimResult = { ok: boolean; coins?: number; xp?: number; error?: string };
          const { data } = await supabase.rpc(RPC.CLAIM_CHALLENGE_ATTEMPT, {
            p_challenge_id: challenge.id,
            p_message_id: messageId,
            p_chat_id: chatId,
          });
          const result = data as ClaimResult | null;
          if (result?.ok) {
            wonChallengeIdsRef.current = new Set([...wonChallengeIdsRef.current, challenge.id]);
            setActiveChallenges((prev) =>
              prev.map((c) => (c.id === challenge.id ? { ...c, already_won: true } : c)),
            );
            setChallengeBadges((prev) =>
              new Map(prev).set(messageId, { title: challenge.title, description: challenge.description ?? null }),
            );
            toast.success(`Défi relevé ! +${result.coins ?? 0} coins`, {
              description: challenge.title,
            });
          }
        }
      }
    },
    [activeChallenges, supabase],
  );

  /* pagination : historique chargé à la demande en remontant */
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const hasMoreRef = useRef(initialHasMore);
  // Ajustement de scroll à appliquer après prépend (préserve la position visuelle)
  const scrollAdjustRef = useRef<{ prevHeight: number; prevTop: number } | null>(
    null,
  );

  /* mark as read — mutualisé dans NotificationsProvider (throttle + badge inclus) */
  const markChatRead = useCallback(
    (ts?: string) => markChatReadCtx(chatId, ts),
    [markChatReadCtx, chatId],
  );

  /* reactions */
  function updateReactions(
    current: ReactionSummary[] | undefined,
    emoji: string,
    delta: number,
    setMe?: boolean,
  ) {
    const arr = [...(current ?? [])];
    const idx = arr.findIndex((r) => r.emoji === emoji);

    if (idx === -1) {
      if (delta > 0) arr.push({ emoji, count: delta, me: !!setMe });
    } else {
      const nextCount = arr[idx].count + delta;
      const nextMe = typeof setMe === "boolean" ? setMe : arr[idx].me;
      if (nextCount <= 0) arr.splice(idx, 1);
      else arr[idx] = { emoji, count: nextCount, me: nextMe };
    }

    arr.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
    return arr;
  }
  /* reactions */

  useEffect(() => {
    setChat(initialChat);
    setMessages(initialMessages);
    setSelectedPersona(initialPersona);
    setHasMore(initialHasMore);
    hasMoreRef.current = initialHasMore;
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    scrollAdjustRef.current = null;
    setPinnedMessagesExtra([]);

    // Réinitialise la clé quand on change de chatroom
    roomKeyRef.current = initialChatroomKey;
    setRoomKey(initialChatroomKey);

    setActiveChat(chatId);

    const ts = initialMessages.at(-1)?.created_at;
    void markChatRead(ts);

    return () => setActiveChat(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Synchronise la ref avec l'état (utilisée dans les callbacks Realtime)
  useEffect(() => { roomKeyRef.current = roomKey; }, [roomKey]);

  // Si la chatroom n'a pas encore de clé, en génère une et l'enregistre.
  // Premier client à arriver gagne ; les suivants récupèrent la clé existante.
  useEffect(() => {
    if (roomKey) return;
    async function bootstrap() {
      const { data: existing } = await supabase
        .from(TABLE.CHATROOM_KEYS)
        .select("key_b64")
        .eq("chatroom_id", chatId)
        .maybeSingle();

      if (existing) {
        const k = (existing as unknown as { key_b64: string }).key_b64;
        roomKeyRef.current = k;
        setRoomKey(k);
        return;
      }

      const key = await generateRoomKey();
      const { error } = await supabase
        .from(TABLE.CHATROOM_KEYS)
        .insert({ chatroom_id: chatId, key_b64: key });

      if (error) {
        // Race condition : une autre session a inséré en premier
        const { data: winner } = await supabase
          .from(TABLE.CHATROOM_KEYS)
          .select("key_b64")
          .eq("chatroom_id", chatId)
          .maybeSingle();
        if (winner) {
          const k = (winner as unknown as { key_b64: string }).key_b64;
          roomKeyRef.current = k;
          setRoomKey(k);
        }
      } else {
        roomKeyRef.current = key;
        setRoomKey(key);
      }
    }
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Horodatage du dernier message, lu par les écouteurs ci-dessous sans les
  // faire dépendre de `messages` : l'effet dépendait de `messages.length`, donc
  // chaque message reçu détachait puis rattachait les deux écouteurs, juste
  // pour rafraîchir cette seule valeur.
  const lastMessageAtRef = useRef<string | undefined>(undefined);
  lastMessageAtRef.current = messages.at(-1)?.created_at;

  useEffect(() => {
    if (!userId) return;

    const mark = () => void markChatRead(lastMessageAtRef.current);
    const onVis = () => {
      if (document.visibilityState === "visible") mark();
    };

    window.addEventListener("focus", mark);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", mark);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId, markChatRead]);

  /* scroll bottom behavior */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);

  // Stables (ils ne lisent qu'une ref) : sans `useCallback`, les inclure dans
  // les dépendances des effets de scroll ci-dessous les aurait relancés à
  // chaque rendu — d'où les `eslint-disable` qui les omettaient.
  const getViewport = useCallback(() => {
    return scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
  }, []);
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const vp = getViewport();
    if (!vp) return;
    vp.scrollTo({ top: vp.scrollHeight, behavior });
  }, [getViewport]);
  /* chargement des messages plus anciens (scroll vers le haut) */
  async function loadOlderMessages() {
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const oldest = messages[0];
    if (!oldest?.created_at) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      const { data: older, error } = await supabase
        .from(TABLE.CHAT_MESSAGES)
        .select(
          "id, chat_id, content, author_id, created_at, metadata, visible_to, persona:personas(id, user_id, name, avatar_url, frame:avatar_frame_id(asset_url)), author:profiles(avatar_url, username)",
        )
        .eq("chat_id", chatId)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(CHAT_MESSAGES_PAGE_SIZE);

      if (error || !older) return;

      hasMoreRef.current = older.length === CHAT_MESSAGES_PAGE_SIZE;
      setHasMore(hasMoreRef.current);
      if (!older.length) return;

      const page = older
        .slice()
        .reverse() as unknown as ChatMessageWithPersona[];

      // Réactions des messages chargés
      const { data: rows } = await supabase
        .from(TABLE.CHAT_MESSAGE_REACTIONS)
        .select("message_id, emoji, user_id")
        .eq("chat_id", chatId)
        .in(
          "message_id",
          page.map((m) => m.id),
        );

      const byMessage = new Map<
        number,
        Map<string, { count: number; me: boolean }>
      >();
      for (const r of (rows ?? []) as Array<{ message_id: number; emoji: string; user_id: string }>) {
        const mid = Number(r.message_id);
        const emoji = String(r.emoji);
        const uid = String(r.user_id);
        if (!byMessage.has(mid)) byMessage.set(mid, new Map());
        const emMap = byMessage.get(mid)!;
        const prev = emMap.get(emoji) ?? { count: 0, me: false };
        emMap.set(emoji, {
          count: prev.count + 1,
          me: prev.me || (!!userId && uid === userId),
        });
      }

      const key = roomKeyRef.current;
      const pageWithReactions = await Promise.all(
        page.map(async (m) => {
          const emMap = byMessage.get(m.id);
          const reactions: ReactionSummary[] = emMap
            ? Array.from(emMap.entries())
              .map(([emoji, v]) => ({ emoji, count: v.count, me: v.me }))
              .sort(
                (a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji),
              )
            : [];
          const content = key
            ? await decryptMessage(m.content ?? "", key)
            : (m.content ?? "");
          return { ...m, content, reactions };
        }),
      );

      const vp = getViewport();
      if (vp) {
        scrollAdjustRef.current = {
          prevHeight: vp.scrollHeight,
          prevTop: vp.scrollTop,
        };
      }
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const fresh = pageWithReactions.filter((m) => !existing.has(m.id));
        if (fresh.length) void loadChallengeBadges(fresh.map((m) => m.id));
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  // Le listener de scroll a des deps vides : on passe par une ref pour appeler
  // la dernière version de loadOlderMessages
  const loadOlderMessagesRef = useRef(loadOlderMessages);
  loadOlderMessagesRef.current = loadOlderMessages;

  // Préserve la position de lecture après prépend des anciens messages
  useLayoutEffect(() => {
    const adjust = scrollAdjustRef.current;
    if (!adjust) return;
    scrollAdjustRef.current = null;
    const vp = getViewport();
    if (!vp) return;
    vp.scrollTop = adjust.prevTop + (vp.scrollHeight - adjust.prevHeight);
  }, [messages, getViewport]);

  // Si le contenu initial ne remplit pas la fenêtre, impossible de scroller :
  // on charge directement la page suivante
  useEffect(() => {
    const vp = getViewport();
    if (!vp || !hasMore) return;
    if (vp.scrollHeight <= vp.clientHeight) {
      void loadOlderMessagesRef.current();
    }
  }, [hasMore, messages.length, getViewport]);

  // Suivre en temps réel si l'utilisateur est près du bas,
  // et charger l'historique quand il approche du haut
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const onScroll = () => {
      nearBottomRef.current =
        vp.scrollHeight - vp.scrollTop - vp.clientHeight < SCROLL_THRESHOLD_PX;
      if (vp.scrollTop < LOAD_OLDER_THRESHOLD_PX) {
        void loadOlderMessagesRef.current();
      }
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => vp.removeEventListener("scroll", onScroll);
  }, [getViewport]);

  // Canal par chatroom : typing + partage de persona
  const { emitTyping, typingLine, clearTyping } = usePresenceChannel({
    chatId,
    persona: selectedPersona,
  });
  // Présence globale : "en ligne" = a interagi avec l'app récemment
  const { onlineUsers } = useGlobalPresence();

  // Utilisateurs ayant explicitement choisi "invisible" ou "hors ligne" (appear_offline = true)
  // → pas de pastille ; les autres absents de onlineUsers reçoivent une pastille rouge
  const [invisibleUsers, setInvisibleUsers] = useState<Set<string>>(new Set());
  // Clé stable = l'ensemble *distinct* des auteurs affichés. L'effet dépendait
  // de `messages.length`, donc chaque message reçu (y compris les siens)
  // relançait un `select profiles` sur jusqu'à 50 ids — une requête par message
  // dans un salon actif. Ici il ne repart que si un auteur nouveau apparaît.
  const authorIdsKey = useMemo(
    () => [...new Set(messages.map((m) => m.author_id).filter(Boolean) as string[])].sort().join(","),
    [messages],
  );
  useEffect(() => {
    if (!authorIdsKey) return;
    const ids = authorIdsKey.split(",");
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, appear_offline")
      .in("id", ids)
      .then(({ data }: { data: { id: string; appear_offline: boolean }[] | null }) => {
        if (cancelled || !data) return;
        setInvisibleUsers(new Set(data.filter((p) => p.appear_offline).map((p) => p.id)));
      });
    return () => { cancelled = true; };
  }, [authorIdsKey, supabase]);

  // Si l'utilisateur n'était pas présent côté serveur, on le récupère ici
  useEffect(() => {
    if (userId) return;
    supabase.auth
      .getUser()
      .then((res: { data: { user: { id: string } | null } }) => setUserId(res.data.user?.id ?? null));
  }, [supabase, userId]);

  // Scroll initial
  useEffect(() => {
    scrollToBottom("auto");
  }, [scrollToBottom]);

  // Auto-scroll uniquement quand un nouveau message arrive en bas
  // (pas sur update/réactions, ni sur prépend de l'historique)
  const lastMsgIdRef = useRef(messages.at(-1)?.id ?? null);
  useEffect(() => {
    const last = messages.at(-1) ?? null;
    const prevLastId = lastMsgIdRef.current;
    lastMsgIdRef.current = last?.id ?? null;
    if (!last || last.id === prevLastId) return; // update, suppression ou prépend
    if (nearBottomRef.current || isMyMessage(last, userId)) {
      scrollToBottom("smooth");
    }
  }, [messages, userId, scrollToBottom]);

  const { pins, pin, pinAnchor, unpin, updatePinLabel, pinByMessageId } = useChatPins(chatId);

  // Messages épinglés situés hors de la fenêtre de pagination chargée (historique
  // trop ancien) : récupérés à part pour que PinBar/PinsSheet affichent bien leur
  // contenu au lieu d'une carte vide.
  const [pinnedMessagesExtra, setPinnedMessagesExtra] = useState<ChatMessageWithPersona[]>([]);
  useEffect(() => {
    const loadedIds = new Set(messages.map((m) => m.id));
    const cachedIds = new Set(pinnedMessagesExtra.map((m) => m.id));
    const missing = [...new Set(
      pins
        .map((p) => p.message_id)
        .filter((id): id is number => id !== null && !loadedIds.has(id) && !cachedIds.has(id)),
    )];
    if (!missing.length) return;
    void (async () => {
      const { data } = await supabase
        .from(TABLE.CHAT_MESSAGES)
        .select(
          "id, chat_id, content, author_id, created_at, metadata, visible_to, persona:personas(id, user_id, name, avatar_url, frame:avatar_frame_id(asset_url)), author:profiles(avatar_url, username)",
        )
        .in("id", missing);
      if (!data) return;
      const key = roomKeyRef.current;
      const decrypted = await Promise.all(
        (data as unknown as ChatMessageWithPersona[]).map(async (m) => ({
          ...m,
          content: key ? await decryptMessage(m.content ?? "", key) : (m.content ?? ""),
        })),
      );
      setPinnedMessagesExtra((prev) => [...prev, ...decrypted]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, messages, roomKey, pinnedMessagesExtra]);

  // Messages disponibles pour l'affichage des épingles : la liste chargée
  // prévaut sur le cache (un message peut finir par charger via la pagination).
  const pinsDisplayMessages = useMemo(
    () => [...pinnedMessagesExtra, ...messages],
    [pinnedMessagesExtra, messages],
  );

  // Scroll vers un message — charge les pages précédentes si le message n'est pas encore dans le DOM
  const pendingScrollMessageIdRef = useRef<number | null>(null);
  // Borne le nombre de pages chargées à la recherche d'une cible absente
  // (id invalide/supprimé, lien ?m= périmé) — sans ça, une cible introuvable
  // paginerait tout l'historique du salon avant d'abandonner.
  const pendingScrollAttemptsRef = useRef(0);
  const MAX_SCROLL_LOAD_ATTEMPTS = 20;

  function scrollToMessage(messageId: number) {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // Message absent du DOM : on charge les pages précédentes
    pendingScrollMessageIdRef.current = messageId;
    pendingScrollAttemptsRef.current = 0;
    void loadOlderMessagesRef.current();
  }

  // Après chaque chargement de page, on réessaie si une cible est en attente
  useEffect(() => {
    const target = pendingScrollMessageIdRef.current;
    if (!target) return;
    const el = document.querySelector(`[data-message-id="${target}"]`);
    if (el) {
      pendingScrollMessageIdRef.current = null;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (hasMoreRef.current && pendingScrollAttemptsRef.current < MAX_SCROLL_LOAD_ATTEMPTS) {
      pendingScrollAttemptsRef.current += 1;
      void loadOlderMessagesRef.current();
    } else {
      pendingScrollMessageIdRef.current = null;
    }
  }, [messages]);

  // Arrivée depuis le centre de recherche (autre salon) : /c/[id]?m=<messageId>
  // `chat` n'est resynchronisé sur `chatId` que par l'effet de reset
  // ci-dessus (setChat/setMessages) — tant que `chat.id` ne correspond pas
  // encore, `messages` porte toujours l'ancien salon et scrollToMessage
  // paginerait sur son historique. On attend que le reset ait été appliqué.
  useEffect(() => {
    const raw = searchParams.get("m");
    const target = raw ? Number(raw) : null;
    if (!target || Number.isNaN(target)) return;
    if (chat?.id !== chatId) return;
    scrollToMessage(target);
    router.replace(`/c/${chatId}`, { scroll: false });
  }, [chatId, chat, searchParams, router]);

  useRealtimeChatSync({
    chatId,
    selfId: userId,
    initialLatestId: initialMessages.at(-1)?.id ?? null,
    onMessageInserted: (msg, authorId) => {
      void (async () => {
        const key = roomKeyRef.current;
        const content = key
          ? await decryptMessage(msg.content ?? "", key)
          : (msg.content ?? "");
        const decrypted = { ...msg, content };
        setMessages((prev) =>
          prev.some((m) => m.id === decrypted.id) ? prev : [...prev, { ...decrypted, reactions: [], votes: [] }],
        );
        if (authorId) clearTyping(authorId);
      })();
    },
    onMessageUpdated: (id, content, metadata) => {
      void (async () => {
        const key = roomKeyRef.current;
        const decrypted = key ? await decryptMessage(content, key) : content;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: decrypted, metadata } : m)));
      })();
    },
    onMessageDeleted: (id) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    },
    onChatroomPatched: (patch) => {
      setChat((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          title: (patch.title ?? patch.name ?? prev.title) as string,
          banner_url: patch.banner_url ?? prev.banner_url,
          icon_url: patch.icon_url ?? prev.icon_url,
        };
      });
    },
    onReactionChange: (mid, emoji, delta) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === mid
            ? { ...m, reactions: updateReactions(m.reactions, emoji, delta) }
            : m,
        ),
      );
    },
    onVoteChange: (mid, prevOptionId, nextOptionId) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === mid
            ? { ...m, votes: applyRemoteVoteChange(m.votes ?? [], prevOptionId, nextOptionId) }
            : m,
        ),
      );
    },
    onPersonaUpdated: (personaId, avatarUrl) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.persona?.id === personaId
            ? { ...m, persona: { ...m.persona, avatar_url: avatarUrl } }
            : m,
        ),
      );
    },
  });

  // Messages "SMS" consécutifs regroupés dans un même bloc visuel (cf. lib/chatroomMessageGrouping.ts).
  const renderGroups = useMemo(() => groupMessagesForRender(messages), [messages]);

  // Callbacks indépendants du message rendu — identité stable pour que le
  // `React.memo` de ChatroomMessage évite un re-render de tous les messages
  // visibles à chaque changement d'état non lié (nouveau message, présence…).
  const handleForceEditConsumed = useCallback(() => setEditMessageId(null), []);
  const handleReactionsUpdated = useCallback((mid: number, reactions: ChatMessageWithPersona["reactions"]) => {
    setMessages((prev) =>
      prev.map((x) => (x.id === mid ? { ...x, reactions } : x)),
    );
  }, []);
  const handleVotesUpdated = useCallback((mid: number, votes: ChatMessageWithPersona["votes"]) => {
    setMessages((prev) =>
      prev.map((x) => (x.id === mid ? { ...x, votes } : x)),
    );
  }, []);

  const renderMessage = (m: ChatMessageWithPersona, smsFlags?: SmsRunFlags) => (
    <ChatroomMessage
      key={m.id}
      message={m}
      online={onlineUsers}
      invisibleUsers={invisibleUsers}
      selfId={userId}
      chatroomKey={roomKey}
      personaGroupColor={personaGroupColors.get(m.persona?.id ?? "") ?? null}
      forceEdit={editMessageId === m.id}
      onForceEditConsumed={handleForceEditConsumed}
      pinId={pinByMessageId(m.id)?.id ?? null}
      onPin={userId ? (id) => pin(id, userId) : undefined}
      onUnpin={unpin}
      challengeWon={challengeBadges.get(m.id) ?? null}
      smsSharpTop={smsFlags?.sharpTop}
      smsSharpBottom={smsFlags?.sharpBottom}
      smsShowAvatar={smsFlags?.showAvatar}
      onReactionsUpdated={handleReactionsUpdated}
      onVotesUpdated={handleVotesUpdated}
      onUpdated={(id, content, metadata) => {
        setMessages((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, content, metadata } : x,
          ),
        );
      }}
      onRequestDelete={() => setPendingDeleteId(m.id)}
      onAnchorEdited={(messageId, label) => {
        const pinEntry = pinByMessageId(messageId);
        if (pinEntry) void updatePinLabel(pinEntry.id, label);
      }}
    />
  );

  return (
    <div className="composer-parent flex flex-row focus-visible:outline-0 h-full min-w-0 flex-1 gap-3">
      <WorldMembershipGuard
        worldId={chat?.worlds?.id ?? null}
        selfId={userId ?? selfId}
      />
      <div className="flex flex-col focus-visible:outline-0 flex-1 h-full min-w-0 lg:bg-background overflow-hidden">
        <ChatroomHeader
          chat={chat}
          chatId={chatId}
          rooms={initialChatrooms}
          rightSlot={
            <>
              {/* Desktop : icônes individuelles */}
              <div className="hidden lg:flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      aria-label={t("search.title")}
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={8}>{t("search.title")}</TooltipContent>
                </Tooltip>
                {userId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => void handleToggleFollow()}
                        aria-label={isFollowed ? t("unfollow") : t("follow")}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-hoverCard",
                          isFollowed ? "text-yellow-500" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Star size={15} className={isFollowed ? "fill-current" : ""} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8}>
                      {isFollowed ? t("unfollow") : t("follow")}
                    </TooltipContent>
                  </Tooltip>
                )}
                {canEdit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        aria-label={tCommon("settings")}
                        className="flex h-9 w-9 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8}>{tCommon("settings")}</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setStatsOpen(true)}
                      aria-label={t("statsTitle")}
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={8}>{t("statsTitle")}</TooltipContent>
                </Tooltip>
              </div>

              {/* Mobile : menu "…" (mêmes options, regroupées) */}
              <div className="flex lg:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("actions")}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSearchOpen(true)}>
                      <Search className="mr-2 h-3.5 w-3.5" />
                      {t("search.title")}
                    </DropdownMenuItem>
                    {userId && (
                      <DropdownMenuItem onClick={() => void handleToggleFollow()}>
                        <Star className={cn("mr-2 h-3.5 w-3.5", isFollowed && "fill-current text-yellow-500")} />
                        {isFollowed ? t("unfollow") : t("follow")}
                      </DropdownMenuItem>
                    )}
                    {canEdit && (
                      <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                        <Settings className="mr-2 h-3.5 w-3.5" />
                        {tCommon("settings")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setStatsOpen(true)}>
                      <BarChart3 className="mr-2 h-3.5 w-3.5" />
                      {t("statsTitle")}
                    </DropdownMenuItem>
                    {pins.length > 0 && (
                      <DropdownMenuItem onClick={() => setPinsOpen(true)}>
                        <Pin className="mr-2 h-3.5 w-3.5" />
                        {t("pinsTitle")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <ChatroomSettingsSheet
                canEdit={canEdit}
                chatroom={{
                  id: chat.id,
                  title: chat.title,
                  banner_url: chat.banner_url ?? null,
                  icon_url: chat.icon_url ?? null,
                  timeline_date: chat.timeline_date ?? null,
                  map_pin_id: chat.map_pin_id ?? null,
                  category_id: chat.category_id ?? null,
                }}
                worldTimelineConfig={chat.worlds?.timeline_config ?? null}
                worldId={chat.worlds?.id ?? null}
                hideTrigger
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
              />
              <ChatroomStatsSheet chatId={chatId} hideTrigger open={statsOpen} onOpenChange={setStatsOpen} />
              <PinsSheet
                open={pinsOpen}
                onOpenChange={setPinsOpen}
                pins={pins}
                messages={pinsDisplayMessages}
                onScrollToMessage={scrollToMessage}
              />
              {chat?.worlds?.id && (
                <SearchCenter
                  worldId={chat.worlds.id}
                  initialChatId={chatId}
                  open={searchOpen}
                  onOpenChange={setSearchOpen}
                />
              )}
            </>
          }
        />
        <section className="relative basis-auto flex-col -mb-(--composer-overlap-px) [--composer-overlap-px:64px] [--jump-btn-bottom:calc(var(--composer-overlap-px)+24px)] grow flex overflow-hidden">
          <div className="relative h-full">
            <PinBar pins={pins} messages={pinsDisplayMessages} onScrollToMessage={scrollToMessage} />
            <ScrollAreaWithJumpToBottom
              ref={scrollRef}
              className="flex h-full flex-col overflow-y-auto thread-xl:pt-(--header-height)"
            >
              <div className="flex flex-col text-sm thread-xl:pt-header-height pb-25 divide-y divide-border-soft [--thread-content-max-width:40rem] lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 px-2 lg:px-4">
                {loadingOlder && (
                  <div className="py-3 text-center text-xs text-muted-foreground">
                    Chargement de l’historique…
                  </div>
                )}
                {renderGroups.map((g) =>
                  g.kind === "sms" ? (
                    <div key={`sms-${g.messages[0].id}`} className="py-8">
                      <ContentWarningBanner tags={aggregateContentWarnings(g.messages)} />
                      <GameBlockSurface className="flex flex-col gap-1.5">
                        {computeSmsRunFlags(g.messages).map((flags, i) => renderMessage(g.messages[i], flags))}
                      </GameBlockSurface>
                    </div>
                  ) : (
                    renderMessage(g.message)
                  ),
                )}
              </div>
            </ScrollAreaWithJumpToBottom>
          </div>
        </section>
        <div className="group/thread-bottom-container relative isolate z-10 w-full basis-auto has-data-has-thread-error:pt-2 md:pt-0 print:hidden before:pointer-events-none before:absolute before:inset-x-0 before:bottom-1/2 max-lg:before:bottom-0 before:-top-10 before:-z-10 before:bg-linear-to-t lg:before:from-background lg:before:from-50% lg:before:to-transparent before:from-body before:from-50% before:to-transparent">
          <div className="text-base mx-auto [--thread-content-margin:--spacing(4)] thread-sm:[--thread-content-margin:--spacing(6)] thread-lg:[--thread-content-margin:--spacing(16)]">
            <div className="thread-lg:[--thread-content-max-width:48rem] mx-auto flex-1 p-3 pt-0 lg:p-10 lg:pt-0">
              <div className="pointer-events-auto relative z-1 flex h-[var(--composer-container-height,100%)] max-w-full flex-[var(--composer-container-flex,1)] flex-col">
                {post_message && canPost && <ChatroomComposer
                  chatId={chatId}
                  worldId={chat?.worlds?.id ?? null}
                  presetPersona={selectedPersona}
                  onTyping={emitTyping}
                  onPersonaChange={setSelectedPersona}
                  chatroomKey={roomKey}
                  typingLine={typingLine}
                  onEditLastMessage={() => {
                    const last = [...messages].reverse().find((m) => isMyMessage(m, userId));
                    if (last) setEditMessageId(last.id);
                  }}
                  onAnchorSent={(messageId, label) => {
                    if (userId) void pinAnchor(messageId, label, userId);
                  }}
                  onMessageSent={quests ? (mid, cid, text) => void handleMessageSent(mid, cid, text) : undefined}
                />}
              </div>
            </div>
          </div>
        </div>
        <PersonaProfileSheet
          persona={openPersona}
          selfId={selfId}
          onClose={() => setOpenPersona(null)}
          onUsePersona={(p) => setSelectedPersona(p)}
        />
      </div>

      <DeleteConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        description="Ce message sera supprimé définitivement."
        onConfirm={async () => {
          if (pendingDeleteId === null) return;
          const id = pendingDeleteId;
          const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", id);
          if (error) toast.error("Impossible de supprimer le message : " + error.message);
          else {
            const remaining = messages.filter((x) => x.id !== id);
            setMessages(remaining);
            const pinEntry = pinByMessageId(id);
            if (pinEntry) void unpin(pinEntry.id);
          }
          setPendingDeleteId(null);
        }}
      />
    </div>
  );
}
