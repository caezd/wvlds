"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MessageCircle } from "lucide-react";

import { TABLE } from "@/lib/constants";
import { getChatroomKeys } from "@/lib/chatroomKeys";
import { decryptMessage } from "@/lib/crypto";
import { relativeTime } from "@/lib/relativeTime";
import type { TimelineRoomStatus } from "@/lib/worldTimelineItems";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { TimelinePersona } from "@/components/worlds/timeline/useTimelineData";

/** Le survol d'un salon ouvre son aperçu au bout de ce délai (ms). */
export const ROOM_PREVIEW_DELAY = 450;
/** Un aperçu chargé sert encore ce temps-là (ms). */
const PREVIEW_TTL = 60_000;
const EXCERPT_MAX = 160;

export type RoomPreviewData = {
  /** Les messages que le lecteur peut lire. */
  count: number;
  lastAt: string | null;
  /** Le dernier message, déchiffré, en une ligne ; `null` sans message lisible. */
  excerpt: string | null;
};

/** Ce dont l'aperçu a besoin, fourni par la frise. */
type PreviewContext = {
  supabase: SupabaseClient;
  participantsOf: (roomId: string) => readonly TimelinePersona[];
};
const RoomPreviewContext = createContext<PreviewContext | null>(null);
export const RoomPreviewProvider = RoomPreviewContext.Provider;

/** Le texte d'un message en une ligne courte : sans balises Markdown, espaces resserrés. */
export function messageExcerpt(text: string, max = EXCERPT_MAX): string | null {
  const flat = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

const cache = new Map<string, { at: number; promise: Promise<RoomPreviewData> }>();

/**
 * Le nombre de messages d'un salon, son dernier message (déchiffré avec la
 * clé du salon) et son heure. Sous la RLS du lecteur : ce qu'il peut lire.
 * Mis en cache une minute ; une requête en échec n'est pas gardée.
 */
export function loadRoomPreview(supabase: SupabaseClient, roomId: string, now = Date.now()): Promise<RoomPreviewData> {
  const hit = cache.get(roomId);
  if (hit && now - hit.at < PREVIEW_TTL) return hit.promise;
  const promise = (async () => {
    const [last, total, keys] = await Promise.all([
      supabase
        .from(TABLE.CHAT_MESSAGES)
        .select("content, created_at")
        .eq("chat_id", roomId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1),
      supabase.from(TABLE.CHAT_MESSAGES).select("id", { count: "exact", head: true }).eq("chat_id", roomId),
      getChatroomKeys(supabase, [roomId]),
    ]);
    if (last.error) throw last.error;
    if (total.error) throw total.error;
    const row = (last.data as { content: string | null; created_at: string }[] | null)?.[0] ?? null;
    const key = keys.get(roomId);
    const text = row?.content ? (key ? await decryptMessage(row.content, key) : row.content) : null;
    return {
      count: total.count ?? 0,
      lastAt: row?.created_at ?? null,
      // Un message resté chiffré (clé absente ou illisible) ne se montre pas.
      excerpt: text && !text.startsWith("enc:") ? messageExcerpt(text) : null,
    };
  })();
  cache.set(roomId, { at: now, promise });
  promise.catch(() => cache.delete(roomId));
  return promise;
}

/** Vide le cache des aperçus. Exposé pour les tests. */
export function __clearRoomPreviewCache(): void {
  cache.clear();
}

/**
 * L'aperçu d'un salon, au survol de son titre sur la frise : ses
 * participants (initiales dans la couleur de leur groupe), un extrait de son
 * dernier message, son nombre de messages, l'ancienneté du dernier, et son
 * statut s'il n'est pas en cours. Hors de la frise (pas de contexte), le
 * titre reste seul.
 */
export function TimelineRoomPreview({
  roomId,
  status,
  children,
}: {
  roomId: string;
  status: TimelineRoomStatus;
  children: ReactNode;
}) {
  const ctx = useContext(RoomPreviewContext);
  if (!ctx) return <>{children}</>;
  return (
    <HoverCard openDelay={ROOM_PREVIEW_DELAY} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-72 p-3" data-testid="timeline-room-preview">
        <PreviewBody ctx={ctx} roomId={roomId} status={status} />
      </HoverCardContent>
    </HoverCard>
  );
}

function PreviewBody({ ctx, roomId, status }: { ctx: PreviewContext; roomId: string; status: TimelineRoomStatus }) {
  const tv = useTranslations("worlds.timelineView");
  const locale = useLocale();
  const [data, setData] = useState<RoomPreviewData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadRoomPreview(ctx.supabase, roomId).then(
      (d) => { if (alive) setData(d); },
      (e: unknown) => {
        console.error("[TimelineRoomPreview] aperçu", e);
        if (alive) setFailed(true);
      },
    );
    return () => { alive = false; };
  }, [ctx.supabase, roomId]);

  const participants = ctx.participantsOf(roomId);
  const shown = participants.slice(0, 4);
  return (
    <div className="space-y-2.5 text-sm">
      {participants.length > 0 && (
        <div className="flex min-w-0 items-center gap-2.5" data-testid="timeline-room-preview-people">
          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
            {shown.map((p) => (
              <span
                key={p.id}
                className="flex size-6 items-center justify-center rounded-full border-2 bg-muted text-[10px] font-semibold text-foreground"
                style={{ borderColor: p.color ?? "var(--color-border)" }}
              >
                {p.name.trim().charAt(0).toUpperCase()}
              </span>
            ))}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{participants.map((p) => p.name).join(", ")}</span>
        </div>
      )}
      {failed ? null : data === null ? (
        <div className="space-y-1.5" aria-busy="true" data-testid="timeline-room-preview-loading">
          <span className="block h-3 w-full animate-pulse rounded bg-muted" />
          <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          {data.excerpt ? (
            <p className="line-clamp-3 italic text-foreground/90">{tv("previewQuote", { text: data.excerpt })}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{tv("previewEmpty")}</p>
          )}
          {data.count > 0 && (
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <MessageCircle className="size-3 shrink-0" aria-hidden />
              {tv("previewMessages", { count: data.count })}
              {data.lastAt && (
                <>
                  <span aria-hidden>·</span>
                  {tv("previewLast", { when: relativeTime(data.lastAt, locale, tv("previewJustNow"), Date.now(), 365) })}
                </>
              )}
            </p>
          )}
        </>
      )}
      {status !== "active" && <p className="text-xs text-muted-foreground">{tv(`roomStatus.${status}`)}</p>}
    </div>
  );
}
