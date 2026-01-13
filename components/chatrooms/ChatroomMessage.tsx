"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { ChatroomMessageBubble } from "./ChatroomMessageBubble";
import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Textarea } from "@/components/ui/textarea";

import { XPProgress } from "@/components/gamification/xp-progress";
import { createClient } from "@/lib/supabase/client";
import DateDisplay from "@/components/date-display";

// (optionnel si tu as shadcn Button + lucide)
import { Button } from "@/components/ui/button";
import { Pencil, Check, X, Loader2, SmilePlus } from "lucide-react";

import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const DEFAULT_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👀", "🔥"];

type ReactionSummary = { emoji: string; count: number; me: boolean };

function optimisticToggle(current: ReactionSummary[], emoji: string) {
  const arr = [...current];
  const idx = arr.findIndex((r) => r.emoji === emoji);

  if (idx === -1) {
    arr.push({ emoji, count: 1, me: true });
  } else {
    const r = arr[idx];
    if (r.me) {
      const nextCount = r.count - 1;
      if (nextCount <= 0) arr.splice(idx, 1);
      else arr[idx] = { ...r, count: nextCount, me: false };
    } else {
      arr[idx] = { ...r, count: r.count + 1, me: true };
    }
  }

  arr.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  return arr;
}

// Cache mémoire par userId pour éviter de refetch à chaque message du même auteur
const balanceCache = new Map<
  string,
  {
    xp: number;
    coins: number;
    streak_current: number;
    streak_longest: number;
  }
>();

