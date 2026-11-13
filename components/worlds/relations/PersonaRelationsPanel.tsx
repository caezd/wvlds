"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLeft, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { CountPip } from "@/components/ui/count-pip";
import { SectionLabel } from "@/components/ui/section-label";
import { TAB_BAR_TRIGGER_CLASS } from "@/components/ui/tab-bar";
import { getInitials } from "@/lib/textFormatting";
import { RelationRow } from "./RelationRow";
import type { CMember, CPersona, CRelType, CRelation } from "./types";
import { buttonVariants } from "@/components/ui/button";

/** Type de relation de repli, quand une relation pointe un type disparu. */
export const FALLBACK_TYPE: Omit<CRelType, "name"> = { id: "__fallback__", color: "#94a3b8", dash: "3 4", sort_index: 999, mutual: false, marital_status: null };

/**
 * Le détail d'un persona : ses relations, dans les deux sens.
 *
 * Le même panneau sert de colonne latérale sur grand écran et de page entière
 * sur mobile — ils divergeaient à chaque ajout tant qu'ils étaient écrits
 * deux fois. Une relation réciproque acceptée existe dans les deux sens ; elle
 * ne paraît qu'une fois, dans « Vers les autres », marquée ⇄.
 */
export function PersonaRelationsPanel({
  persona,
  owner,
  relations,
  personaMap,
  relTypeMap,
  userId,
  canAdmin,
  onClose,
  closeLabel,
  closeIcon = "close",
  onAdd,
  onEdit,
  onUpdateDesc,
  onDelete,
  onAccept,
  onHoverRelation,
}: {
  persona: CPersona;
  owner: CMember | undefined;
  relations: CRelation[];
  personaMap: Map<string, CPersona>;
  relTypeMap: Map<string, CRelType>;
  userId: string;
  canAdmin: boolean;
  onClose: () => void;
  closeLabel: string;
  closeIcon?: "close" | "back";
  onAdd?: () => void;
  onEdit: (rel: CRelation) => void;
  onUpdateDesc: (id: string, description: string) => void;
  onDelete: (id: string) => void;
  onAccept: (id: string) => void;
  onHoverRelation?: (id: string | null) => void;
}) {
  const t = useTranslations("relations");
  const [tab, setTab] = React.useState<"out" | "in">("out");
  React.useEffect(() => { setTab("out"); }, [persona.id]);

  const fallback: CRelType = { ...FALLBACK_TYPE, name: t("unknown") };
  const isMine = persona.user_id === userId;
  const canEdit = canAdmin || isMine;

  type Item = { rel: CRelation; direction: "→" | "←"; other: CPersona; mutual: boolean };
  const acceptedKeys = new Set(relations.filter((r) => r.status === "accepted").map((r) => `${r.from_persona_id}|${r.to_persona_id}|${r.type}`));
  const out: Item[] = [];
  const incoming: Item[] = [];
  for (const rel of relations) {
    if (rel.from_persona_id === persona.id) {
      const other = personaMap.get(rel.to_persona_id);
      if (!other) continue;
      const mutual = rel.status === "accepted" && acceptedKeys.has(`${rel.to_persona_id}|${rel.from_persona_id}|${rel.type}`);
      out.push({ rel, direction: "→", other, mutual });
    } else if (rel.to_persona_id === persona.id) {
      const other = personaMap.get(rel.from_persona_id);
      if (!other) continue;
      const mutual = rel.status === "accepted" && acceptedKeys.has(`${rel.to_persona_id}|${rel.from_persona_id}|${rel.type}`);
      if (!mutual) incoming.push({ rel, direction: "←", other, mutual });
    }
  }
  const items = tab === "out" ? out : incoming;
  const pendingIn = incoming.filter((i) => i.rel.status === "pending").length;

  const grouped = new Map<string, Item[]>();
  for (const item of items) {
    if (!grouped.has(item.rel.type)) grouped.set(item.rel.type, []);
    grouped.get(item.rel.type)!.push(item);
  }
  const sortedTypes = [...grouped.keys()].sort(
    (a, b) => (relTypeMap.get(a)?.sort_index ?? 999) - (relTypeMap.get(b)?.sort_index ?? 999),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
        {closeIcon === "back" && (
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={closeLabel}>
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {persona.avatar_url
          ? <Image src={persona.avatar_url} alt={persona.name} width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
          : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs-plus font-bold">{getInitials(persona.name)}</div>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{persona.name}</p>
          {owner?.username && <p className="text-xs-plus text-muted-foreground">@{owner.username}</p>}
        </div>
        {canEdit && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label={t("addRelation")}
            title={t("addRelation")}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
        {closeIcon === "close" && (
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={closeLabel}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div role="tablist" className="flex border-b border-border">
        {(["out", "in"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-state={tab === key ? "active" : "inactive"}
            onClick={() => setTab(key)}
            className={cn(TAB_BAR_TRIGGER_CLASS, "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs-plus")}
          >
            {key === "out" ? t("tabOut") : t("tabIn")}
            {key === "in" && pendingIn > 0 && (
              <CountPip count={pendingIn} title={t("pendingCount", { count: pendingIn })} />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {items.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">{t("noRelations")}</p>
        ) : sortedTypes.map((tid) => {
          const meta = relTypeMap.get(tid) ?? fallback;
          return (
            <section key={tid} className="space-y-2">
              <SectionLabel className="flex items-center gap-1.5" style={{ color: meta.color }}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                {meta.name}
              </SectionLabel>
              {grouped.get(tid)!.map(({ rel, direction, other, mutual }) => {
                const rowEditable = canAdmin || (direction === "→" ? isMine : other.user_id === userId);
                return (
                  <RelationRow
                    key={rel.id}
                    rel={rel}
                    other={other}
                    direction={mutual ? "⇄" : direction}
                    canEdit={rowEditable}
                    // Répondre revient au joueur du persona visé, à lui seul (migration 174).
                    canRespond={rel.status === "pending" && direction === "←" && isMine}
                    onDelete={onDelete}
                    onAccept={onAccept}
                    onEdit={rowEditable && rel.status !== "pending" ? () => onEdit(rel) : undefined}
                    onUpdateDesc={onUpdateDesc}
                    onHoverChange={onHoverRelation}
                  />
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
