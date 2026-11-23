"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown, CornerUpLeft, Hash, MessageSquareText, MessagesSquare, Reply, SendHorizontal, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useLiveChatContext, type LiveChatRoom } from "@/lib/worldLiveChatStore";
import { useWorldLiveChat, type LiveChatMessage } from "@/hooks/useWorldLiveChat";
import { useLiveChannels } from "@/hooks/useLiveChannels";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { MAIN_PLACE, placeKey, type LiveChannel, type LiveChatPlace } from "@/lib/worldLiveChannels";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";

const MAX_LENGTH = DB_TEXT_LIMITS["world_live_messages.content"];
/** Distance au bas (px) en deçà de laquelle un nouveau message fait défiler. */
const STICK_THRESHOLD = 80;

/**
 * Chat en direct du monde courant, au bas de l'application.
 *
 * Replié : une barre fine qui fait défiler le dernier message et son auteur,
 * avec le nombre de membres présents. Déplié : un panneau de la moitié de la
 * hauteur de l'écran ; le contenu de la page, au-dessus, se resserre.
 *
 * Des salles (migration 238) : la principale, celles du monde (nom, couleur,
 * icône), et, dans un salon de jeu, le fil de ce salon, qui s'ouvre de
 * lui-même. Un clic sur un message y répond.
 *
 * Monté par `AppShell` ; ne rend rien hors d'un monde (aucun
 * `WorldLiveChatAnchor` monté) ou si le drapeau `world_live_chat` est éteint.
 */
export function WorldLiveChatDock() {
  const { world_live_chat } = useFeatureFlags();
  const context = useLiveChatContext();
  if (!world_live_chat || !context) return null;
  return <Dock worldId={context.worldId} chatroom={context.chatroom} />;
}

/** L'endroit à afficher : la salle choisie, tant qu'elle existe encore. */
function usePlace(chatroom: LiveChatRoom | null, channels: LiveChannel[] | null) {
  const chatroomId = chatroom?.id ?? null;
  const [place, setPlace] = useState<LiveChatPlace>(() => (chatroomId ? { kind: "chatroom", id: chatroomId } : MAIN_PLACE));
  // Entrer dans un salon ouvre son fil ; en sortir ramène à la principale
  // si l'on y était.
  const [prevRoom, setPrevRoom] = useState(chatroomId);
  if (prevRoom !== chatroomId) {
    setPrevRoom(chatroomId);
    setPlace((p) => (chatroomId ? { kind: "chatroom", id: chatroomId } : p.kind === "chatroom" ? MAIN_PLACE : p));
  }
  // Une salle supprimée pendant qu'on la lit : retour à la principale.
  const gone = place.kind === "channel" && channels !== null && !channels.some((c) => c.id === place.id);
  return [gone ? MAIN_PLACE : place, setPlace] as const;
}

