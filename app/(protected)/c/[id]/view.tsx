"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { decryptMessage, generateRoomKey } from "@/lib/crypto";
import Link from "next/link";
import { Globe, GlobeLock } from "lucide-react";

import ChatroomSettingsSheet from "@/components/chatrooms/ChatroomSettingsSheet";
import ChatroomStatsSheet from "@/components/chatrooms/ChatroomStatsSheet";
import { WorldMembersSheet } from "@/components/worlds/WorldMembersSheet";
import { ScrollAreaWithJumpToBottom } from "@/components/ScrollAreaWithJumpToBottom";
import { ChatroomComposer } from "@/components/chatrooms/ChatroomComposer";
import ChatroomMessage from "@/components/chatrooms/ChatroomMessage";
import { PersonaProfileSheet } from "@/components/chatrooms/PersonaProfileSheet";
import { ChatroomsNavDropdown } from "@/components/chatrooms/ChatroomsNavDropdown";
import { WorldMembershipGuard } from "@/components/worlds/WorldMembershipGuard";
import { type ChatroomNavItem } from "@/components/worlds/WorldChatroomsAside";

import {
  TABLE,
  DELAY,
  SCROLL_THRESHOLD_PX,
  CHAT_MESSAGES_PAGE_SIZE,
  LOAD_OLDER_THRESHOLD_PX,
} from "@/lib/constants";
import type { ChatMessageWithPersona, Persona, ReactionSummary } from "@/types/db";
import { useRealtimeChatSync } from "@/hooks/useRealtimeChatSync";
import { usePresenceChannel } from "@/hooks/usePresenceChannel";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";

export type { Persona, ChatMessageWithPersona, ReactionSummary } from "@/types/db";
export type { ChatroomNavItem } from "@/components/worlds/WorldChatroomsAside";

