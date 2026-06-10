"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import ChatroomSettingsSheet from "@/components/chatrooms/ChatroomSettingsSheet";
import ChatroomStatsSheet from "@/components/chatrooms/ChatroomStatsSheet";
import { ScrollAreaWithJumpToBottom } from "@/components/ScrollAreaWithJumpToBottom";
import { ChatroomComposer } from "@/components/chatrooms/ChatroomComposer";
import ChatroomMessage from "@/components/chatrooms/ChatroomMessage";
import { PersonaProfileSheet } from "@/components/chatrooms/PersonaProfileSheet";
import WorldChatroomsAside, { type ChatroomNavItem } from "@/components/worlds/WorldChatroomsAside";

import { TABLE, DELAY, SCROLL_THRESHOLD_PX } from "@/lib/constants";
import type { ChatMessageWithPersona, Persona, ReactionSummary } from "@/types/db";
import { useRealtimeChatSync } from "@/hooks/useRealtimeChatSync";
import { usePresenceChannel } from "@/hooks/usePresenceChannel";
import { useNotifications } from "@/components/providers/NotificationsProvider";

export type { Persona, ChatMessageWithPersona, ReactionSummary } from "@/types/db";
export type { ChatroomNavItem } from "@/components/worlds/WorldChatroomsAside";

