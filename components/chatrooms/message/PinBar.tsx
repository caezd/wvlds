"use client";

import { useEffect, useRef, useState } from "react";
import { Anchor } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import type { ChatPin, ChatMessageWithPersona } from "@/types/db";
import DateDisplay from "@/components/date-display";

function excerpt(content: string | null | undefined, max = 60): string {
  if (!content) return "";
  if (content.startsWith("{")) return "";
  return content.length > max ? content.slice(0, max).trimEnd() + "…" : content;
}

// Longueur du texte → largeur du tiret en px (5–20px, saturé à 50 caractères)
function tickWidth(text: string, hovered: boolean): number {
  const MIN = 5, MAX = 20, HOVER_BONUS = 4, SCALE = 50;
  const base = Math.round(MIN + Math.min(text.length / SCALE, 1) * (MAX - MIN));
  return hovered ? Math.min(base + HOVER_BONUS, MAX + HOVER_BONUS) : base;
}

function PinCard({
  pin,
  message,
  highlighted,
}: {
  pin: ChatPin;
  message?: ChatMessageWithPersona;
  highlighted?: boolean;
}) {
  const isAnchor = !!pin.label;
  const label = pin.label ?? excerpt(message?.content);
  const personaName = message?.persona?.name ?? null;
  const avatarUrl = message?.persona?.avatar_url ?? null;
  const date = message?.created_at ?? pin.created_at;

  return (
    <div className={cn(
      "flex flex-col gap-1.5 p-3 rounded-lg border transition-colors cursor-pointer",
      highlighted
        ? "border-primary/30 bg-primary/8"
        : "border-border-soft bg-card hover:bg-secondary/50",
    )}>
      <div className="flex items-start gap-2">
        {isAnchor ? (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <Anchor className="h-3 w-3 text-muted-foreground" />
          </div>
        ) : (
          <AvatarWithFrame
            src={avatarUrl}
            alt={personaName ?? ""}
            fallback={personaName?.[0] ?? "?"}
            size={24}
          />
        )}
        <div className="flex flex-col gap-0.5 min-w-0">
          {personaName && (
            <span className="text-xs font-medium truncate">{personaName}</span>
          )}
          {label && (
            <span className="text-xs text-muted-foreground leading-snug line-clamp-2">
              {label}
            </span>
          )}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground/60 pl-8">
        <DateDisplay value={date} />
      </div>
    </div>
  );
}

export function PinBar({
  pins,
  messages,
  onScrollToMessage,
}: {
  pins: ChatPin[];
  messages: ChatMessageWithPersona[];
  onScrollToMessage: (messageId: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setHovered(true);
  };
  const onLeave = () => {
    hideTimerRef.current = setTimeout(() => setHovered(false), 120);
  };

  useEffect(() => {
    if (!hoveredPinId || !listRef.current) return;
    const card = listRef.current.querySelector(`[data-pin-id="${hoveredPinId}"]`);
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hoveredPinId]);

  if (pins.length === 0) return null;

  const messageById = new Map(messages.map((m) => [m.id, m]));

  return (
    // pointer-events-none sur le container pour ne pas bloquer le scroll sous la zone vide
    <div className="absolute right-2 top-0 bottom-0 flex items-center z-20 pointer-events-none">
      {/* Popover de cartes — apparaît à gauche de la barre sur survol */}
      <div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={cn(
          "pointer-events-auto absolute right-7 flex flex-col gap-2 w-56 max-h-[70vh] transition-all duration-200",
          hovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none",
        )}
      >
        <div ref={listRef} className="flex flex-col gap-1.5 overflow-y-auto max-h-[70vh] [scrollbar-width:thin] pr-1">
          {pins.map((pin) => (
            <button
              key={pin.id}
              data-pin-id={pin.id}
              type="button"
              className="text-left"
              onClick={() => pin.message_id && onScrollToMessage(pin.message_id)}
            >
              <PinCard
                pin={pin}
                message={pin.message_id ? messageById.get(pin.message_id) : undefined}
                highlighted={hoveredPinId === pin.id}
              />
            </button>
          ))}
        </div>
        <p className="text-center text-[10px] text-muted-foreground/40 select-none">
          {pins.length} épingle{pins.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Barre fixe de tirets — pointer-events-auto ici seulement, hover géré ici */}
      <div
        className="pointer-events-auto flex flex-col items-center justify-center gap-0.5 w-7 h-full py-8 mr-4"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {pins.map((pin, i) => {
          const isAnchor = !!pin.label;
          const isHovered = hoveredPinId === pin.id;
          const text = pin.label ?? excerpt(pin.message_id ? messageById.get(pin.message_id)?.content : undefined);
          const w = tickWidth(text, isHovered);
          return (
            <button
              key={pin.id}
              type="button"
              title={pin.label ?? `Épingle ${i + 1}`}
              onClick={() => pin.message_id && onScrollToMessage(pin.message_id)}
              onMouseEnter={() => setHoveredPinId(pin.id)}
              onMouseLeave={() => setHoveredPinId(null)}
              className="group flex items-center justify-end w-full py-1.5"
            >
              <span
                style={{ width: w }}
                className={cn(
                  "block rounded-full transition-all duration-150",
                  isAnchor
                    ? "h-[3px] bg-primary/70 group-hover:bg-primary"
                    : "h-[2px] bg-muted-foreground/40 group-hover:bg-muted-foreground/80",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
