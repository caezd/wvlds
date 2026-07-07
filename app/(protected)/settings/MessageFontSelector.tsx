"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateMessageFont } from "./actions";

const MESSAGE_FONTS = ["sans", "serif", "dyslexic"] as const;

export function MessageFontSelector({ currentFont }: { currentFont: string }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(font: string) {
    if (font === currentFont) return;
    startTransition(async () => {
      const result = await updateMessageFont(font);
      if (result?.success) {
        toast.success(t("fontSaved"));
        router.refresh();
      } else if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {MESSAGE_FONTS.map((font) => {
        const active = currentFont === font;
        return (
          <button
            key={font}
            type="button"
            aria-pressed={active}
            disabled={isPending}
            onClick={() => handleChange(font)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
              active
                ? "border-primary/40 bg-primary/10"
                : "border-border-soft hover:bg-muted/60",
            )}
          >
            <p
              className={cn(
                "text-base leading-snug",
                font === "serif" && "font-message-serif",
                font === "dyslexic" && "font-message-dyslexic",
              )}
            >
              {t("fontPreview")}
            </p>
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {t(`fontOptions.${font}`)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