function ChatroomHeader({
  chat,
  chatId,
  messagesCount,
  canEdit,
}: {
  chat: any | null; // tolère le chargement
  chatId: string;
  messagesCount: number;
  canEdit: boolean;
}) {
  return (
    <header className="draggable no-draggable-children sticky top-0 p-2 touch:p-2.5 flex items-center justify-between z-20 h-header-height bg-background pointer-events-none select-none [view-transition-name:var(--vt-page-header)] *:pointer-events-auto motion-safe:transition max-md:hidden [box-shadow:var(--sharp-edge-top-shadow-placeholder)] border-b border-border-soft">
      <div className="pointer-events-none absolute start-0 flex flex-col items-center gap-2 lg:start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2">
        {/* open button */}
      </div>
      <div className="flex flex-1 items-center justify-between">
        <div className="flex flex-1 items-center justify-between px-2">
          {chat && (
            <>
              {chat.title}
              <div className="flex items-center gap-4">
                <ChatroomSettingsSheet
                  canEdit={canEdit}
                  chatroom={{
                    id: chat.id,
                    title: chat.title,
                    banner_url: chat.banner_url ?? null,
                    icon_url: chat.icon_url ?? null,
                    messages_count: messagesCount,
                  }}
                />
                <ChatroomStatsSheet chatId={chatId} />
              </div>
            </>
          )}
        </div>
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
  initialPersona,
  selfId,
  canEdit,
  equippedFrames,
  initialChatrooms,
}: {
  chatId: string;
  initialChat: {
    id: string;
    title: string;
    banner_url: string | null;
    icon_url: string | null;
    worlds: { id: string; name: string } | null;
  };
  initialMessages: ChatMessageWithPersona[];
  initialPersona: Persona | null;
  selfId: string | null;
  canEdit: boolean;
  equippedFrames: Record<string, string | null>;
  initialChatrooms: ChatroomNavItem[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { setActiveChat } = useNotifications();

  const [chat, setChat] = useState(initialChat);
  const [messages, setMessages] = useState(initialMessages);
  const [framesByUser, setFramesByUser] = useState(equippedFrames); // SSR → state

  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
    initialPersona,
  );
  const [openPersona, setOpenPersona] = useState<Persona | null>(null);

  const [userId, setUserId] = useState<string | null>(selfId);

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

    setActiveChat(chatId);

    const ts = initialMessages.at(-1)?.created_at;
    void markChatRead(ts);

    return () => setActiveChat(null);
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
  function isNearBottom() {
    const vp = getViewport();
    if (!vp) return true;
    return vp.scrollHeight - vp.scrollTop - vp.clientHeight < SCROLL_THRESHOLD_PX;
  }

  // Suivre en temps réel si l'utilisateur est près du bas
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const onScroll = () => {
      nearBottomRef.current =
        vp.scrollHeight - vp.scrollTop - vp.clientHeight < SCROLL_THRESHOLD_PX;
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => vp.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { online, emitTyping, typingLine, clearTyping } = usePresenceChannel({
    chatId,
    persona: selectedPersona,
  });

  // Si l'utilisateur n'était pas présent côté serveur, on le récupère ici
  useEffect(() => {
    if (userId) return;
    supabase.auth
      .getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, [supabase, userId]);

  // Scroll initial
  useEffect(() => {
    scrollToBottom("auto");
  }, []);

  // Auto-scroll uniquement quand un nouveau message est ajouté (pas sur update/réactions)
  const msgCountRef = useRef(messages.length);
  useEffect(() => {
    const prev = msgCountRef.current;
    msgCountRef.current = messages.length;
    if (messages.length <= prev) return; // update ou suppression, pas d'ajout
    const last = messages[messages.length - 1];
    if (nearBottomRef.current || isMyMessage(last, userId)) {
      scrollToBottom("smooth");
    }
  }, [messages, userId]);

  useRealtimeChatSync({
    chatId,
    selfId: userId,
    initialLatestId: initialMessages.at(-1)?.id ?? null,
    onMessageInserted: (msg, authorId) => {
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg, reactions: [] }],
      );
      if (authorId) clearTyping(authorId);
      if (authorId && framesByUser[authorId] === undefined) {
        supabase
          .from(TABLE.USER_EQUIPPED_COSMETICS)
          .select("cosmetic_items:avatar_frame_id(asset_url)")
          .eq("user_id", authorId)
          .maybeSingle()
          .then(({ data: eq }) => {
            setFramesByUser((prev) => ({
              ...prev,
              [authorId]: (eq?.cosmetic_items as unknown as { asset_url?: string | null } | null)?.asset_url ?? null,
            }));
          });
      }
    },
    onMessageUpdated: (id, content) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content } : m)));
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
    <div className="composer-parent flex flex-row focus-visible:outline-0 h-full">
      <WorldChatroomsAside
        worldId={chat?.worlds?.id ?? ""}
        selfId={userId ?? selfId ?? ""} // IMPORTANT pour unread realtime
        currentChatId={chatId}
        initialRooms={initialChatrooms as any} // idéalement: ajuste le type (voir plus bas)
      />

      <div className="flex flex-col focus-visible:outline-0 flex-1 h-full">
        <ChatroomHeader
          chat={chat}
          chatId={chatId}
          messagesCount={messages.length}
          canEdit={canEdit}
        />
        <section className="relative basis-auto flex-col -mb-(--composer-overlap-px) [--composer-overlap-px:28px] grow flex overflow-hidden">
          <div className="relative h-full">
            <ScrollAreaWithJumpToBottom
              ref={scrollRef}
              className="flex h-full flex-col overflow-y-auto thread-xl:pt-(--header-height)"
            >
              <div className="flex flex-col text-sm thread-xl:pt-header-height pb-25 divide-y divide-border-soft p-4 [--thread-content-max-width:40rem] lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 ">
                {messages.map((m) => {
                  return (
                    <ChatroomMessage
                      key={m.id}
                      message={m}
                      online={online}
                      selfId={userId}
                      frameByUser={framesByUser}
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
                    />
                  );
                })}
              </div>
            </ScrollAreaWithJumpToBottom>
          </div>
        </section>
        <div className="group/thread-bottom-container border-border-soft bg-black/35 border-t relative isolate z-10 w-full basis-auto has-data-has-thread-error:pt-2 md:pt-0 print:hidden backdrop-blur-sm">
          <div className="text-base mx-auto [--thread-content-margin:--spacing(4)] thread-sm:[--thread-content-margin:--spacing(6)] thread-lg:[--thread-content-margin:--spacing(16)]">
            <div className="thread-lg:[--thread-content-max-width:48rem] mx-auto flex-1 p-2">
              <div className="pointer-events-auto relative z-1 flex h-[var(--composer-container-height,100%)] max-w-full flex-[var(--composer-container-flex,1)] flex-col">
                {typingLine && (
                  <div className="px-4 py-2 text-sm text-muted-foreground italic absolute bottom-full">
                    {typingLine}
                  </div>
                )}
                <ChatroomComposer
                  chatId={chatId}
                  presetPersona={selectedPersona}
                  onTyping={emitTyping}
                  onPersonaChange={setSelectedPersona}
                />
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
    </div>
  );
}
