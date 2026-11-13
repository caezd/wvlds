import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { MiniAvatarStack, type MiniFace } from "./MiniAvatarStack";

/** Le sens d'une carte : sa teinte d'icône, et son fond quand le filtre est actif. */
export type PersonaStatTone = "success" | "warning" | "info" | "npc" | "online";

const ICON_TONES: Record<PersonaStatTone, string> = {
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  npc: "text-npc",
  online: "text-online",
};

const ACTIVE_TONES: Record<PersonaStatTone, string> = {
  success: "border-success/50 bg-success/10",
  warning: "border-warning/50 bg-warning/10",
  info: "border-info/50 bg-info/10",
  npc: "border-npc/50 bg-npc/10",
  online: "border-online/50 bg-online/10",
};

export type PersonaStatCard = {
  key: string;
  label: string;
  icon: LucideIcon;
  value: number;
  faces: MiniFace[];
  /** Le filtre que la carte pose est actif. */
  active: boolean;
  tone?: PersonaStatTone;
  onToggle: () => void;
};

/**
 * Les chiffres du monde en tête de liste. Chaque carte est un raccourci : un
 * clic pose le filtre correspondant, un second le retire.
 */
export function PersonaStatCards({ cards, neutral = false }: { cards: PersonaStatCard[]; /** Fond et contour neutres, même actifs : seule l'icône garde sa teinte. */ neutral?: boolean }) {
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <InteractiveCard
            key={c.key}
            active={c.active}
            onClick={c.onToggle}
            className={cn(
              "flex flex-col gap-2 px-4 py-3.5",
              c.active && (neutral ? "border-muted-foreground bg-muted/60" : c.tone ? ACTIVE_TONES[c.tone] : "border-primary/50 bg-primary/10"),
            )}
          >
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className={cn("h-3 w-3 shrink-0", c.tone && ICON_TONES[c.tone])} aria-hidden />
              <span className="truncate">{c.label}</span>
            </span>
            <span className="text-2xl font-bold tabular-nums leading-none text-foreground">{c.value}</span>
            <span className="flex h-[22px]">
              <MiniAvatarStack faces={c.faces} max={6} />
            </span>
          </InteractiveCard>
        );
      })}
    </div>
  );
}
