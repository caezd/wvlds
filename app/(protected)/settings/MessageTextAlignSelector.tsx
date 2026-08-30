"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { messageErreurAction } from "@/lib/actionErrors";
import { cn } from "@/lib/utils";
import { updateMessageTextAlign } from "./actions";

const TEXT_ALIGNS = ["left", "justify"] as const;

export function MessageTextAlignSelector({ currentAlign }: { currentAlign: string }) {
  const t = useTranslations("settings");
  const tCommun = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(align: string) {
    if (align === currentAlign) return;
    startTransition(async () => {
      const result = await updateMessageTextAlign(align);
      if (result?.success) {
        toast.success(t("textAlignSaved"));
        router.refresh();
      } else if (result?.error) {
        toast.error(messageErreurAction(result.error, tCommun));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {TEXT_ALIGNS.map((align) => {
        const active = currentAlign === align;
        return (
          <button
            key={align}
            type="button"
            aria-pressed={active}
            disabled={isPending}
            onClick={() => handleChange(align)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
              active
                ? "border-primary/40 bg-primary/10"
                : "border-border-soft hover:bg-muted/60",
            )}
          >
            <p className={cn("text-sm leading-snug", align === "justify" && "text-justify")}>
              {t("textAlignPreview")}
            </p>
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {t(`textAlignOptions.${align}`)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
