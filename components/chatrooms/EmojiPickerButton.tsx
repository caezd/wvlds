"use client";

import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReactionEmoji } from "./ReactionEmoji";
import { cn } from "@/lib/utils";

const EmojiNativePickerInner = dynamic(
  () => import("./EmojiNativePickerInner"),
  { ssr: false },
);

const eprThemeVars = {
  "--epr-bg-color": "var(--popover)",
  "--epr-category-label-bg-color": "var(--popover)",
  "--epr-text-color": "var(--foreground)",
  "--epr-hover-bg-color": "var(--accent)",
  "--epr-focus-bg-color": "var(--accent)",
  "--epr-highlight-color": "var(--primary)",
  "--epr-picker-border-color": "var(--border)",
  "--epr-search-border-color": "var(--border)",
  "--epr-search-input-bg-color": "var(--input)",
  "--epr-search-input-bg-color-active": "var(--input)",
  "--epr-search-input-text-color": "var(--foreground)",
  "--epr-search-input-placeholder-color": "var(--muted-foreground)",
  "--epr-category-icon-active-color": "var(--primary)",
  "--epr-active-skin-tone-indicator-border-color": "var(--primary)",
  "--epr-picker-border-radius": "var(--radius)",
} as unknown as CSSProperties;

/**
 * Bouton qui ouvre un emoji picker et retourne l'emoji natif Unicode.
 * À utiliser dans les dialogs de création de blocs (NPC, Météo…).
 */
export function EmojiPickerButton({
  value,
  onChange,
  className,
  emojiStyle = "native",
}: {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
  emojiStyle?: "native" | "twitter";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-center rounded-md border border-input bg-transparent text-base shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
          aria-label="Choisir un emoji"
        >
          {value ? (
            emojiStyle === "twitter" ? (
              <ReactionEmoji value={value} size={20} />
            ) : (
              <span className="leading-none">{value}</span>
            )
          ) : (
            <Smile className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-0 bg-transparent shadow-none z-[200]" align="start">
        <div
          style={eprThemeVars}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <EmojiNativePickerInner
            emojiStyle={emojiStyle}
            onSelect={(emoji) => {
              onChange(emoji);
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
