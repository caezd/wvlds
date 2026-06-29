"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mail, Pin, PinOff, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabaseThumb } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDms } from "@/components/providers/DmsProvider";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useTranslations, useFormatter } from "next-intl";
import type { DmConversation } from "@/types/db";

// ── Shared primitives ─────────────────────────────────────────────────────────

function DmAvatar({
  src,
  fallback,
  size,
  className,
  isActive = false,
}: {
  src?: string | null;
  fallback: string;
  size: number;
  className?: string;
  isActive?: boolean;
}) {
  const thumb = src ? (supabaseThumb(src, size * 2) ?? src) : null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground",
        isActive && "ring-2 ring-accent ring-offset-2 ring-offset-background",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {thumb
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={thumb} alt="" className="h-full w-full object-cover" />
        : (fallback[0] ?? "?").toUpperCase()
      }
    </span>
  );
}

function PresenceDot({
  status,
  size = "md",
}: {
  status: "online" | "away" | "offline";
  size?: "sm" | "md";
}) {
  if (status === "offline") return null;
  return (
    <span
      className={cn(
        "absolute rounded-full border-2 border-background",
        size === "sm" ? "bottom-0 right-0 h-2.5 w-2.5" : "bottom-0 right-0 h-3 w-3",
        status === "online" ? "bg-green-500" : "bg-yellow-500",
      )}
    />
  );
}

