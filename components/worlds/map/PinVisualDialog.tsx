"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ColorSwatchRow } from "@/components/ui/color-swatch-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
import { DEFAULT_PLAYER_COLOR } from "@/lib/playerColors";
import { updateMapPin, type MapPin as MapPinType } from "@/app/actions/worldMap";

// ── Dialog de personnalisation visuelle d'un pin ──────────────────

function getBorderStyles(t: ReturnType<typeof useTranslations<"map">>) {
  return [
    { value: "solid" as const, label: t("borderStyles.solid") },
    { value: "dashed" as const, label: t("borderStyles.dashed") },
    { value: "dotted" as const, label: t("borderStyles.dotted") },
  ];
}

export function PinVisualDialog({
  pin,
  open,
  onOpenChange,
  onUpdated,
}: {
  pin: MapPinType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updated: MapPinType) => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const borderStyles = getBorderStyles(t);
  const isTransparent = (c: string) => !c || c === "transparent";

  const [bgColor, setBgColor] = React.useState(isTransparent(pin.color) ? DEFAULT_PLAYER_COLOR : pin.color);
  const [noBg, setNoBg] = React.useState(isTransparent(pin.color));
  const [iconName, setIconName] = React.useState(pin.icon);
  const [iconColor, setIconColor] = React.useState(pin.icon_color || "#ffffff");
  const [hasBorder, setHasBorder] = React.useState(!!pin.border_color);
  const [borderColor, setBorderColor] = React.useState(pin.border_color || "#ffffff");
  const [borderStyle, setBorderStyle] = React.useState<"solid" | "dashed" | "dotted">(
    (pin.border_style as "solid" | "dashed" | "dotted") || "solid",
  );
  const [saving, setSaving] = React.useState(false);

  // Resync quand le dialog ré-ouvre sur un pin différent
  React.useEffect(() => {
    if (!open) return;
    const transp = isTransparent(pin.color);
    setBgColor(transp ? DEFAULT_PLAYER_COLOR : pin.color);
    setNoBg(transp);
    setIconName(pin.icon);
    setIconColor(pin.icon_color || "#ffffff");
    setHasBorder(!!pin.border_color);
    setBorderColor(pin.border_color || "#ffffff");
    setBorderStyle((pin.border_style as "solid" | "dashed" | "dotted") || "solid");
  }, [open, pin.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    try {
      const patch = {
        color: noBg ? "transparent" : bgColor,
        icon: iconName,
        icon_color: iconColor,
        border_color: hasBorder ? borderColor : null,
        border_style: hasBorder ? borderStyle : "solid",
      };
      await updateMapPin(pin.id, patch);
      onUpdated({ ...pin, ...patch });
      onOpenChange(false);
      toast.success(t("visualUpdated"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  // Échap ferme le panneau. Il est construit à la main plutôt qu'avec `Dialog`,
  // qui s'en chargerait : sans cela, le fond semi-transparent était la SEULE
  // sortie, donc aucune au clavier.
  React.useEffect(() => {
    if (!open) return;
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [open, onOpenChange]);

  const effectiveBg = noBg ? "transparent" : bgColor;
  const previewBorder = hasBorder ? `2px ${borderStyle} ${borderColor}` : "none";
  const previewEmpty = noBg && !hasBorder && !iconName;

  if (!open) return null;

  const panel = (
    <>
      {/* Fond semi-transparent — clic ferme le panel */}
      <div
        className="fixed inset-0 z-modal bg-black/40"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel centré */}
      <div
        className="fixed left-1/2 top-1/2 z-modal-raised w-[360px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background shadow-modal"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("pinVisual")}</h2>
          <button
            type="button"
            aria-label={tCommon("close")}
            onClick={() => onOpenChange(false)}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex flex-col gap-5 p-4">
          {/* Aperçu */}
          <div className="flex items-center justify-center rounded-lg bg-muted/40 py-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
              style={{
                backgroundColor: effectiveBg,
                border: previewBorder || (previewEmpty ? "2px dashed var(--muted-foreground)" : "none"),
              }}
            >
              {iconName && (
                <LazyLucideIcon
                  name={iconName}
                  className="h-6 w-6"
                  style={{ color: iconColor }}
                />
              )}
            </div>
          </div>

          {/* Icône */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("icon")}</span>
              {iconName && (
                <button
                  type="button"
                  onClick={() => setIconName("")}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("removeIcon")}
                </button>
              )}
            </div>
            <LucideIconPicker value={iconName} onChange={setIconName} accent={iconColor} />
          </div>

          {/* Fond : une couleur, ou « Aucun » (transparent) — comme l'encadré du composer. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("background")}</span>
            <ColorSwatchRow
              value={noBg ? "" : bgColor}
              onChange={(c) => {
                setNoBg(c === "");
                if (c) setBgColor(c);
              }}
              chooseLabel={tCommon("chooseColor")}
              noneLabel={t("backgroundNone")}
            />
          </div>

          {/* Couleur de l'icône */}
          {iconName && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("iconColor")}</span>
              <ColorSwatchRow value={iconColor} onChange={setIconColor} chooseLabel={tCommon("chooseColor")} />
            </div>
          )}

          {/* Bordure */}
          <div className="flex flex-col gap-2">
            {/* Une bascule, comme « Arrondi » dans l'encadré ; ses réglages suivent. */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("border")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={hasBorder}
                className="h-6 px-2 text-xs"
                onClick={() => setHasBorder((v) => !v)}
              >
                {t("toggleBorder")}
              </Button>
            </div>

            {hasBorder && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1">
                  {borderStyles.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBorderStyle(value)}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1 text-xs transition-colors",
                        borderStyle === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <ColorSwatchRow value={borderColor} onChange={setBorderColor} chooseLabel={tCommon("chooseColor")} />
              </div>
            )}
          </div>
        </div>

        {/* Pied */}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {tCommon("save")}
          </Button>
        </div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
