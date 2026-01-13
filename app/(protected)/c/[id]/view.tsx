"use client";

import { createClient } from "@/lib/supabase/client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";

import ChatroomSettingsSheet from "@/components/chatrooms/ChatroomSettingsSheet";
import ChatroomStatsSheet from "@/components/chatrooms/ChatroomStatsSheet";

import { ScrollAreaWithJumpToBottom } from "@/components/ScrollAreaWithJumpToBottom";

export type Persona = {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
};

export type ChatroomPersonaPref = {
  chat_id: string;
  user_id: string;
  persona_id: string;
  updated_at: string;
};

export type ReactionSummary = { emoji: string; count: number; me: boolean };

export type ChatMessageWithPersona = ChatMessage & {
  persona?: Persona | null;
  reactions?: ReactionSummary[];
};

type ChatMessage = {
  id: number;
  chat_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

type PresenceMeta = {
  user_id: string;
  username?: string | null;
  avatar_url?: string | null;
  persona_name?: string | null;
};

type TypingEntry = {
  username?: string | null;
  personaName?: string | null;
  ts: number;
};

type ChatroomNavItem = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  updated_at: string | null;
  world_id: string | null;
};

import { Globe, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ChatroomComposer } from "@/components/chatrooms/ChatroomComposer";
import ChatroomMessage from "@/components/chatrooms/ChatroomMessage";
import { ScrollArea } from "@/components/ui/scroll-area";
import WorldChatroomsAside from "@/components/worlds/WorldChatroomsAside";