function ChatroomHeader({
  chat,
  chatId,
  rooms,
}: {
  chat: { title: string; worlds: { id: string; name: string; isShared: boolean; owner_id: string | null } | null } | null;
  chatId: string;
  rooms: ChatroomNavItem[];
}) {
  const world = chat?.worlds ?? null;

  return (
    <header className="draggable no-draggable-children sticky top-0 p-2 touch:p-2.5 flex items-center justify-between z-20 h-header-height bg-background pointer-events-none select-none [view-transition-name:var(--vt-page-header)] *:pointer-events-auto motion-safe:transition max-md:hidden [box-shadow:var(--sharp-edge-top-shadow-placeholder)] border-b border-border-soft">
      <div className="flex flex-1 items-center justify-between">
        {chat && (
          <>
            {/* Breadcrumbs : retour au monde / conversations */}
            <div className="flex min-w-0 items-center gap-0.5 px-1">
              {world && (
                <Link
                  href={`/w/${world.id}`}
                  title={`Revenir à ${world.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  {world.isShared
                    ? <Globe className="h-4 w-4" />
                    : <GlobeLock className="h-4 w-4" />
                  }
                </Link>
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
  canWorldAdmin,
  initialChatrooms,
  chatroomKey: initialChatroomKey,
}: {
  chatId: string;
  initialChat: {
    id: string;
    title: string;
    banner_url: string | null;
    icon_url: string | null;
    worlds: { id: string; name: string; isShared: boolean; owner_id: string | null } | null;
  };
  initialMessages: ChatMessageWithPersona[];
  initialHasMore: boolean;
  initialPersona: Persona | null;
  selfId: string | null;
  canEdit: boolean;
  canWorldAdmin: boolean;
  initialChatrooms: ChatroomNavItem[];
  chatroomKey: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { setActiveChat } = useNotifications();
  const { post_message } = useFeatureFlags();

  // Clé de chiffrement AES-256-GCM pour ce chatroom
  const [roomKey, setRoomKey] = useState<string | null>(initialChatroomKey);
  const roomKeyRef = useRef<string | null>(initialChatroomKey);

  const [chat, setChat] = useState(initialChat);
  const [messages, setMessages] = useState(initialMessages);

  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
    initialPersona,
  );
  const [openPersona, setOpenPersona] = useState<Persona | null>(null);
  const [editMessageId, setEditMessageId] = useState<number | null>(null);

  const [userId, setUserId] = useState<string | null>(selfId);

  /* pagination : historique chargé à la demande en remontant */
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const hasMoreRef = useRef(initialHasMore);
  // Ajustement de scroll à appliquer après prépend (préserve la position visuelle)
  const scrollAdjustRef = useRef<{ prevHeight: number; prevTop: number } | null>(
    null,
  );

  /* mark as read */
  const lastMarkReadRef = useRef<number>(0);
  async function markChatRead(ts?: string) {
    if (!userId) return;

    const now = Date.now();
    if (now - lastMarkReadRef.current < DELAY.MARK_READ_THROTTLE) return;
    lastMarkReadRef.current = now;

    const lastReadAt = ts ?? new Date().toISOString();

    const { error } = await supabase.from(TABLE.CHATROOM_READS).upsert(
      {
        chat_id: chatId,
        user_id: userId,
        last_read_at: lastReadAt,
      },
      { onConflict: "chat_id,user_id" },
    );

    if (error) console.error("markChatRead error:", error);
  }

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

  useEffect(() => {
    if (!userId) return;

    const onFocus = () => void markChatRead(messages.at(-1)?.created_at);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void markChatRead(messages.at(-1)?.created_at);
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId, chatId, messages.length]);

  /* scroll bottom behavior */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);

  function getViewport() {
    return scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
  }
  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const vp = getViewport();
    if (!vp) return;
    vp.scrollTo({ top: vp.scrollHeight, behavior });
  }
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
          "id, chat_id, content, author_id, created_at, persona:personas(id, user_id, name, avatar_url, frame:avatar_frame_id(asset_url))",
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
  }, [messages]);

  // Si le contenu initial ne remplit pas la fenêtre, impossible de scroller :
  // on charge directement la page suivante
  useEffect(() => {
    const vp = getViewport();
    if (!vp || !hasMore) return;
    if (vp.scrollHeight <= vp.clientHeight) {
      void loadOlderMessagesRef.current();
    }
  }, [hasMore, messages.length]);

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
     
  }, []);

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
  useEffect(() => {
    const ids = [...new Set(messages.map((m) => m.author_id).filter(Boolean))] as string[];
    if (ids.length === 0) return;
    supabase
      .from("profiles")
      .select("id, appear_offline")
      .in("id", ids)
      .then(({ data }: { data: { id: string; appear_offline: boolean }[] | null }) => {
        if (!data) return;
        setInvisibleUsers(new Set(data.filter((p) => p.appear_offline).map((p) => p.id)));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

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
  }, []);

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
  }, [messages, userId]);

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
          prev.some((m) => m.id === decrypted.id) ? prev : [...prev, { ...decrypted, reactions: [] }],
        );
        if (authorId) clearTyping(authorId);
      })();
    },
    onMessageUpdated: (id, content) => {
      void (async () => {
        const key = roomKeyRef.current;
        const decrypted = key ? await decryptMessage(content, key) : content;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: decrypted } : m)));
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
  });

  return (
    <div className="composer-parent flex flex-row focus-visible:outline-0 h-full gap-3">
      <WorldMembershipGuard
        worldId={chat?.worlds?.id ?? null}
        selfId={userId ?? selfId}
      />
      <div className="flex flex-col focus-visible:outline-0 flex-1 h-full min-w-0 rounded-2xl border border-border-soft bg-background overflow-hidden">
        <ChatroomHeader
          chat={chat}
          chatId={chatId}
          rooms={initialChatrooms}
        />
        <section className="relative basis-auto flex-col -mb-(--composer-overlap-px) [--composer-overlap-px:64px] [--jump-btn-bottom:calc(var(--composer-overlap-px)+24px)] grow flex overflow-hidden">
          <div className="relative h-full">
            <ScrollAreaWithJumpToBottom
              ref={scrollRef}
              className="flex h-full flex-col overflow-y-auto thread-xl:pt-(--header-height)"
            >
              <div className="flex flex-col text-sm thread-xl:pt-header-height pb-25 divide-y divide-border-soft [--thread-content-max-width:40rem] lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 ">
                {loadingOlder && (
                  <div className="py-3 text-center text-xs text-muted-foreground">
                    Chargement de l’historique…
                  </div>
                )}
                {messages.map((m) => {
                  return (
                    <ChatroomMessage
                      key={m.id}
                      message={m}
                      online={onlineUsers}
                      invisibleUsers={invisibleUsers}
                      selfId={userId}
                      chatroomKey={roomKey}
                      forceEdit={editMessageId === m.id}
                      onForceEditConsumed={() => setEditMessageId(null)}
                      onReactionsUpdated={(mid, reactions) => {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === mid ? { ...m, reactions } : m,
                          ),
                        );
                      }}
                      onUpdated={(id, content) => {
                        setMessages((prev) =>
                          prev.map((x) =>
                            x.id === id ? { ...x, content } : x,
                          ),
                        );
                      }}
                      onDeleted={(id) => {
                        setMessages((prev) => prev.filter((x) => x.id !== id));
                      }}
                    />
                  );
                })}
              </div>
            </ScrollAreaWithJumpToBottom>
          </div>
        </section>
        <div className="group/thread-bottom-container relative isolate z-10 w-full basis-auto has-data-has-thread-error:pt-2 md:pt-0 print:hidden before:pointer-events-none before:absolute before:inset-x-0 before:bottom-1/2 before:-top-10 before:-z-10 before:bg-linear-to-t before:from-background before:from-50% before:to-transparent">
          <div className="text-base mx-auto [--thread-content-margin:--spacing(4)] thread-sm:[--thread-content-margin:--spacing(6)] thread-lg:[--thread-content-margin:--spacing(16)]">
            <div className="thread-lg:[--thread-content-max-width:48rem] mx-auto flex-1 p-10 pt-0">
              <div className="pointer-events-auto relative z-1 flex h-[var(--composer-container-height,100%)] max-w-full flex-[var(--composer-container-flex,1)] flex-col">
                {post_message && <ChatroomComposer
                  chatId={chatId}
                  presetPersona={selectedPersona}
                  onTyping={emitTyping}
                  onPersonaChange={setSelectedPersona}
                  chatroomKey={roomKey}
                  typingLine={typingLine}
                  onEditLastMessage={() => {
                    const last = [...messages].reverse().find((m) => isMyMessage(m, userId));
                    if (last) setEditMessageId(last.id);
                  }}
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

      {/* Rail d'icônes droit — hors de la carte */}
      {chat && (
        <div className="flex shrink-0 flex-col items-center gap-2 pt-3">
          <ChatroomSettingsSheet
            canEdit={canEdit}
            chatroom={{
              id: chat.id,
              title: chat.title,
              banner_url: chat.banner_url ?? null,
              icon_url: chat.icon_url ?? null,
              messages_count: messages.length,
            }}
          />
          <ChatroomStatsSheet chatId={chatId} />
          {chat.worlds?.id && (
            <WorldMembersSheet
              worldId={chat.worlds.id}
              ownerId={chat.worlds.owner_id ?? ""}
              canManage={canWorldAdmin}
            />
          )}
        </div>
      )}
    </div>
  );
}