function UnreadBadge({ count, offset = "default" }: { count: number; offset?: "default" | "tight" }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute flex min-w-4 h-4 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold px-0.5 shadow-[0_0_0_2px_hsl(var(--background))]",
        offset === "tight"
          ? "-top-0.5 -right-0.5 h-4 text-[9px]"
          : "-top-1 -right-1 h-4 text-[10px]",
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ── 1. Toggle button — icône dans le rail de la sidebar ───────────────────────

export function DmsToggleButton() {
  const t = useTranslations("dms");
  const { panelOpen, togglePanel, conversations, pinnedConvIds } = useDms();

  const unpinnedUnread = conversations
    .filter(c => !pinnedConvIds.includes(c.id))
    .reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={togglePanel}
          aria-label={t("title")}
          aria-pressed={panelOpen}
          className={cn(
            "relative flex h-9 w-9 items-center bg-carbon-800 justify-center rounded-xl transition-colors",
            panelOpen
              ? "text-accent bg-accent/10"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Mail size={17} />
          {unpinnedUnread > 0 && (
            <UnreadBadge count={unpinnedUnread} offset="tight" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{t("title")}</TooltipContent>
    </Tooltip>
  );
}

// ── 2. Pinned avatars — s'insère dans le rail de la sidebar ──────────────────

export function PinnedDmAvatarsRail() {
  const t = useTranslations("dms");
  const { conversations, pinnedConvIds, panelOpen, activeConvId, openConversation } = useDms();
  const { getUserPresence } = useGlobalPresence();

  const pinned = pinnedConvIds
    .map(id => conversations.find(c => c.id === id))
    .filter((c): c is DmConversation => !!c);

  if (pinned.length === 0) return null;

  return (
    <>
      {pinned.map((conv) => {
        const presence = getUserPresence(conv.other_user_id);
        const label = conv.other_username ? `@${conv.other_username}` : t("privateMessage");
        const isActive = panelOpen && activeConvId === conv.id;

        return (
          <Tooltip key={conv.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => void openConversation(conv.other_user_id)}
                aria-label={label}
                aria-pressed={isActive}
                className={cn(
                  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                )}
              >
                <DmAvatar src={conv.other_avatar_url} fallback={conv.other_username ?? "?"} size={36} isActive={isActive} />
                <PresenceDot status={presence} size="sm" />
                <UnreadBadge count={conv.unread_count} offset="tight" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

// ── 3. Panel content ──────────────────────────────────────────────────────────

const MAX_PINNED = 3;

// ── 3a. Rail de conversations (horizontal, draggable) ─────────────────────────

function ConversationRail({
  conversations,
  activeConvId,
  onSelect,
  onNewConv,
}: {
  conversations: DmConversation[];
  activeConvId: string | null;
  onSelect: (conv: DmConversation) => void;
  onNewConv: () => void;
}) {
  const t = useTranslations("dms");
  const { getUserPresence } = useGlobalPresence();
  const { pinnedConvIds, pinConv, unpinConv } = useDms();
  const railRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  function onMouseDown(e: React.MouseEvent) {
    if (!railRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - railRef.current.offsetLeft;
    scrollLeft.current = railRef.current.scrollLeft;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging.current || !railRef.current) return;
    e.preventDefault();
    const x = e.pageX - railRef.current.offsetLeft;
    railRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  }
  function onMouseUp() { isDragging.current = false; }

  return (
    <div
      ref={railRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      className="flex gap-3 overflow-x-auto px-4 py-3 select-none [scrollbar-width:none] cursor-grab active:cursor-grabbing"
    >
      {conversations.map((conv) => {
        const presence = getUserPresence(conv.other_user_id);
        const isActive = conv.id === activeConvId;
        const isPinned = pinnedConvIds.includes(conv.id);
        const canPin = !isPinned && pinnedConvIds.length < MAX_PINNED;

        return (
          <div key={conv.id} className="group/conv relative shrink-0">
            <button
              onClick={() => onSelect(conv)}
              className={cn(
                "relative block rounded-full transition-opacity",
                isActive
                  ? "opacity-100 ring-2 ring-accent ring-offset-2 ring-offset-background"
                  : "opacity-80 hover:opacity-100",
              )}
            >
              <DmAvatar src={conv.other_avatar_url} fallback={conv.other_username ?? "?"} size={44} />
              <PresenceDot status={presence} />
              <UnreadBadge count={conv.unread_count} />
            </button>

            <button
              onClick={() => isPinned ? unpinConv(conv.id) : pinConv(conv.id)}
              disabled={!isPinned && !canPin}
              aria-label={isPinned ? t("unpin") : t("pin")}
              className={cn(
                "absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border border-background transition-all",
                "opacity-0 group-hover/conv:opacity-100",
                isPinned
                  ? "bg-accent text-accent-foreground"
                  : canPin
                    ? "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    : "bg-muted text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
            </button>
          </div>
        );
      })}

      <button
        onClick={onNewConv}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        aria-label={t("newConversation")}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

// ── 3b. Recherche d'un utilisateur ───────────────────────────────────────────

function NewConvSearch({ onSelect, onCancel }: { onSelect: (id: string) => void; onCancel: () => void }) {
  const t = useTranslations("dms");
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; username: string | null; avatar_url: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `%${query.trim()}%`)
        .limit(8);
      setResults((data ?? []) as typeof results);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, supabase]);

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-9 w-full rounded-full bg-muted pl-8 pr-10 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={onCancel}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X size={12} />
        </button>
      </div>
      {loading && <p className="px-1 text-xs text-muted-foreground">{t("searching")}</p>}
      {results.map(u => (
        <button
          key={u.id}
          onClick={() => onSelect(u.id)}
          className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
        >
          <DmAvatar src={u.avatar_url} fallback={u.username ?? "?"} size={32} />
          <span className="text-sm">@{u.username ?? u.id.slice(0, 8)}</span>
        </button>
      ))}
    </div>
  );
}

// ── 3c. Vue conversation ──────────────────────────────────────────────────────

function MessageBubble({ content, isMine, createdAt }: { content: string; isMine: boolean; createdAt: string }) {
  const format = useFormatter();
  const time = format.dateTime(new Date(createdAt), { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex flex-col gap-0.5", isMine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-snug",
          isMine
            ? "bg-[#1B1B1D] text-accent-foreground rounded-tr-sm"
            : "bg-[#232327] text-foreground rounded-tl-sm",
        )}
      >
        {content}
      </div>
      <span className="px-1 text-[10px] text-muted-foreground/50">{time}</span>
    </div>
  );
}

function ConversationView({ conv, onBack }: { conv: DmConversation; onBack: () => void }) {
  const t = useTranslations("dms");
  const { messages, sendMessage, commonWorldsCount, hasMoreMessages, loadMoreMessages, currentUserId } = useDms();
  const [draft, setDraft] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prependingRef = useRef(false);
  const savedScrollHeightRef = useRef(0);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const displayName = conv.other_username ? `@${conv.other_username}` : conv.other_user_id.slice(0, 8);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependingRef.current) {
      prependingRef.current = false;
      el.scrollTop = el.scrollHeight - savedScrollHeightRef.current;
    } else if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMoreMessages && !loadingMore) {
          void triggerLoadMore();
        }
      },
      { root: container, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreMessages, loadingMore]); // eslint-disable-line react-hooks/exhaustive-deps

  async function triggerLoadMore() {
    const el = scrollRef.current;
    if (!el || loadingMore) return;
    savedScrollHeightRef.current = el.scrollHeight;
    prependingRef.current = true;
    setLoadingMore(true);
    await loadMoreMessages();
    setLoadingMore(false);
  }

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    isAtBottomRef.current = true;
    await sendMessage(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 px-2">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 border-t border-b px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{displayName}</p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {commonWorldsCount !== null && commonWorldsCount > 0 && (
              <span className="text-mist-200">
                {t("commonWorlds", { count: commonWorldsCount })}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea
        type="auto"
        viewportRef={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0"
      >
        <div className="flex flex-col gap-2 px-4 py-2">
          <div ref={topSentinelRef} className="shrink-0 h-px" />

          {loadingMore && (
            <div className="flex justify-center py-2">
              <Loader2 size={14} className="animate-spin text-muted-foreground/50" />
            </div>
          )}

          {!hasMoreMessages && messages.length > 0 && (
            <p className="py-1 text-center text-[10px] text-muted-foreground/30">{t("conversationStart")}</p>
          )}

          {messages.length === 0 && (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-xs text-muted-foreground/50">{t("startConversation")}</p>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              content={msg.content}
              isMine={msg.author_id === currentUserId}
              createdAt={msg.created_at}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="shrink-0 flex items-end gap-2 border-t border-border-soft px-4 py-3">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("writePlaceholder")}
          rows={1}
          className="flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground [field-sizing:content] max-h-32"
        />
        <button
          onClick={() => void submit()}
          disabled={!draft.trim()}
          aria-label={t("send")}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
            draft.trim()
              ? "bg-accent text-accent-foreground hover:bg-accent/90"
              : "bg-muted text-muted-foreground",
          )}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 translate-x-0.5" aria-hidden="true">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── 3d. Panel principal ───────────────────────────────────────────────────────

export function DmsPanelContent() {
  const t = useTranslations("dms");
  const { conversations, activeConvId, openConversation, closeConversation, closePanel } = useDms();
  const [showSearch, setShowSearch] = useState(false);

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

  async function handleSelectConv(conv: DmConversation) {
    setShowSearch(false);
    await openConversation(conv.other_user_id);
  }

  async function handleSelectNewUser(userId: string) {
    setShowSearch(false);
    await openConversation(userId);
  }

  const iconBtn = "flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

  return (
    <div className="flex h-full flex-col overflow-hidden py-1 gap-0.5">
      {/* Header */}
      <div className="shrink-0 h-header-height flex items-center px-4 gap-2">
        <span className="flex-1 font-bold">{t("title")}</span>
        <button onClick={closePanel} className={iconBtn} aria-label={t("title")}>
          <X size={15} />
        </button>
      </div>

      {/* Rail */}
      <ConversationRail
        conversations={conversations}
        activeConvId={activeConvId}
        onSelect={handleSelectConv}
        onNewConv={() => setShowSearch(v => !v)}
      />

      {showSearch && (
        <NewConvSearch onSelect={handleSelectNewUser} onCancel={() => setShowSearch(false)} />
      )}

      {activeConv && !showSearch && (
        <ConversationView conv={activeConv} onBack={closeConversation} />
      )}

      {!activeConv && !showSearch && conversations.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <p className="text-sm">{t("empty")}</p>
          <p className="text-xs text-muted-foreground/60">{t("emptyHint")}</p>
        </div>
      )}

      {!activeConv && !showSearch && conversations.length > 0 && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground/50">{t("selectConversation")}</p>
        </div>
      )}
    </div>
  );
}
