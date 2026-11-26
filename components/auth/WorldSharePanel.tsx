import Image from "next/image";
import { useTranslations } from "next-intl";
import { Hash, Lock, Users } from "lucide-react";

import Logo from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import type { SharePreview } from "@/lib/sharePreview";

/**
 * Colonne droite des écrans de connexion quand on arrive par le lien d'un
 * monde public (`?next=/w/…` ou `/c/…`, cf. lib/sharePreview) : la bannière
 * du monde en fond, et le monde lisible en bas — icône, nom, description,
 * membres, et le salon visé s'il est ouvert ou public.
 *
 * Sans bannière, la couleur du monde ; sans couleur, le fond de l'application.
 * Un monde 18+ n'a ni description ni image : la base ne les envoie pas. Un
 * monde privé, son nom seul : un cadenas, « Monde privé · sur invitation ».
 */
export function WorldSharePanel({ preview }: { preview: SharePreview }) {
  const t = useTranslations("auth.share");
  const fond = preview.bannerUrl
    ? { backgroundImage: `url(${JSON.stringify(preview.bannerUrl)})` }
    : preview.color
      ? { backgroundColor: preview.color }
      : undefined;

  return (
    <div
      data-testid="world-share-panel"
      className="relative flex min-h-72 w-full flex-col bg-cover bg-center md:min-h-0"
      style={fond}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-background from-[8%] via-background/75 to-background/35" />
      <div className="relative flex w-full flex-1 flex-col px-4 py-8 md:px-14 md:py-14">
        <Logo height={32} accent="#F94B5F" className="w-fit text-foreground" />
        <div className="mt-auto pt-10">
          {preview.isPrivate ? (
            <span className="flex size-16 items-center justify-center rounded-2xl bg-muted md:size-[72px]">
              <Lock className="size-8 text-accent" aria-hidden />
            </span>
          ) : (
            preview.iconUrl && (
              <Image
                src={preview.iconUrl}
                alt=""
                width={72}
                height={72}
                className="size-16 rounded-2xl object-cover shadow-lg md:size-[72px]"
              />
            )
          )}
          <div className="mt-5 flex items-center gap-2">
            <SectionLabel as="p">{preview.isPrivate ? t("privateWorld") : t("publicWorld")}</SectionLabel>
            {preview.ageRestricted && <Badge tone="accent">{t("ageRestricted")}</Badge>}
          </div>
          <h2 className="mt-1.5 text-3xl font-bold leading-tight text-foreground md:text-4xl">{preview.name}</h2>
          {preview.description && (
            <p className="mt-2.5 line-clamp-4 text-base text-foreground">{preview.description}</p>
          )}
          {!preview.isPrivate && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Badge>
                <Users aria-hidden />
                {t("members", { count: preview.memberCount })}
              </Badge>
            </div>
          )}
          {preview.chatroomName && (
            <p className="mt-4 flex items-center gap-1.5 text-sm text-foreground">
              <Hash className="size-4 text-accent" aria-hidden />
              {preview.chatroomName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
