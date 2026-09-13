"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Trash2, X } from "lucide-react";

import type { MapPin, MapPinLink } from "@/app/actions/worldMap";

/**
 * Le formulaire d'un lien : son nom, ou sa suppression.
 *
 * Posé au milieu du trait, DANS l'enveloppe transformée comme le segment
 * d'échelle : il suit donc la carte sans un calcul, et se tient à
 * contre-échelle pour rester lisible à tous les agrandissements.
 *
 * La distance n'y figure pas : elle se déduit des positions, et rien ne s'en
 * saisit.
 */
export function LinkEditor({
  link,
  a,
  b,
  onRename,
  onDelete,
  onClose,
}: {
  link: MapPinLink;
  /** Les deux lieux qu'il joint. */
  a: MapPin;
  b: MapPin;
  onRename: (label: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const [draft, setDraft] = React.useState(link.label);

  // Le formulaire vit sur la carte : ses clics ne doivent ni poser un point
  // ni entamer un déplacement.
  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <div
      data-link-editor
      className="absolute z-30"
      style={{
        left: `${(a.x + b.x) / 2}%`,
        top: `${(a.y + b.y) / 2}%`,
        transform: "translate(-50%, calc(-100% - 10px)) scale(var(--pin-inv-scale, 1))",
        transformOrigin: "center bottom",
      }}
      {...stop}
    >
      <div className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-background px-2 py-1 text-xs shadow-xl">
        <input
          autoFocus
          aria-label={t("linkName")}
          placeholder={t("linkName")}
          maxLength={80}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onRename(draft.trim()); }}
          className="w-36 rounded-md border border-border-soft bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          aria-label={tCommon("save")}
          onClick={() => onRename(draft.trim())}
          className="rounded p-0.5 text-primary hover:bg-primary/10"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("deleteLink")}
          onClick={onDelete}
          className="rounded p-0.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={tCommon("close")}
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
