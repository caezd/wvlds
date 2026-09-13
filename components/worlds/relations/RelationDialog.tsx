"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check, Loader2, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/textFormatting";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REL_W } from "./geometry";
import type { CPersona, CRelType, CRelation } from "./types";

/**
 * Créer ou modifier une relation, dans un dialogue.
 *
 * Le canevas demandait un « mode lien » : cliquer une carte, puis une autre,
 * puis un type — trois gestes dans un ordre à connaître, sans nom de cible
 * visible avant le dernier. Le dialogue montre tout à la fois : de qui, vers
 * qui (une liste qu'on cherche), quel type, et une description. Il sert aussi
 * à la modification, où seuls le type et la description bougent.
 *
 * Un type réciproque le dit : vers le persona d'un autre joueur, ce sera une
 * demande. Le type d'une relation réciproque existante ne se change pas
 * (l'accord de l'autre valait pour ce type) : les types sont alors figés.
 */
export type RelationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: CPersona;
  /** Les personas du monde, cibles possibles (le persona de départ est écarté). */
  personas: CPersona[];
  relTypes: CRelType[];
  myPersonaIds: ReadonlySet<string>;
  canAdmin: boolean;
  /** Relation existante : modification. Absente : création. */
  existing?: { rel: CRelation; to: CPersona } | null;
  onCreate: (input: { toPersonaId: string; typeId: string; description: string | null }) => Promise<boolean>;
  onUpdate: (id: string, patch: { typeId?: string; description?: string | null }) => Promise<boolean>;
};

export function RelationDialog({
  open, onOpenChange, from, personas, relTypes, myPersonaIds, canAdmin, existing, onCreate, onUpdate,
}: RelationDialogProps) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const editing = !!existing;

  const [targetId, setTargetId] = React.useState<string | null>(existing?.to.id ?? null);
  const [typeId, setTypeId] = React.useState<string | null>(existing?.rel.type ?? null);
  const [description, setDescription] = React.useState(existing?.rel.description ?? "");
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Le dialogue reste monté d'une ouverture à l'autre : on repart de la
  // relation reçue, pas de la précédente.
  React.useEffect(() => {
    if (!open) return;
    setTargetId(existing?.to.id ?? null);
    setTypeId(existing?.rel.type ?? null);
    setDescription(existing?.rel.description ?? "");
    setQuery("");
  }, [open, existing]);

  const candidates = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return personas
      .filter((p) => p.id !== from.id && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [personas, from.id, query]);

  const target = targetId ? personas.find((p) => p.id === targetId) ?? null : null;
  const existingType = existing ? relTypes.find((tp) => tp.id === existing.rel.type) : null;
  // Réciproque d'un côté ou de l'autre : le type est figé (voir en tête).
  const typeLocked = editing && (!!existingType?.mutual || existing?.rel.status === "pending");
  const selectedType = typeId ? relTypes.find((tp) => tp.id === typeId) ?? null : null;
  const willBeRequest = !editing && !!selectedType?.mutual && !!target && !myPersonaIds.has(target.id) && !canAdmin;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!typeId || saving) return;
    setSaving(true);
    try {
      const desc = description.trim() || null;
      const ok = existing
        ? await onUpdate(existing.rel.id, typeLocked ? { description: desc } : { typeId, description: desc })
        : target ? await onCreate({ toPersonaId: target.id, typeId, description: desc }) : false;
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t("editRelation") : t("newRelation", { name: from.name })}</DialogTitle>
          <DialogDescription className="sr-only">{editing ? t("editRelation") : t("newRelation", { name: from.name })}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Vers qui */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("pickTarget")}</p>
            {editing && existing ? (
              <PersonaLine persona={existing.to} />
            ) : target ? (
              <div className="flex items-center gap-2">
                <PersonaLine persona={target} />
                <button type="button" onClick={() => setTargetId(null)} className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  {t("changeTarget")}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    aria-label={t("searchPlaceholder")}
                    className="h-8 w-full rounded-lg border border-border-soft bg-background pl-8 pr-2 text-xs outline-none focus:border-primary/40"
                  />
                </div>
                <div role="listbox" aria-label={t("pickTarget")} className="max-h-48 overflow-y-auto rounded-lg border border-border-soft">
                  {candidates.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t("noSearchResults")}</p>
                  ) : candidates.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => setTargetId(p.id)}
                      className="flex w-full items-center gap-2.5 border-b border-border-soft px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
                    >
                      <PersonaLine persona={p} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quel type */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("relTypeLabel")}</p>
            {relTypes.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noTypesHint")}</p>
            ) : (
              <div role="radiogroup" aria-label={t("relTypeLabel")} className="grid grid-cols-3 gap-1.5">
                {relTypes.map((tp) => {
                  const active = tp.id === typeId;
                  return (
                    <button
                      key={tp.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={typeLocked && !active}
                      onClick={() => setTypeId(tp.id)}
                      title={tp.mutual ? t("mutualHint") : undefined}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors",
                        active ? "border-current bg-muted/60" : "border-border-soft hover:bg-muted/40",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                      style={{ color: tp.color }}
                    >
                      <svg width="24" height="6" aria-hidden><line x1="0" y1="3" x2="24" y2="3" stroke={tp.color} strokeWidth={REL_W} strokeDasharray={tp.dash || undefined} /></svg>
                      <span className="flex items-center gap-1">
                        {tp.name}
                        {tp.mutual && <span aria-hidden className="text-muted-foreground/70">⇄</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {typeLocked && <p className="text-[11px] text-muted-foreground">{t("typeLockedHint")}</p>}
            {willBeRequest && <p className="text-[11px] text-muted-foreground">{t("willBeRequest", { name: target!.name })}</p>}
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descPlaceholder")}
            aria-label={t("descPlaceholder")}
            rows={3}
            maxLength={5000}
            className="w-full resize-y rounded-lg border border-border-soft bg-background px-3 py-2 text-xs outline-none focus:border-primary/40"
          />

          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || !typeId || (!editing && !target)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {editing ? tCommon("save") : willBeRequest ? t("sendRequest") : tCommon("create")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PersonaLine({ persona }: { persona: CPersona }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {persona.avatar_url
        ? <Image src={persona.avatar_url} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full object-cover" />
        : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold">{getInitials(persona.name)}</span>}
      <span className="truncate text-sm">{persona.name}</span>
    </span>
  );
}