function useUserBalance(userId?: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<{
    xp: number;
    coins: number;
    streak_current: number;
    streak_longest: number;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(
    !!userId && !balanceCache.has(userId!),
  );
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = async () => {
    if (!userId) return null;
    const { data: d1, error: e1 } = await supabase.rpc("get_balance_summary", {
      p_user_id: userId,
    });
    if (e1) throw e1;
    const row = Array.isArray(d1) ? d1?.[0] : d1;
    if (!row) return null;
    const parsed = {
      xp: Number(row.xp) || 0,
      coins: Number(row.coins) || 0,
      streak_current: Number(row.streak_current) || 0,
      streak_longest: Number(row.streak_longest) || 0,
    };
    balanceCache.set(userId, parsed);
    return parsed;
  };

  const refresh = useMemo(
    () =>
      async (force = true) => {
        if (!userId) return;
        try {
          if (!force && balanceCache.has(userId)) return;
          const parsed = await fetchOnce();
          if (parsed) setData(parsed);
        } catch (e: any) {
          setError(e.message ?? "Erreur");
        } finally {
          setLoading(false);
        }
      },
    [userId, supabase],
  );

  useEffect(() => {
    if (!userId) return;
    const cached = balanceCache.get(userId);
    if (cached) {
      setData(cached);
      setLoading(false);
      refresh(false);
    } else {
      setLoading(true);
      refresh(true);
    }
  }, [userId, refresh]);

  return { data, loading, error, refresh };
}

function isMyMessage(
  m: {
    author_id?: string | null;
    persona?: { user_id?: string | null } | null;
  },
  myId?: string | null,
) {
  if (!myId) return false;
  return (m.author_id ?? m.persona?.user_id ?? null) === myId;
}

function HoverProfile({
  children,
  userId,
  label,
}: {
  children: React.ReactNode;
  userId?: string | null;
  label?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { data, loading, refresh } = useUserBalance(userId);

  return (
    <HoverCard
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) refresh(true);
      }}
      openDelay={120}
      closeDelay={120}
    >
      <HoverCardTrigger
        asChild
        onPointerEnter={() => refresh(true)}
        onFocus={() => refresh(true)}
      >
        <button
          className="size-12 sticky top-4"
          title={label ?? "Voir le profil"}
          aria-label="Voir le profil"
        >
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3">
        <div className="space-y-2">
          <div className="text-sm font-medium truncate">
            {label ?? "Profil"}
          </div>
          {!loading && data && (
            <XPProgress
              xp={data.xp}
              coins={data.coins}
              streak={data.streak_current}
              className="mt-1"
            />
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default function ChatroomMessage({
  message,
  online,
  selfId,
  onUpdated,
  frameByUser,
  onReactionsUpdated,
}: {
  message: any;
  online: Record<string, any>;
  selfId: string | null;
  onUpdated?: (id: number, content: string) => void;
  frameByUser?: Record<string, string | null>; // ⬅️ nouveau
  onReactionsUpdated?: (
    id: number,
    reactions: { emoji: string; count: number; me: boolean }[],
  ) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const mine = isMyMessage(message, selfId);
  const isOnline = !!online[message.author_id];
  const avatarSrc =
    online[message.author_id]?.avatar_url ?? message.author?.avatar_url;

  const date = message.created_at;

  const userId = message?.author_id ?? message?.persona?.user_id ?? null;
  const label =
    message?.persona?.name ??
    online[message.author_id]?.username ??
    message?.author?.full_name ??
    "Profil";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(message?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Si un UPDATE arrive via realtime pendant qu’on n’édite pas, on resync le draft
  useEffect(() => {
    if (!editing) setDraft(message?.content ?? "");
  }, [message?.content, editing]);

  const startEdit = useCallback(() => {
    if (!mine) return;
    setErr(null);
    setDraft(message?.content ?? "");
    setEditing(true);
  }, [mine, message?.content]);

  const cancelEdit = useCallback(() => {
    setErr(null);
    setDraft(message?.content ?? "");
    setEditing(false);
  }, [message?.content]);

  const save = useCallback(async () => {
    if (!mine) return;

    const next = draft; // volontairement: pas de trim agressif (markdown, retours, etc.)
    if (!next || !next.trim()) {
      setErr("Le message ne peut pas être vide.");
      return;
    }
    if (next === (message?.content ?? "")) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setErr(null);

    const { error } = await supabase
      .from("chat_messages")
      .update({ content: next })
      .eq("id", message.id);

    setSaving(false);

    if (error) {
      setErr(error.message ?? "Erreur lors de la mise à jour.");
      return;
    }

    // Optimistic update local (le realtime UPDATE prendra le relais pour tout le monde)
    onUpdated?.(message.id, next);
    setEditing(false);
  }, [draft, mine, message?.content, message?.id, onUpdated, supabase]);

  function onKeyDownEdit(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
      return;
    }
    // Ctrl/Cmd+Enter = enregistrer
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  // cosmetics
  const { data: eq } = supabase
    .from("user_equipped_cosmetics")
    .select(
      "avatar_frame_id, cosmetic_items!user_equipped_cosmetics_avatar_frame_id_fkey(asset_url)",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const frameUrl = userId ? (frameByUser?.[userId] ?? null) : null;

  /* reactions */
  const reactions = (message.reactions ?? []) as ReactionSummary[];

  async function toggleReaction(emoji: string) {
    if (!selfId) {
      toast.error("Vous devez être connecté pour réagir.");
      return;
    }

    const prev = reactions;
    const next = optimisticToggle(prev, emoji);
    onReactionsUpdated?.(message.id, next);

    const alreadyReacted = prev.some((r) => r.emoji === emoji && r.me);

    const q = alreadyReacted
      ? supabase.from("chat_message_reactions").delete().match({
          chat_id: message.chat_id,
          message_id: message.id,
          user_id: selfId,
          emoji,
        })
      : supabase.from("chat_message_reactions").insert({
          chat_id: message.chat_id,
          message_id: message.id,
          user_id: selfId,
          emoji,
        });

    const { error } = await q;
    if (error) {
      // rollback
      onReactionsUpdated?.(message.id, prev);
      toast.error(error.message ?? "Impossible de réagir.");
    }
  }
  /* reactions */

  return (
    <article className="w-full py-8 group/turn-messages">
      <div className="flex w-full flex-col justify-between gap-8">
        <div className="flex flex-1 gap-4 justify-between">
          <div className="flex flex-1 gap-4">
            {message.persona?.name && (
              <HoverProfile userId={userId} label={label}>
                <AvatarWithFrame
                  src={message.persona?.avatar_url ?? avatarSrc}
                  alt={label ?? "User"}
                  fallback={message.persona?.name ?? "?"}
                  online={isOnline}
                  size={48}
                  frameUrl={frameUrl}
                />
              </HoverProfile>
            )}
            <div className="text-sm flex flex-col justify-between gap-2 w-full">
              <strong className="font-medium">{message.persona?.name}</strong>
              <div className="dark:text-zinc- text-zinc-400">
                <DateDisplay value={date} />
              </div>
            </div>
          </div>

          <div className="flex">
            {!editing && reactions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 items-center">
                {reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => void toggleReaction(r.emoji)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border border-border-soft px-2 py-1 text-xs",
                      "bg-[#161b27] hover:bg-muted",
                      r.me && "border-primary/40 bg-primary/10",
                    )}
                    aria-label={`Réaction ${r.emoji}`}
                    title={r.me ? "Retirer ma réaction" : "Ajouter ma réaction"}
                  >
                    <span className="text-sm leading-none">{r.emoji}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={cn("relative flex flex-col gap-2 grow ")}>
          <div className="">
            {editing ? (
              <div className="w-full">
                <div className="rounded-2xl border bg-background/60 p-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDownEdit}
                    disabled={saving}
                    autoFocus
                    rows={Math.min(
                      10,
                      Math.max(2, (draft.match(/\n/g)?.length ?? 0) + 1),
                    )}
                    className="w-full resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 text-sm leading-relaxed min-h-[44px]"
                  />
                  {err && (
                    <div className="mt-1 text-xs text-destructive">{err}</div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    Esc = annuler • Ctrl/Cmd+Enter = enregistrer
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <ChatroomMessageBubble
                  persona={message.persona}
                  message={message}
                  isMine={mine}
                />
                {!editing && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Ajouter une réaction"
                        title="Réagir"
                      >
                        <SmilePlus className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-auto p-2">
                      <div className="flex flex-wrap gap-1">
                        {DEFAULT_EMOJIS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => void toggleReaction(e)}
                            className={cn(
                              "h-8 w-8 rounded-md border text-base leading-none",
                              "bg-background hover:bg-muted",
                              reactions.some((r) => r.emoji === e && r.me) &&
                                "border-primary/40 bg-primary/10",
                            )}
                            aria-label={`Réagir avec ${e}`}
                            title={e}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {/* Hover actions */}
                <footer className="z-0 flex justify-end">
                  <span className="touch:-me-2 touch:-ms-3.5 -ms-2.5 -me-1 flex flex-wrap items-center gap-1 p-1 select-none focus-within:transition-none hover:transition-none touch:pointer-events-auto touch:opacity-100 duration-300 group-hover/turn-messages:delay-300 pointer-events-none opacity-0 motion-safe:transition-opacity group-hover/turn-messages:pointer-events-auto group-hover/turn-messages:opacity-100 group-focus-within/turn-messages:pointer-events-auto group-focus-within/turn-messages:opacity-100 has-data-[state=open]:pointer-events-auto has-data-[state=open]:opacity-100 text-sm">
                    {mine && !editing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={startEdit}
                        aria-label="Modifier le message"
                        title="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}

                    {mine && editing && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={cancelEdit}
                          disabled={saving}
                          aria-label="Annuler"
                          title="Annuler"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => void save()}
                          disabled={saving}
                          aria-label="Enregistrer"
                          title="Enregistrer"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </span>
                </footer>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