function Dock({ worldId, chatroom }: { worldId: string; chatroom: LiveChatRoom | null }) {
  const t = useTranslations("worldLiveChat");
  const { channels } = useLiveChannels(worldId);
  const [place, setPlace] = usePlace(chatroom, channels);
  const { messages, loading, presentCount, send, remove, userId, unread } = useWorldLiveChat(worldId, place);
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<LiveChatMessage | null>(null);
  const last = messages[messages.length - 1] ?? null;
  const key = placeKey(place);

  // La réponse en cours ne survit pas à un changement de salle.
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setReplyTo(null);
  }

  const places = buildPlaces(channels ?? [], chatroom);
  const current = places.find((p) => placeKey(p.place) === key) ?? places[0];
  // Un fil de salon d'un autre salon ne compte pas : seul celui-ci est en vue.
  const unreadHere = (k: string) => unread.has(k) && (!k.startsWith("r:") || k === `r:${chatroom?.id}`);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={t("open")}
        data-testid="world-live-chat-bar"
        className="flex h-8 w-full shrink-0 items-center gap-2 overflow-hidden border-t bg-background px-3 text-left text-xs transition-colors hover:bg-muted lg:mt-2 lg:rounded-lg lg:border"
      >
        <MessagesSquare className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {current && <PlaceLabel entry={current} className="max-w-32 shrink-0" />}
        {places.some((p) => placeKey(p.place) !== key && unreadHere(placeKey(p.place))) && (
          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label={t("newActivity")} data-testid="world-live-chat-activity" />
        )}
        <span className="relative min-w-0 flex-1 overflow-hidden">
          {last ? (
            // La clé rejoue l'animation d'entrée à chaque nouveau message.
            <span key={last.id} className="flex min-w-0 items-baseline gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <span className="shrink-0 font-semibold text-foreground">{last.author?.username ?? "…"}</span>
              <span className="truncate text-muted-foreground">{last.content}</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{t("title")}</span>
          )}
        </span>
        <PresentCount count={presentCount} />
      </button>
    );
  }

  return (
    <section
      aria-label={t("title")}
      data-testid="world-live-chat-panel"
      className="flex h-[50dvh] w-full shrink-0 flex-col overflow-hidden border-t bg-background lg:mt-2 lg:rounded-lg lg:border"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <MessagesSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="sr-only">{t("title")}</h2>
        {/* Les salles : la principale, celles du monde, le fil du salon. */}
        <div role="tablist" aria-label={t("channels")} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" data-testid="world-live-chat-places">
          {places.map((entry) => {
            const k = placeKey(entry.place);
            const selected = k === key;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setPlace(entry.place)}
                data-place={k}
                className={cn(
                  "relative flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs transition-colors",
                  selected ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <PlaceLabel entry={entry} className="max-w-40" />
                {!selected && unreadHere(k) && (
                  <span className="size-1.5 rounded-full bg-primary" aria-label={t("newActivity")} data-testid="world-live-chat-unread" />
                )}
              </button>
            );
          })}
        </div>
        <PresentCount count={presentCount} />
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={() => setOpen(false)}
          aria-label={t("close")}
        >
          <ChevronDown />
        </Button>
      </header>
      {/* Changer de salle remonte la liste et le champ (défilement, brouillon).
          Clés distinctes : ce sont deux enfants du même parent. */}
      <MessageList
        key={`list-${key}`}
        messages={messages}
        loading={loading}
        selfId={userId}
        onReply={setReplyTo}
        onDelete={async (id) => {
          if (!(await remove(id))) toast.error(t("deleteFailed"));
          if (replyTo?.id === id) setReplyTo(null);
        }}
      />
      <Composer
        key={`composer-${key}`}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={async (text) => {
          const res = await send(text, replyTo?.id ?? null);
          if (res === "too_fast") toast.error(t("tooFast"));
          else if (res === "error") toast.error(t("sendFailed"));
          if (res === "ok") setReplyTo(null);
          return res === "ok";
        }}
        onEscape={() => setOpen(false)}
      />
    </section>
  );
}

function PresentCount({ count }: { count: number }) {
  const t = useTranslations("worldLiveChat");
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums" data-testid="world-live-chat-present">
      <Users className="size-3.5" aria-hidden />
      {t("present", { count })}
    </span>
  );
}

type PlaceEntry =
  | { place: LiveChatPlace; kind: "main" }
  | { place: LiveChatPlace; kind: "channel"; channel: LiveChannel }
  | { place: LiveChatPlace; kind: "chatroom"; title: string };

/** Les onglets : la principale, les salles du monde, puis le fil du salon. */
export function buildPlaces(channels: LiveChannel[], chatroom: LiveChatRoom | null): PlaceEntry[] {
  return [
    { place: MAIN_PLACE, kind: "main" },
    ...channels.map((channel) => ({ place: { kind: "channel" as const, id: channel.id }, kind: "channel" as const, channel })),
    ...(chatroom ? [{ place: { kind: "chatroom" as const, id: chatroom.id }, kind: "chatroom" as const, title: chatroom.title }] : []),
  ];
}

/** L'icône (« # » par défaut) et le nom d'une salle, à sa couleur. */
function PlaceLabel({ entry, className }: { entry: PlaceEntry; className?: string }) {
  const t = useTranslations("worldLiveChat");
  if (entry.kind === "chatroom") {
    return (
      <span className={cn("flex min-w-0 items-center gap-1", className)} title={t("chatroomThread", { title: entry.title })}>
        <MessageSquareText className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{entry.title || t("chatroomThreadFallback")}</span>
      </span>
    );
  }
  const channel = entry.kind === "channel" ? entry.channel : null;
  const color = channel?.color ?? undefined;
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)} style={color ? { color } : undefined}>
      {channel?.icon ? (
        <LazyLucideIcon name={channel.icon} className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <Hash className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="truncate">{channel ? channel.name : t("mainChannel")}</span>
    </span>
  );
}

