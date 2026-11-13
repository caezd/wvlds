"use client";

import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";

import { getInitials } from "@/lib/textFormatting";
import { Input } from "@/components/ui/input";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";

/**
 * L'identité en tête de « Mon profil » : l'avatar carré (envoyé tout de suite,
 * hors de la barre d'enregistrement), le pseudo à même la ligne, les pronoms dessous.
 */
export function ProfileIdentity({
  avatarUrl,
  uploadingAvatar,
  onAvatarConfirm,
  username,
  onUsernameChange,
  pronounsLine,
}: {
  avatarUrl: string | null;
  uploadingAvatar: boolean;
  onAvatarConfirm: (blob: Blob) => Promise<void>;
  username: string;
  onUsernameChange: (value: string) => void;
  /** Les pronoms choisis, joints par « · » ; `null` s'il n'y en a aucun. */
  pronounsLine: string | null;
}) {
  const t = useTranslations("userProfile");
  return (
    <div className="flex flex-wrap items-center gap-4 px-6 pb-5 pt-2">
      {/* En sélection d'image, le champ prend toute la ligne. */}
      <div className="shrink-0 has-[>div]:basis-full">
        <ImagePickerCropField
          aspect={1}
          uploading={uploadingAvatar}
          previewSrc={avatarUrl}
          previewAlt={username}
          previewClassName="h-[72px] w-[72px] rounded-lg transition-shadow hover:ring-1 hover:ring-ring"
          changeLabel={t("changeAvatar")}
          placeholder={
            <span className="grid h-full w-full place-items-center bg-muted text-2xl font-bold text-muted-foreground">
              {getInitials(username, "?")}
            </span>
          }
          badge={
            <span aria-hidden className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-md bg-black/85 text-white">
              <Camera className="h-[13px] w-[13px]" />
            </span>
          }
          onConfirm={onAvatarConfirm}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor="profile-username" className="text-xs-plus font-medium text-muted-foreground">
          {t("pseudo")}
        </label>
        <Input
          id="profile-username"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder={t("pseudoPlaceholder")}
          maxLength={32}
          className="-ml-2.5 h-9 border-transparent bg-transparent px-2.5 text-lg font-semibold shadow-none hover:border-border focus-visible:border-ring focus-visible:bg-muted"
        />
        <span className="truncate text-xs text-muted-foreground">{pronounsLine ?? t("noPronouns")}</span>
      </div>
    </div>
  );
}
