"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, ImagePlus, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { isStorableImage, STORED_IMAGE_ACCEPT, toWebP } from "@/lib/imageUtils";
import { storagePathFromUrl } from "@/lib/storage";
import { dieFaceImagePath, STORAGE_CACHE_CONTROL } from "@/lib/storagePaths";
import { cn } from "@/lib/utils";
import {
  MAX_DIE_FACES,
  dieFaceValues,
  faceOf,
  removeFace,
  setFace,
  type DieFace,
  type WorldDie,
} from "@/lib/worldDice";

/** Avant conversion : l'image est ramenée à 256 px, mais on ne lit pas n'importe quoi. */
const MAX_SOURCE_MB = 5;
/** Une face s'affiche en vignette : 256 px suffisent, même sur un écran dense. */
const IMAGE_SIZE = 256;

/** Efface des images de faces, si elles viennent du dossier `dice/` du monde. Muet en cas d'échec. */
export async function removeDieFaceImages(worldId: string, urls: readonly (string | undefined)[]) {
  const paths = urls
    .map((url) => storagePathFromUrl(url, "worlds"))
    .filter((path): path is string => !!path && path.startsWith(`world-${worldId}/dice/`));
  if (!paths.length) return;
  await createClient().storage.from("worlds").remove(paths);
}

/**
 * Les faces d'un dé (migration 272) : une vignette par valeur, où l'on dépose
 * une image ; sous elle, son nombre, que l'on peut masquer. Les changements
 * remontent à la ligne du dé, qui les enregistre d'elle-même.
 */
export function DieFacesDialog({
  open,
  onOpenChange,
  worldId,
  die,
  faces,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worldId: string;
  die: Pick<WorldDie, "name" | "min_value" | "max_value">;
  faces: DieFace[];
  onChange: (faces: DieFace[]) => void;
}) {
  const t = useTranslations("worlds.settings.dice");
  const tChat = useTranslations("chatrooms");
  const tCommon = useTranslations("common");
  const [uploading, setUploading] = React.useState<number | null>(null);
  const values = dieFaceValues(die);

  async function pick(value: number, file: File) {
    if (!isStorableImage(file) || file.size > MAX_SOURCE_MB * 1024 * 1024) {
      toast.error(tCommon("uploadImageError"));
      return;
    }
    setUploading(value);
    try {
      const converted = await toWebP(file, IMAGE_SIZE);
      const path = dieFaceImagePath(worldId, converted.type);
      const storage = createClient().storage.from("worlds");
      const { error } = await storage.upload(path, converted, { cacheControl: STORAGE_CACHE_CONTROL, contentType: converted.type });
      if (error) throw error;
      const previous = faceOf(faces, value);
      onChange(setFace(faces, {
        value,
        image: storage.getPublicUrl(path).data.publicUrl,
        ...(previous?.hide_value ? { hide_value: true } : {}),
      }));
      await removeDieFaceImages(worldId, [previous?.image]);
    } catch {
      toast.error(tCommon("uploadError"));
    } finally {
      setUploading(null);
    }
  }

  function toggleHidden(face: DieFace) {
    const { hide_value, ...rest } = face;
    onChange(setFace(faces, hide_value ? rest : { ...rest, hide_value: true }));
  }

  function clear(face: DieFace) {
    onChange(removeFace(faces, face.value));
    void removeDieFaceImages(worldId, [face.image]);
  }

  const name = die.name.trim() || t("customName");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("facesTitle", { name })}</DialogTitle>
          <DialogDescription>{t("facesHelp")}</DialogDescription>
        </DialogHeader>
        {values ? (
          <ul className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {values.map((value) => {
              const face = faceOf(faces, value);
              const busy = uploading === value;
              return (
                <li key={value} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-2">
                  <label
                    className={cn(
                      "relative grid size-16 cursor-pointer place-items-center overflow-hidden rounded-md bg-muted/40 text-muted-foreground transition-colors hover:bg-muted",
                      "focus-within:ring-2 focus-within:ring-ring",
                    )}
                    title={t("faceImage", { value })}
                  >
                    {face ? (
                      // eslint-disable-next-line @next/next/no-img-element -- vignette déjà réduite au téléversement
                      <img src={face.image} alt={tChat("diceFace", { value })} className="size-full object-contain" />
                    ) : (
                      <ImagePlus className="size-5" aria-hidden />
                    )}
                    {busy && (
                      <span className="absolute inset-0 grid place-items-center bg-background/70">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      </span>
                    )}
                    <input
                      type="file"
                      accept={STORED_IMAGE_ACCEPT}
                      className="sr-only"
                      aria-label={t("faceImage", { value })}
                      disabled={uploading !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void pick(value, file);
                      }}
                    />
                  </label>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      face?.hide_value ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {value}
                  </span>
                  {face && (
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-pressed={!!face.hide_value}
                        aria-label={t("faceHideValue", { value })}
                        title={t("faceHideValue", { value })}
                        onClick={() => toggleHidden(face)}
                      >
                        {face.hide_value ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label={t("faceRemove", { value })}
                        title={t("faceRemove", { value })}
                        onClick={() => clear(face)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("facesTooMany", { max: MAX_DIE_FACES })}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
