"use client";

import { Eye, Lock, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { InteractiveCard } from "@/components/ui/interactive-card";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";
import { CHATROOM_VISIBILITIES, type ChatroomVisibility } from "@/lib/chatroomAccess";

const ICONS: Record<ChatroomVisibility, LucideIcon> = {
  open: Users,
  public: Eye,
  private: Lock,
};

/**
 * Qui lit et qui écrit dans un salon : trois cartes, une seule enfoncée.
 * Partagé par la création d'un salon et ses réglages.
 */
export function ChatroomVisibilityField({
  value,
  onChange,
  disabled,
}: {
  value: ChatroomVisibility;
  onChange: (v: ChatroomVisibility) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("chatrooms.access");
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <SectionLabel as="legend" className="mb-2">{t("visibility")}</SectionLabel>
      <div role="radiogroup" aria-label={t("visibility")} className="grid gap-2 sm:grid-cols-3">
        {CHATROOM_VISIBILITIES.map((v) => {
          const Icon = ICONS[v];
          const active = v === value;
          return (
            <InteractiveCard
              key={v}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              className={cn(
                "flex items-start gap-3 p-3 sm:flex-col sm:items-center sm:gap-2 sm:px-3 sm:py-4 sm:text-center",
                active && "border-foreground bg-background",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full",
                  active ? "bg-muted text-foreground" : "bg-background text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-semibold">{t(`${v}.title`)}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{t(`${v}.description`)}</span>
              </span>
            </InteractiveCard>
          );
        })}
      </div>
    </fieldset>
  );
}
