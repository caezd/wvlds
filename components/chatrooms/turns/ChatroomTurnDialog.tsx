"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchWorldMembers, type WorldMemberRow } from "@/lib/worldMembers";
import { currentPlayerId, moveInOrder, removeTurn, saveTurn, type ChatroomTurn } from "@/lib/chatroomTurns";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Réglage de l'ordre de passage d'un salon : l'activer, ranger les joueurs
 * (membres du monde), le retirer. Réservé au créateur du salon et à qui gère
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
  const [enabled, setEnabled] = useState(true);
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // À chaque ouverture : l'état enregistré, et la liste des membres.
  useEffect(() => {
    if (!open) return;
    setEnabled(turn?.enabled ?? true);
    setOrder(turn?.order_user_ids ?? []);
    let annule = false;
    void fetchWorldMembers(supabase, worldId, ownerId).then((rows) => {
      if (!annule) setMembers(rows);
    });
    return () => {
      annule = true;
    };
  }, [open, turn, supabase, worldId, ownerId]);

  const nom = (id: string) => members?.find((m) => m.user_id === id)?.username ?? "…";
  const disponibles = (members ?? []).filter((m) => !order.includes(m.user_id));

  async function enregistrer() {
    setSaving(true);
    // Le joueur courant garde son tour s'il est toujours dans la liste.
    const courant = currentPlayerId(turn);
    const index = courant ? Math.max(0, order.indexOf(courant)) : 0;
    const res = await saveTurn(supabase, chatId, { enabled, order_user_ids: order, current_index: index });
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
