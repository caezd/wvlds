"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowRightLeft, ArrowUp, Loader2, Plus, SendHorizontal, X, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchWorldMembers, type WorldMemberRow } from "@/lib/worldMembers";
import {
  currentPlayerId,
  fetchChatroomPlayerIds,
  moveInOrder,
  removeTurn,
  saveTurn,
  turnAdvanceMode,
  TURN_ADVANCE_MODES,
  type ChatroomTurn,
  type TurnAdvanceMode,
} from "@/lib/chatroomTurns";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MODES: Record<TurnAdvanceMode, { icon: LucideIcon; title: string; description: string }> = {
  message: { icon: SendHorizontal, title: "turnModeMessageTitle", description: "turnModeMessageDescription" },
  manual: { icon: ArrowRightLeft, title: "turnModeManualTitle", description: "turnModeManualDescription" },
};

/**
 * Réglage de l'ordre de passage d'un salon : l'activer, choisir quand le tour
 * passe (premier message, ou le joueur passe la main), ranger les joueurs
 * (invités ou participants du salon), le retirer. Réservé au créateur du salon et à qui gère
 * les salons — la base le vérifie (policies de `chatroom_turns`).
 */
export function ChatroomTurnDialog({
  open,
  onOpenChange,
  chatId,
  worldId,
  ownerId,
  turn,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  worldId: string;
  ownerId: string | null;
  turn: ChatroomTurn | null;
  onSaved: (turn: ChatroomTurn | null) => void;
}) {
  const t = useTranslations("chatrooms");
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<WorldMemberRow[] | null>(null);
  const [playerIds, setPlayerIds] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState(true);
  const [advanceMode, setAdvanceMode] = useState<TurnAdvanceMode>("message");
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // À chaque ouverture : l'état enregistré, les membres (pour les noms) et
  // les joueurs du salon (seuls proposés à l'ajout).
  useEffect(() => {
    if (!open) return;
    setEnabled(turn?.enabled ?? true);
    setAdvanceMode(turnAdvanceMode(turn));
    setOrder(turn?.order_user_ids ?? []);
    let annule = false;
    void Promise.all([fetchWorldMembers(supabase, worldId, ownerId), fetchChatroomPlayerIds(supabase, chatId)]).then(
      ([rows, ids]) => {
        if (annule) return;
        setPlayerIds(new Set(ids));
        setMembers(rows);
      },
    );
    return () => {
      annule = true;
    };
  }, [open, turn, supabase, worldId, ownerId, chatId]);

  const nom = (id: string) => members?.find((m) => m.user_id === id)?.username ?? "…";
  const disponibles = (members ?? []).filter((m) => playerIds.has(m.user_id) && !order.includes(m.user_id));

  async function enregistrer() {
    setSaving(true);
    // Le joueur courant garde son tour s'il est toujours dans la liste.
    const courant = currentPlayerId(turn);
    const index = courant ? Math.max(0, order.indexOf(courant)) : 0;
    const res = await saveTurn(supabase, chatId, { enabled, advance_mode: advanceMode, order_user_ids: order, current_index: index });
    setSaving(false);
    if (res.error || !res.turn) {
      toast.error(t("turnSaveFailed"), { description: res.error });
      return;
    }
    onSaved(res.turn);
    onOpenChange(false);
  }

  async function retirer() {
    setSaving(true);
    const res = await removeTurn(supabase, chatId);
    setSaving(false);
    if (res.error) {
      toast.error(t("turnSaveFailed"), { description: res.error });
      return;
    }
    onSaved(res.turn);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("turnTitle")}</DialogTitle>
          <DialogDescription>{t("turnDescription")}</DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between gap-3 text-sm">
          {t("turnEnabled")}
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t("turnEnabled")} />
        </label>

        <fieldset className="space-y-2">
          <SectionLabel as="legend" className="mb-2">{t("turnModeLabel")}</SectionLabel>
          <div role="radiogroup" aria-label={t("turnModeLabel")} className="grid gap-2 sm:grid-cols-2">
            {TURN_ADVANCE_MODES.map((mode) => {
              const { icon: Icon, title, description } = MODES[mode];
              const active = mode === advanceMode;
              return (
                <InteractiveCard
                  key={mode}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAdvanceMode(mode)}
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
                    <span className="block text-sm font-semibold">{t(title)}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">{t(description)}</span>
                  </span>
                </InteractiveCard>
              );
            })}
          </div>
        </fieldset>

        {members === null ? (
          <div className="flex justify-center py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            <ol className="space-y-1" data-testid="turn-order">
              {order.length === 0 && <li className="text-sm text-muted-foreground">{t("turnEmpty")}</li>}
              {order.map((id, i) => (
                <li key={id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{nom(id)}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0}
                    onClick={() => setOrder((o) => moveInOrder(o, i, -1))} aria-label={t("turnMoveUp")}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === order.length - 1}
                    onClick={() => setOrder((o) => moveInOrder(o, i, 1))} aria-label={t("turnMoveDown")}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setOrder((o) => o.filter((x) => x !== id))} aria-label={t("turnRemovePlayer")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ol>
            {disponibles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {disponibles.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    data-testid="turn-candidate"
                    onClick={() => setOrder((o) => [...o, m.user_id])}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    {m.username ?? "?"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {turn?.enabled ? (
            <Button type="button" variant="ghost" onClick={() => void retirer()} disabled={saving}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive">
              {t("turnRemove")}
            </Button>
          ) : <span />}
          <Button type="button" onClick={() => void enregistrer()} disabled={saving || members === null}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("turnSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
