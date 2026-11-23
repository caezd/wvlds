"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";
import { toWebP } from "@/lib/imageUtils";
import { STORAGE_CACHE_CONTROL, nomDeFichierUnique } from "@/lib/storagePaths";
import { ANNOUNCEMENT_LABELS, announcementImagePath, type AnnouncementLabel } from "@/lib/worldAnnouncements";
import { ToggleItem, ToggleList } from "@/components/worlds/settings/FeatureLayout";
import type { VariantProps } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ANNOUNCEMENT_LABEL_ICON, ANNOUNCEMENT_LABEL_TONE } from "./AnnouncementLabelBadge";

/** Un choix d'étiquette : la pastille, en plus grand ; la choisie est cerclée. */
function labelOption(selected: boolean, tone: VariantProps<typeof badgeVariants>["tone"]) {
  return cn(
    badgeVariants({ tone }),
    "h-7 cursor-pointer px-2.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : "opacity-55 hover:opacity-100",
  );
}

/** Les options d'une annonce telles que le formulaire les tient (migration 235). */
export type AnnouncementExtrasValue = {
  label: AnnouncementLabel | null;
  imageUrl: string | null;
  showOnHome: boolean;
  pinned: boolean;
};

export const EMPTY_EXTRAS: AnnouncementExtrasValue = { label: null, imageUrl: null, showOnHome: false, pinned: false };

/** Envoie l'image recadrée dans le bucket `worlds`, sous le préfixe de l'auteur. */
async function envoyerImage(userId: string, blob: Blob): Promise<string> {
  if (blob.size > 5 * 1024 * 1024) throw new Error("too_large");
  const supabase = createClient();
  const webp = await toWebP(new File([blob], "annonce.png", { type: blob.type || "image/png" }));
  const path = announcementImagePath(userId, nomDeFichierUnique("webp"));
  const { error } = await supabase.storage
    .from("worlds")
    .upload(path, webp, { cacheControl: STORAGE_CACHE_CONTROL, contentType: webp.type });
  if (error) throw error;
  return supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl;
}

/**
 * Étiquette, image d'en-tête, affichage sur l'accueil et épingle : les mêmes
 * champs à l'envoi et à la modification d'une annonce.
 */
export function AnnouncementExtrasFields({
  value,
  onChange,
  onUploaded,
}: {
  value: AnnouncementExtrasValue;
  onChange: (next: AnnouncementExtrasValue) => void;
  /** Une image vient d'être téléversée (voir `useAnnouncementImageDrafts`). */
  onUploaded?: (url: string) => void;
}) {
  const t = useTranslations("worlds.announcements");
  const tLabels = useTranslations("worlds.announcements.labels");
  const tCommon = useTranslations("common");
  const { userId } = useCurrentUser();
  const [uploading, setUploading] = React.useState(false);
  const set = (patch: Partial<AnnouncementExtrasValue>) => onChange({ ...value, ...patch });

  async function onImage(blob: Blob) {
    if (!userId) return;
    setUploading(true);
    try {
      const url = await envoyerImage(userId, blob);
      onUploaded?.(url);
      set({ imageUrl: url });
    } catch (e) {
      console.error("[AnnouncementExtrasFields] image", e);
      toast.error(tCommon("uploadError"));
      throw e;
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="announcement-extras">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("labelTitle")}</p>
        {/* Les choix ont l'allure de l'étiquette elle-même : icône et ton. */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("labelTitle")}>
          <button
            type="button"
            aria-pressed={value.label === null}
            onClick={() => set({ label: null })}
            data-testid="announcement-label-option"
            data-label="none"
            className={labelOption(value.label === null, "outline")}
          >
            {t("labelNone")}
          </button>
          {ANNOUNCEMENT_LABELS.map((l) => {
            const Icon = ANNOUNCEMENT_LABEL_ICON[l];
            return (
              <button
                key={l}
                type="button"
                aria-pressed={value.label === l}
                onClick={() => set({ label: l })}
                data-testid="announcement-label-option"
                data-label={l}
                className={labelOption(value.label === l, ANNOUNCEMENT_LABEL_TONE[l])}
              >
                <Icon aria-hidden />
                {tLabels(l)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("imageTitle")}</p>
        <ImagePickerCropField
          aspect={16 / 7}
          uploading={uploading}
          previewSrc={value.imageUrl}
          previewClassName="aspect-[16/7] w-full rounded-md"
          changeLabel={t("imageChange")}
          onConfirm={onImage}
        />
        {value.imageUrl && (
          <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => set({ imageUrl: null })}>
            {t("imageRemove")}
          </Button>
        )}
      </div>

      <ToggleList>
        <ToggleItem
          title={t("showOnHome")}
          help={t("showOnHomeHelp")}
          checked={value.showOnHome}
          onCheckedChange={(v) => set({ showOnHome: v, pinned: v ? value.pinned : false })}
        />
        <ToggleItem
          title={t("pinned")}
          help={t("pinnedHelp")}
          checked={value.pinned}
          disabled={!value.showOnHome}
          dimmed={!value.showOnHome}
          indent
          onCheckedChange={(v) => set({ pinned: v })}
        />
      </ToggleList>
    </div>
  );
}
