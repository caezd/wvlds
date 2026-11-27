"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { messageErreurAction } from "@/lib/actionErrors";
import { cn } from "@/lib/utils";
import { updateMessageHeaderMode } from "./actions";

const HEADER_MODES = ["subtle", "hidden"] as const;

/** Deux messages d'un même persona, le second sans son en-tête. */
function Apercu({ mode }: { mode: (typeof HEADER_MODES)[number] }) {
  return (
    <div aria-hidden className="flex flex-col gap-1.5 pl-5">
      <div className="mb-0.5 flex items-center gap-1.5">
        <span className="-ml-5 size-3.5 rounded-full bg-muted-foreground/60" />
        <span className="h-1.5 w-10 rounded-full bg-foreground/70" />
      </div>
      <span className="h-1.5 w-full rounded-full bg-muted-foreground/30" />
      <span className="h-1.5 w-4/5 rounded-full bg-muted-foreground/30" />
      <div className="relative mt-2">
        {mode === "subtle" && <span className="absolute top-0 -left-4 size-2.5 rounded-full bg-muted-foreground/60" />}
        <span className="block h-1.5 w-11/12 rounded-full bg-muted-foreground/30" />
      </div>
      <span className="h-1.5 w-3/5 rounded-full bg-muted-foreground/30" />
    </div>
  );
}

export function MessageHeaderModeSelector({ currentMode }: { currentMode: string }) {
  const t = useTranslations("settings");
  const tCommun = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(mode: string) {
    if (mode === currentMode) return;
    startTransition(async () => {
      const result = await updateMessageHeaderMode(mode);
      if (result?.success) {
        toast.success(t("headerModeSaved"));
        router.refresh();
      } else if (result?.error) {
        toast.error(messageErreurAction(result.error, tCommun));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {HEADER_MODES.map((mode) => {
        const active = currentMode === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            disabled={isPending}
            onClick={() => handleChange(mode)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
              active ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted/60",
            )}
          >
            <Apercu mode={mode} />
            <p className={cn("mt-3 text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}>
              {t(`headerModeOptions.${mode}`)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
