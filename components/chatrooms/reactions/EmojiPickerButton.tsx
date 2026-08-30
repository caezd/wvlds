"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EMOJI_PICKER_THEME_VARS } from "./emojiPickerTheme";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReactionEmoji } from "./ReactionEmoji";
import { cn } from "@/lib/utils";

const EmojiNativePickerInner = dynamic(
  () => import("./EmojiNativePickerInner"),
  { ssr: false },
);


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
  const tCommon = useTranslations("common");
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
          aria-label={tCommon("pickEmoji")}
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
          style={EMOJI_PICKER_THEME_VARS}
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
