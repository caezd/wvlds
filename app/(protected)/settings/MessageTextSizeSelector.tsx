"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateMessageTextSize } from "./actions";

const TEXT_SIZES = ["sm", "base", "lg"] as const;

const PREVIEW_TEXT_CLASS: Record<(typeof TEXT_SIZES)[number], string> = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

export function MessageTextSizeSelector({ currentSize }: { currentSize: string }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(size: string) {
    if (size === currentSize) return;
    startTransition(async () => {
      const result = await updateMessageTextSize(size);
      if (result?.success) {
        toast.success(t("textSizeSaved"));
        router.refresh();
      } else if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {TEXT_SIZES.map((size) => {
        const active = currentSize === size;
        return (
          <button
            key={size}
            type="button"
            aria-pressed={active}
            disabled={isPending}
            onClick={() => handleChange(size)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
              active
                ? "border-primary/40 bg-primary/10"
                : "border-border-soft hover:bg-muted/60",
            )}
          >
            <p className={cn("leading-snug", PREVIEW_TEXT_CLASS[size])}>
              {t("textSizePreview")}
            </p>
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {t(`textSizeOptions.${size}`)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
