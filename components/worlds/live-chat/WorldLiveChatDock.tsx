"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown, MessagesSquare, SendHorizontal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useLiveChatWorldId } from "@/lib/worldLiveChatStore";
import { useWorldLiveChat, type LiveChatMessage } from "@/hooks/useWorldLiveChat";
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
 * Monté par `AppShell` ; ne rend rien hors d'un monde (aucun
 * `WorldLiveChatAnchor` monté) ou si le drapeau `world_live_chat` est éteint.
 */
export function WorldLiveChatDock() {
  const { world_live_chat } = useFeatureFlags();
  const worldId = useLiveChatWorldId();
  if (!world_live_chat || !worldId) return null;
  return <Dock worldId={worldId} />;
}

function Dock({ worldId }: { worldId: string }) {
  const t = useTranslations("worldLiveChat");
  const { messages, loading, presentCount, send, remove, userId } = useWorldLiveChat(worldId);
  const [open, setOpen] = useState(false);
  const last = messages[messages.length - 1] ?? null;

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
        <MessagesSquare className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">{t("title")}</h2>
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
      <MessageList
        messages={messages}
        loading={loading}
        selfId={userId}
        onDelete={async (id) => {
          if (!(await remove(id))) toast.error(t("deleteFailed"));
        }}
      />
      <Composer
        onSend={async (text) => {
          const res = await send(text);
          if (res === "too_fast") toast.error(t("tooFast"));
          else if (res === "error") toast.error(t("sendFailed"));
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

function MessageList({
  messages,
  loading,
  selfId,
  onDelete,
}: {
  messages: LiveChatMessage[];
  loading: boolean;
  selfId: string | null;
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
              grouped={isGrouped(messages[i - 1], m)}
              canDelete={m.user_id === selfId}
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

function MessageRow({
  message,
  grouped,
  canDelete,
  onDelete,
}: {
  message: LiveChatMessage;
  grouped: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("worldLiveChat");
  const format = useFormatter();
  const name = message.author?.username ?? "…";
  const time = format.dateTime(new Date(message.created_at), { hour: "2-digit", minute: "2-digit" });

  return (
    <li className={cn("group relative flex gap-3 px-4 hover:bg-muted", grouped ? "py-0.5" : "mt-2 py-1")}>
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
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={t("deleteMessage")}
          className="absolute right-2 top-0.5 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function Composer({
  onSend,
  onEscape,
}: {
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

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSend(text);
    setSending(false);
    if (ok) setText("");
    inputRef.current?.focus();
  }

  return (
    <form
      className="flex shrink-0 items-center gap-2 border-t p-2"
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
          if (e.key === "Escape") onEscape();
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
  );
}