function MessageList({
  messages,
  loading,
  selfId,
  onReply,
  onDelete,
}: {
  messages: LiveChatMessage[];
  loading: boolean;
  selfId: string | null;
  onReply: (message: LiveChatMessage) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("worldLiveChat");
  const tCommon = useTranslations("common");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Suit le bas tant que le lecteur y est ; s'il remonte lire l'historique,
  // un nouveau message ne le ramène pas de force.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
      }}
      className="min-h-0 flex-1 overflow-y-auto py-2"
    >
      {messages.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {loading ? tCommon("loading") : t("empty")}
        </p>
      ) : (
        <ol role="log" aria-live="polite" className="flex flex-col">
          {messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              // Une réponse rouvre toujours un en-tête : la citation s'y accroche.
              grouped={!m.reply_to_id && isGrouped(messages[i - 1], m)}
              canDelete={m.user_id === selfId}
              onReply={() => onReply(m)}
              onDelete={() => onDelete(m.id)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/** Même auteur à moins de cinq minutes d'écart : pas de nouvel en-tête. */
export function isGrouped(prev: LiveChatMessage | undefined, cur: LiveChatMessage): boolean {
  if (!prev || prev.user_id !== cur.user_id) return false;
  return new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
}

/** Amène le message cité en vue et le fait briller un instant. */
function jumpTo(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-live-message="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  el.dataset.highlight = "true";
  window.setTimeout(() => delete el.dataset.highlight, 1500);
}

function MessageRow({
  message,
  grouped,
  canDelete,
  onReply,
  onDelete,
}: {
  message: LiveChatMessage;
  grouped: boolean;
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("worldLiveChat");
  const format = useFormatter();
  const name = message.author?.username ?? "…";
  const time = format.dateTime(new Date(message.created_at), { hour: "2-digit", minute: "2-digit" });

  return (
    <li
      data-live-message={message.id}
      // Un clic sur le message y répond — pas sur un lien, un bouton, ni
      // quand on vient de sélectionner du texte pour le copier.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, [role=button]")) return;
        if (window.getSelection?.()?.toString()) return;
        onReply();
      }}
      className={cn(
        "group relative flex cursor-pointer gap-3 px-4 transition-colors hover:bg-muted data-[highlight=true]:bg-primary/10",
        grouped ? "py-0.5" : "mt-2 py-1",
      )}
    >
      <div className="w-8 shrink-0">
        {!grouped && (
          <UserProfileSheetTrigger userId={message.user_id} label={name}>
            <Avatar className="size-8 rounded-full">
              {message.author?.avatar_url && <AvatarImage src={message.author.avatar_url} alt="" />}
              <AvatarFallback className="rounded-full text-xs">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
          </UserProfileSheetTrigger>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {message.reply_to_id && (
          message.reply ? (
            <button
              type="button"
              onClick={() => jumpTo(message.reply!.id)}
              className="mb-0.5 flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label={t("jumpTo")}
              data-testid="world-live-chat-quote"
            >
              <CornerUpLeft className="size-3 shrink-0" aria-hidden />
              <span className="shrink-0 font-semibold">{message.reply.username ?? "…"}</span>
              <span className="truncate">{message.reply.content}</span>
            </button>
          ) : (
            <p className="mb-0.5 flex items-center gap-1 text-xs italic text-muted-foreground" data-testid="world-live-chat-quote">
              <CornerUpLeft className="size-3 shrink-0" aria-hidden />
              {t("replyDeleted")}
            </p>
          )
        )}
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <UserProfileSheetTrigger userId={message.user_id} label={name}>
              <span className="text-sm font-semibold hover:underline">{name}</span>
            </UserProfileSheetTrigger>
            <time dateTime={message.created_at} className="text-xs text-muted-foreground">{time}</time>
          </div>
        )}
        <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
      </div>
      <div className="absolute right-2 top-0.5 flex gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
        <Button variant="ghost" size="icon-sm" onClick={onReply} aria-label={t("replyTo", { name })}>
          <Reply />
        </Button>
        {canDelete && (
          <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={t("deleteMessage")}>
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  );
}

function Composer({
  replyTo,
  onCancelReply,
  onSend,
  onEscape,
}: {
  replyTo: LiveChatMessage | null;
  onCancelReply: () => void;
  onSend: (text: string) => Promise<boolean>;
  onEscape: () => void;
}) {
  const t = useTranslations("worldLiveChat");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Le panneau s'ouvre pour écrire : le curseur y va directement (desktop).
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  // Choisir un message à qui répondre : on écrit aussitôt.
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSend(text);
    setSending(false);
    if (ok) setText("");
    inputRef.current?.focus();
  }

  return (
    <div className="shrink-0 border-t">
    {replyTo && (
      <div className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground" data-testid="world-live-chat-replying">
        <CornerUpLeft className="size-3.5 shrink-0" aria-hidden />
        <span className="shrink-0">{t("replyingTo", { name: replyTo.author?.username ?? "…" })}</span>
        <span className="min-w-0 flex-1 truncate">{replyTo.content}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancelReply} aria-label={t("cancelReply")}>
          <X />
        </Button>
      </div>
    )}
    <form
      className="flex items-center gap-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          // Échap retire d'abord la réponse en cours, puis referme.
          if (replyTo) onCancelReply();
          else onEscape();
        }}
        maxLength={MAX_LENGTH}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        disabled={sending}
        className="flex-1"
      />
      <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label={t("send")}>
        <SendHorizontal />
      </Button>
    </form>
    </div>
  );
}
