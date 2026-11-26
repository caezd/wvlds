"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImageIcon, Loader2, Palette, Shapes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
import { ColorPickerButton } from "@/components/worlds/settings/ColorPickerButton";
import { DEFAULT_COLOR_PRESETS } from "@/components/ui/hsv-color-picker";
import { createClient } from "@/lib/supabase/client";
import { isStorableImage, STORED_IMAGE_ACCEPT, toWebP } from "@/lib/imageUtils";
import { storagePathFromUrl } from "@/lib/storage";
import { currencyImagePath, STORAGE_CACHE_CONTROL } from "@/lib/storagePaths";
import { appearanceOf, type CurrencyAppearance, type CurrencyUnit } from "@/lib/worldCurrency";
import { CurrencyMark } from "./Money";

/** Avant conversion : l'image est ramenée à 128 px, mais on ne lit pas n'importe quoi. */
const MAX_SOURCE_MB = 5;
/** L'image s'affiche à la taille du texte : 128 px suffisent, même sur un écran dense. */
const IMAGE_SIZE = 128;

/** Efface l'image d'un palier, si elle vient du dossier `currency/` du monde. Muet en cas d'échec. */
export async function removeCurrencyImage(worldId: string, url: string | undefined) {
  if (!url) return;
  const path = storagePathFromUrl(url, "worlds");
  if (!path || !path.startsWith(`world-${worldId}/currency/`)) return;
  await createClient().storage.from("worlds").remove([path]);
}

/**
 * L'aspect d'un palier de monnaie (migration 265), dans la page Devises : un
 * bouton qui montre la marque actuelle, et sous lui couleur, icône et image.
 * Une image remplace l'icône (et inversement) ; la couleur teinte l'icône, ou
 * l'abréviation quand il n'y a ni icône ni image.
 */
export function CurrencyAppearancePicker({
  worldId,
  unit,
  label,
  onChange,
}: {
  worldId: string;
  /** Le palier tel qu'il est saisi : nom, abréviation, aspect. */
  unit: Pick<CurrencyUnit, "name" | "short"> & CurrencyAppearance;
  /** Le nom affiché du palier (« palier 2 » s'il n'en a pas encore). */
  label: string;
  onChange: (appearance: CurrencyAppearance) => void;
}) {
  const t = useTranslations("worlds.settings.economy.currency");
  const tCommon = useTranslations("common");
  const tIcon = useTranslations("iconPicker");
  const [pendingColor, setPendingColor] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const appearance = appearanceOf(unit);
  const shown = { name: unit.name || label, short: unit.short, value: 1, ...appearance, ...(pendingColor ? { color: pendingColor } : {}) };
  const hasAppearance = Object.keys(appearance).length > 0;

  async function pickImage(file: File) {
    if (!isStorableImage(file) || file.size > MAX_SOURCE_MB * 1024 * 1024) {
      toast.error(tCommon("uploadImageError"));
      return;
    }
    setUploading(true);
    try {
      const converted = await toWebP(file, IMAGE_SIZE);
      const path = currencyImagePath(worldId, converted.type);
      const storage = createClient().storage.from("worlds");
      const { error } = await storage.upload(path, converted, { cacheControl: STORAGE_CACHE_CONTROL, contentType: converted.type });
      if (error) throw error;
      const previous = appearance.image;
      // L'image l'emporte : l'icône est abandonnée, elle ne s'afficherait plus.
      onChange({ ...(appearance.color ? { color: appearance.color } : {}), image: storage.getPublicUrl(path).data.publicUrl });
      await removeCurrencyImage(worldId, previous);
    } catch {
      toast.error(tCommon("uploadError"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 text-muted-foreground"
          aria-label={t("appearance", { name: label })}
        >
          {hasAppearance ? <CurrencyMark unit={shown} className="text-base" /> : <Palette className="size-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium">{t("appearanceTitle", { name: label })}</p>
          <span data-testid="currency-appearance-preview" className="shrink-0 text-lg font-semibold tabular-nums">
            12 <CurrencyMark unit={shown} />
          </span>
        </div>
        <p className="text-xs text-muted-foreground text-pretty">{t("appearanceHelp")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ColorPickerButton
            color={pendingColor ?? appearance.color ?? DEFAULT_COLOR_PRESETS[1].value}
            onChange={setPendingColor}
            onClose={() => {
              if (pendingColor) onChange({ ...appearance, color: pendingColor });
              setPendingColor(null);
            }}
            className="h-9 w-9"
          />
          <LucideIconPicker
            value={appearance.icon ?? ""}
            onChange={(name) => {
              const next = { ...appearance };
              delete next.icon;
              if (name) {
                // Une icône choisie remplace l'image.
                void removeCurrencyImage(worldId, next.image);
                delete next.image;
                next.icon = name;
              }
              onChange(next);
            }}
            trigger={
              <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={tIcon("chooseIcon")}>
                <Shapes className="h-4 w-4" aria-hidden />
              </Button>
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
            {t("appearanceImageButton")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={STORED_IMAGE_ACCEPT}
            aria-label={t("appearanceImage")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void pickImage(file);
            }}
          />
        </div>
        {hasAppearance && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => {
              setPendingColor(null);
              onChange({});
              void removeCurrencyImage(worldId, appearance.image);
            }}
          >
            {t("appearanceReset")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
