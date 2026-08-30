"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Globe, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { WorldStatsDialog } from "./WorldStatsDialog";
import { Hint } from "@/components/ui/hint";
import { ScrollArea } from "@/components/ui/scroll-area";

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

// Dimensions fixes de la carte (en px) — servent à calculer la hauteur du
// hero au survol en fonction du contenu du panneau. h-80=320, p-1=4×2,
// h-40=160 (hero min), p-3=12×2 (padding panneau), gap-2=8 (desc↔tags).
const CARD_INNER_H = 320 - 8;
const HERO_MIN_H = 160;
const PANEL_PADDING = 24;
const PANEL_GAP = 8;
// Marge de sécurité : `scrollHeight` est arrondi à l'entier alors que la
// hauteur réelle du texte est fractionnaire. Sans ce slack, la ScrollArea est
// dimensionnée ~0,5 px trop court → micro-débordement → scrollbar visible même
// pour une description d'une ligne. Quelques px de jeu l'évitent.
const PANEL_SLACK = 6;

export function ExploreWorldCard({ world, tags }: { world: PublicWorld; tags: string[] }) {
  const t = useTranslations("explore");
  const [open, setOpen] = useState(false);
  const hasAvatarType = world.allows_real_avatars || world.allows_illustrated_avatars;

  // Hauteur du hero au survol : le hero rétrécit juste assez pour révéler le
  // panneau à la taille de sa description (+ tags), avec un plancher à h-40.
  // Au-delà, la description défile dans sa ScrollArea.
  const descRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [heroHoverH, setHeroHoverH] = useState(HERO_MIN_H);

  useEffect(() => {
    const desc = descRef.current;
    if (!desc) {
      setHeroHoverH(HERO_MIN_H);
      return;
    }
    const measure = () => {
      const descH = desc.scrollHeight;
      const tagsH = tagsRef.current ? tagsRef.current.offsetHeight + PANEL_GAP : 0;
      const panelNeeded = descH + tagsH + PANEL_PADDING + PANEL_SLACK;
      const maxPanel = CARD_INNER_H - HERO_MIN_H;
      const panel = Math.min(panelNeeded, maxPanel);
      setHeroHoverH(CARD_INNER_H - panel);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(desc);
    if (tagsRef.current) ro.observe(tagsRef.current);
    return () => ro.disconnect();
  }, [world.description, tags]);

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
        className="group flex h-80 cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[shadow,padding] hover:shadow-lg p-1"
        style={{ ["--hero-hover-h" as string]: `${heroHoverH}px` }}
      >
        <div className="flex flex-col h-full group-hover:h-[var(--hero-hover-h)] transition-[height] duration-300">
          {/* Hero plein cadre par défaut, réduit à une vignette au survol pour
            laisser la place au panneau (carte à hauteur fixe) */}
          <div className="relative flex-1 shrink-0 overflow-hidden transition-[height,opacity,scale] duration-300 rounded-xl group-hover:opacity-75">
            {world.banner_url ? (
              // Calque image à hauteur FIXE (≈ hauteur max du hero) : l'échelle
              // `cover` est calculée contre une boîte qui ne change pas de
              // hauteur, donc aucun rescale/zoom quand le hero rétrécit au
              // survol — seul le bas est rogné par overflow-hidden.
              <div
                className="absolute inset-x-0 top-1/2 h-80 -translate-y-1/2 bg-cover bg-center"
                style={{ backgroundImage: `url(${world.banner_url})` }}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ backgroundColor: world.color ?? "hsl(var(--card))" }}
              />
            )}
            <div
              className={
                world.banner_url
                  ? "absolute inset-0 rounded-xl bg-gradient-to-t from-black/60 via-black/10 to-transparent"
                  : "absolute inset-0 rounded-xl bg-gradient-to-tl from-white/5 to-transparent"
              }
            />
            {/* Icône centrée (sans bannière) */}
            {!world.banner_url && (
              <div className="absolute inset-0 flex items-center justify-center">
                {world.icon_url ? (
                  <Image src={world.icon_url} alt="" width={56} height={56} className="h-14 w-14 rounded-xl object-cover shadow" />
                ) : (
                  <Globe size={40} className="text-white" />
                )}
              </div>
            )}

            {/* Type d'avatars révélés au survol */}
            <div className="absolute top-0 right-0 flex p-3 transition-opacity delay-100 duration-300 ease-out gap-2">
              {world.is_age_restricted && (
                <span className="flex items-center rounded-md bg-accent/60 p-1.5 text-[10px] font-bold text-white backdrop-blur-sm">
                  {t("ageRestrictedBadge")}
                </span>
              )}
              {hasAvatarType && world.allows_real_avatars && (
                <span className="flex items-center justify-center rounded-md bg-black/60 p-1.5 text-white backdrop-blur-sm">
                  <Hint content={t("avatarReal").toString()} side="bottom">
                    <Camera className="h-4 w-4" />
                  </Hint>
                </span>
              )}
              {hasAvatarType && world.allows_illustrated_avatars && (
                <span className="flex items-center justify-center rounded-md bg-black/60 p-1.5 text-white backdrop-blur-sm">
                  <Hint content={t("avatarIllustrated").toString()} side="bottom">
                    <Palette className="h-4 w-4" />
                  </Hint>
                </span>
              )}
            </div>
            {/* Nom + icône dans le footer du hero */}
            <div className="absolute bottom-0 left-0 flex items-center gap-2 p-3">
              {world.banner_url && world.icon_url && (
                <Image src={world.icon_url} alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-cover shadow" />
              )}
              <p className="font-semibold leading-tight text-white drop-shadow">
                {world.name}
              </p>
            </div>
          </div>



        </div>

        {/* Panneau : description + tags + type d'avatars révélés au survol
            (hauteur de carte fixe, l'espace vient du hero qui rétrécit) */}
        <div className="flex min-h-0 flex-1 h-full flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
            {/* Description : occupe l'espace restant, scrollable si trop longue.
                Apparaît en fondu au survol (comme les tags, légèrement après). */}
            <ScrollArea className="min-h-0 flex-1 opacity-0 transition-opacity delay-100 duration-300 ease-out group-hover:opacity-100 focus-within:opacity-100">
              <div ref={descRef}>
                {world.description ? (
                  <p className="pr-2.5 text-xs leading-relaxed text-muted-foreground">
                    {world.description}
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground/40">{t("noDescription")}</p>
                )}
              </div>
            </ScrollArea>

            {/* Tags : toujours en bas */}
            {tags.length > 0 && (
              <div ref={tagsRef} className="flex shrink-0 flex-wrap gap-1 opacity-0 transition-opacity delay-200 duration-300 ease-out group-hover:opacity-100 focus-within:opacity-100">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border border-border-soft bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <WorldStatsDialog world={world} tags={tags} open={open} onOpenChange={setOpen} />
    </>
  );
}