function sortChatrooms(a: ChatroomNavItem, b: ChatroomNavItem) {
  const da = a.updated_at ? Date.parse(a.updated_at) : 0;
  const db = b.updated_at ? Date.parse(b.updated_at) : 0;
  if (da !== db) return db - da;
  const la = (a.title ?? a.name ?? "").toString();
  const lb = (b.title ?? b.name ?? "").toString();
  return la.localeCompare(lb, "fr");
}

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

  const [chat, setChat] = useState(initialChat);
  const [messages, setMessages] = useState(initialMessages);
  const [framesByUser, setFramesByUser] = useState(equippedFrames); // SSR → state

  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
    initialPersona,
  );
  const [openPersona, setOpenPersona] = useState<Persona | null>(null);

  const [userId, setUserId] = useState<string | null>(selfId);
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState<Record<string, TypingEntry>>({}); // keyed by user_id

  const endRef = useRef<HTMLDivElement | null>(null);
  const latestIdRef = useRef<number | null>(
    messages.length ? messages[messages.length - 1].id : null,
  );

  /* mark as read */
  const lastMarkReadRef = useRef<number>(0);
  async function markChatRead(ts?: string) {
    if (!userId) return;

    const now = Date.now();
    if (now - lastMarkReadRef.current < 800) return; // throttle
    lastMarkReadRef.current = now;

    const lastReadAt = ts ?? new Date().toISOString();

    const { error } = await supabase.from("chatroom_reads").upsert(
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
    // reset du contenu quand on navigue vers une autre chatroom
    setChat(initialChat);
    setMessages(initialMessages);
    setSelectedPersona(initialPersona);

    latestIdRef.current = initialMessages.length
      ? initialMessages[initialMessages.length - 1].id
      : null;

    // marque comme lu dès l’entrée (utile pour navigation client)
    const ts = initialMessages.length
      ? initialMessages[initialMessages.length - 1].created_at
      : undefined;

    void markChatRead(ts);

    // optionnel: scroll au bas à l’arrivée
    // scrollToBottom("auto");
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
  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }
  function isNearBottom() {
    const el = scrollRef.current;
    if (!el) return true;
    const threshold = 96; // px de tolérance
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  /* presence */
  const [online, setOnline] = useState<Record<string, PresenceMeta>>({});

  function parsePresence(
    state: Record<string, any>,
  ): Record<string, PresenceMeta> {
    const res: Record<string, PresenceMeta> = {};
    for (const [userId, entry] of Object.entries(state)) {
      // Supabase renvoie { key: { metas: [...] } }
      const metas = Array.isArray(entry) ? entry : (entry?.metas ?? []);
      const latest = metas[metas.length - 1] ?? {};
      res[userId] = {
        user_id: userId,
        username: latest.username ?? null,
        avatar_url: latest.avatar_url ?? null,
        persona_name: latest.persona_name ?? null,
      };
    }
    return res;
  }

  /* typing presence */
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const meRef = useRef<{
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user;
      if (!me) return;

      // Profil pour username/avatar dans la présence
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", me.id)
        .maybeSingle();

      meRef.current = {
        id: me.id,
        username: profile?.username ?? null,
        avatar_url: (profile as any)?.avatar_url ?? null,
      };

      // 👉 canal par salle
      const channel = supabase.channel(`chat:${chatId}`, {
        config: {
          presence: { key: me.id },
          // En prod, garde self:false (tu ne reçois pas tes propres broadcasts)
          broadcast: { self: false },
        },
      });

      // ✅ SEULE source de vérité : recalcule tout à chaque "sync"
      channel.on("presence", { event: "sync" }, () => {
        setOnline(parsePresence(channel.presenceState()));
      });

      // Typing (inchangé)
      channel.on("broadcast", { event: "typing" }, ({ payload }) => {
        const { user_id, username, persona_name } = payload as {
          user_id: string;
          username?: string | null;
          persona_name?: string | null;
        };
        // si tu veux ignorer tes propres signaux: if (meRef.current?.id === user_id) return;

        setTyping((prev) => ({
          ...prev,
          [user_id]: {
            username,
            personaName: persona_name,
            ts: Date.now(),
          },
        }));

        window.setTimeout(() => {
          setTyping((curr) => {
            const t = curr[user_id];
            if (!t || Date.now() - t.ts < 3800) return curr;
            const copy = { ...curr };
            delete copy[user_id];
            return copy;
          });
        }, 4000);
      });

      // 🔒 Track APRÈS SUBSCRIBED (clé pour voir les joins correctement)
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: me.id,
            username: meRef.current?.username ?? null,
            avatar_url: meRef.current?.avatar_url ?? null,
            persona_name: selectedPersona?.name ?? null,
          });
          // maj immédiate (inclut toi-même)
          setOnline(parsePresence(channel.presenceState()));
        }
      });

      if (!mounted) {
        supabase.removeChannel(channel);
        return;
      }
      channelRef.current = channel;
    })();

    return () => {
      mounted = false;
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [chatId, supabase]);

  // Quand la persona sélectionnée change, on met à jour notre présence (facultatif)
  useEffect(() => {
    const me = meRef.current;
    const ch = channelRef.current;
    if (!me || !ch) return;
    ch.track({
      user_id: me.id,
      username: me.username,
      avatar_url: me.avatar_url,
      persona_name: selectedPersona?.name ?? null,
    }).then(() => {
      // force un recalcul local de la présence
      setOnline(parsePresence(ch.presenceState()));
    });
  }, [selectedPersona]);

  // Fonction transmise au composer -> broadcast "typing" (avec throttle)
  const emitTyping = () => {
    const now = Date.now();
    if (!channelRef.current) return;
    if (now - lastTypingSentRef.current < 1500) return; // throttle 1.5s
    lastTypingSentRef.current = now;

    const me = meRef.current;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: me?.id,
        username: me?.username,
        persona_name: selectedPersona?.name ?? null,
      },
    });
  };

  // Texte compact “qui tape ?”
  const typingLine = useMemo(() => {
    const entries = Object.values(typing);
    if (!entries.length) return "";
    const names = entries
      .map((e) => (e.username ? `@${e.username}` : "Quelqu’un"))
      .slice(0, 3);
    const who = names.join(", ");
    const persona = entries[0]?.personaName
      ? ` · ${entries[0].personaName}`
      : "";
    return `${who} ${names.length > 1 ? "écrivent" : "écrit"}…${persona}`;
  }, [typing]);

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

  // Auto-scroll quand messages changent
  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    if (isNearBottom() || isMyMessage(last, userId)) {
      scrollToBottom("smooth");
    }
  }, [messages, userId]);

  // Realtime après bootstrap SSR
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload) => {
          const id = (payload.new as any).id as number;
          if (latestIdRef.current && id <= latestIdRef.current) return;

          // Re-fetch 1 ligne avec join persona (pour garder la structure uniforme)
          const { data } = await supabase
            .from("chat_messages")
            .select(
              "id, chat_id, content, author_id, created_at, persona:personas(id, user_id, name, avatar_url)",
            )
            .eq("id", id)
            .single();

          if (!data) return;
          setMessages((prev) =>
            prev.some((m) => m.id === id)
              ? prev
              : [
                  ...prev,
                  { ...(data as ChatMessageWithPersona), reactions: [] },
                ],
          );

          latestIdRef.current = id;

          const uid = (data.author_id ?? data.persona?.user_id) as
            | string
            | undefined;
          if (uid && framesByUser[uid] === undefined) {
            const { data: eq } = await supabase
              .from("user_equipped_cosmetics")
              .select("cosmetic_items:avatar_frame_id(asset_url)")
              .eq("user_id", uid)
              .maybeSingle();
            setFramesByUser((prev) => ({
              ...prev,
              [uid]: eq?.cosmetic_items?.asset_url ?? null,
            }));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, supabase]);

  // Realtime: UPDATE messages (édition)
  useEffect(() => {
    const channel = supabase
      .channel(`chat-messages-updates-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const next = payload.new as any;
          const id = next.id as number;
          const content = next.content as string;

          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, content } : m)),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, supabase]);

  // Realtime des mises à jour de la chatroom (title/banner/icon)
  useEffect(() => {
    const channel = supabase
      .channel(`chatroom-updates-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chatrooms",
          filter: `id=eq.${chatId}`,
        },
        (payload) => {
          const next = payload.new as {
            title?: string | null;
            name?: string | null;
            banner_url?: string | null;
            icon_url?: string | null;
          };

          setChat((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              // ta UI utilise "title" : on le met à jour en priorité
              title: (next.title ?? next.name ?? prev.title) as string,
              banner_url: next.banner_url ?? prev.banner_url,
              icon_url: next.icon_url ?? prev.icon_url,
            };
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat-reactions-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_reactions",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const ev = payload.eventType; // INSERT | DELETE | UPDATE
          if (ev !== "INSERT" && ev !== "DELETE") return;

          const row: any = ev === "DELETE" ? payload.old : payload.new;
          if (!row) return;

          // Si tu fais un optimistic update côté client, ignore tes propres events
          if (row.user_id && userId && row.user_id === userId) return;

          const mid = Number(row.message_id);
          const emoji = String(row.emoji);

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== mid) return m;
              return {
                ...m,
                reactions: updateReactions(
                  m.reactions,
                  emoji,
                  ev === "INSERT" ? +1 : -1,
                ),
              };
            }),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, supabase, userId]);

  async function send() {
    const text = value.trim();
    if (!text) return;
    if (!selectedPersona) {
      toast.error("Sélectionnez un persona avant d'envoyer.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: inserted, error } = await supabase
      .from("chat_messages")
      .insert({
        chat_id: chatId,
        author_id: user.id,
        content: text,
        persona_id: selectedPersona.id,
      })
      // Récupère immédiatement la ligne insérée + le join persona
      .select("*, persona:personas(id, user_id, name, avatar_url)")
      .single();

    if (error) {
      // (optionnel) afficher un toast d’erreur ici
      return;
    }

    // Écho immédiat dans la liste (au cas où Realtime tarde ou soit filtré)
    if (inserted) {
      setMessages((prev) =>
        prev.some((m) => m.id === inserted.id)
          ? prev
          : [
              ...prev,
              { ...(inserted as ChatMessageWithPersona), reactions: [] },
            ],
      );
    }

    setValue("");

    // Mémoriser/effacer la préférence de persona pour cette chatroom
    await supabase.from("chatroom_persona_prefs").upsert(
      {
        chat_id: chatId,
        user_id: user.id,
        persona_id: selectedPersona.id,
      },
      { onConflict: "chat_id,user_id" },
    );
  }

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
        {/* Persona Profile Sheet */}
        <Sheet
          open={!!openPersona}
          onOpenChange={(o) => !o && setOpenPersona(null)}
        >
          <SheetContent side="right" className="w-[380px] sm:w-[420px]">
            <SheetHeader>
              <SheetTitle>Profil du persona</SheetTitle>
              <SheetDescription>Détails et actions rapides</SheetDescription>
            </SheetHeader>

            {openPersona && (
              <div className="mt-4 space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage
                      src={openPersona.avatar_url ?? undefined}
                      alt={openPersona.name}
                    />
                    <AvatarFallback>
                      {openPersona.name
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-base font-semibold">
                      {openPersona.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Propriétaire :{" "}
                      {openPersona.user_id === selfId
                        ? "Vous"
                        : openPersona.user_id}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">
                      Messages ici
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">
                      Persona ID
                    </div>
                    <div className="truncate text-xs">{openPersona.id}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedPersona(openPersona);
                      setOpenPersona(null);
                    }}
                  >
                    Utiliser ce persona
                  </button>
                  <button
                    className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => setOpenPersona(null)}
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
