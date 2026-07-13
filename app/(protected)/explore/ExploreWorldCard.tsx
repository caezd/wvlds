"use client";

import { useState } from "react";
import Image from "next/image";
import { Camera, Globe, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { WorldStatsDialog } from "./WorldStatsDialog";

export type PublicWorld = {
  id: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  icon_url: string | null;
  color: string | null;
  allows_real_avatars: boolean | null;
  allows_illustrated_avatars: boolean | null;
  is_age_restricted: boolean | null;
};

export function ExploreWorldCard({ world, tags }: { world: PublicWorld; tags: string[] }) {
  const t = useTranslations("explore");
  const [open, setOpen] = useState(false);
  const hasAvatarType = world.allows_real_avatars || world.allows_illustrated_avatars;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="group relative h-72 cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg"
      >
        {/* Calque image : plein cadre, taille et position fixes. Le panneau
            blanc grandit par-dessus au survol, l'image ne bouge pas. */}
        <div className="absolute inset-0">
          {world.banner_url ? (
            <Image
              src={world.banner_url}
              alt=""
              fill
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: world.color ?? "hsl(var(--card))" }}
            >
              {world.icon_url ? (
                <Image src={world.icon_url} alt="" width={56} height={56} className="h-14 w-14 rounded-xl object-cover shadow" />
              ) : (
                <Globe size={40} className="text-white/60" />
              )}
            </div>
          )}
          {world.is_age_restricted && (
            <span className="absolute right-2 top-2 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              {t("ageRestrictedBadge")}
            </span>
          )}
        </div>

        {/* Panneau blanc ancré en bas, posé au-dessus de l'image. Sa hauteur
            croît vers le haut au survol (titre toujours visible, description et
            tags révélés). */}
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-2xl bg-card px-4 pb-4 pt-3">
          {/* Toujours visible : icône + titre */}
          <div className="flex items-center gap-2">
            {world.icon_url && (
              <Image src={world.icon_url} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-md object-cover" />
            )}
            <h3 className="truncate text-base font-bold leading-tight text-foreground">
              {world.name}
            </h3>
          </div>

          {/* Révélé au survol : description + tags */}
          <div className="max-h-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:max-h-48 group-hover:opacity-100">
            <div className="mt-3 border-t border-border pt-3">
              {world.description ? (
                <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                  {world.description}
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground/60">{t("noDescription")}</p>
              )}

              {(tags.length > 0 || hasAvatarType) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                  {world.allows_real_avatars && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Camera className="h-2.5 w-2.5" />
                      {t("avatarReal")}
                    </span>
                  )}
                  {world.allows_illustrated_avatars && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Palette className="h-2.5 w-2.5" />
                      {t("avatarIllustrated")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <WorldStatsDialog world={world} tags={tags} open={open} onOpenChange={setOpen} />
    </>
  );
}
