"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import type { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ColorPickerButton } from "@/components/worlds/settings/ColorPickerButton";
import type { TimelineArc } from "@/components/worlds/timeline/useTimelineData";

const DEFAULT_ARC_COLOR = "#94a3b8";

/**
 * Les arcs narratifs d'un monde (migration 193) : un nom et une couleur, qui
 * teinte l'anneau de leurs salons et leurs lignes de suite. Supprimer un arc
 * ne supprime aucun salon — il les en détache (`ON DELETE SET NULL`).
 */
export function TimelineArcsDialog({
  open,
  onOpenChange,
  supabase,
  worldId,
  arcs,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supabase: ReturnType<typeof createClient>;
  worldId: string;
  arcs: TimelineArc[];
  onChanged: () => void;
}) {
  const t = useTranslations("worlds.timelineView");
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(DEFAULT_ARC_COLOR);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  async function run(p: PromiseLike<{ error: unknown }>, failure: string) {
    const { error } = await p;
    if (error) {
      toast.error(failure);
      return false;
    }
    onChanged();
    return true;
  }

  async function add() {
    const clean = name.trim();
    if (!clean) return;
    const ok = await run(
      supabase.from(TABLE.WORLD_TIMELINE_ARCS).insert({ world_id: worldId, name: clean, color, position: arcs.length }),
      t("arcSaveFailed"),
    );
    if (ok) {
      setName("");
      setColor(DEFAULT_ARC_COLOR);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("arcsTitle")}</DialogTitle>
          <DialogDescription>{t("arcsHelp")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2" aria-label={t("arcsTitle")}>
          {arcs.map((arc) => (
            <li key={arc.id} className="flex items-center gap-2">
              <ColorPickerButton
                color={arc.color}
                onChange={(c) => void run(
                  supabase.from(TABLE.WORLD_TIMELINE_ARCS).update({ color: c }).eq("id", arc.id),
                  t("arcSaveFailed"),
                )}
                className="h-9 w-9"
              />
              <Input
                defaultValue={arc.name}
                aria-label={t("arcName")}
                maxLength={DB_TEXT_LIMITS["world_timeline_arcs.name"]}
                className="h-9 flex-1"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== arc.name) {
                    void run(
                      supabase.from(TABLE.WORLD_TIMELINE_ARCS).update({ name: next }).eq("id", arc.id),
                      t("arcSaveFailed"),
                    );
                  } else {
                    e.target.value = arc.name;
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              {pendingDelete === arc.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setPendingDelete(null);
                    void run(supabase.from(TABLE.WORLD_TIMELINE_ARCS).delete().eq("id", arc.id), t("arcDeleteFailed"));
                  }}
                >
                  {t("arcDeleteConfirm")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("arcDelete", { name: arc.name })}
                  onClick={() => setPendingDelete(arc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
          {arcs.length === 0 && <li className="text-sm text-muted-foreground">{t("arcsEmpty")}</li>}
        </ul>

        <form
          className="flex items-center gap-2 border-t border-border pt-4"
          onSubmit={(e) => { e.preventDefault(); void add(); }}
        >
          <ColorPickerButton color={color} onChange={setColor} className="h-9 w-9" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("arcNewPlaceholder")}
            aria-label={t("arcNewPlaceholder")}
            maxLength={DB_TEXT_LIMITS["world_timeline_arcs.name"]}
            className="h-9 flex-1"
          />
          <Button type="submit" disabled={!name.trim()}>{t("arcAdd")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
