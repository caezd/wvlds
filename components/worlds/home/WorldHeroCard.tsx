"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { type World } from "@/types/worlds";
import { supabaseThumb } from "@/lib/storage";

/**
 * Fond de la page d'accueil : image (ou couleur unie à défaut) en arrière-plan
 * absolu, sans titre/description superposés — ceux-ci sont désormais du
 * contenu de page normal, rendu par-dessus sur un fond opaque garantissant
 * leur lisibilité (voir WorldHome.tsx). Remplit tout le conteneur `relative`
 * parent (banderole + bloc titre). Le fondu vers `bodyColor` utilise des
 * paliers en unités fixes (pas des pourcentages) : il se termine toujours à
 * une hauteur constante, quelle que soit la hauteur totale (variable) du
 * conteneur — au-delà, la couleur reste unie jusqu'au panel.
 */
export function WorldHeroCard({
  world,
  bodyColor,
}: {
  world: Pick<World, "banner_url" | "color">;
  /** Couleur de fond du body vers laquelle l'image s'estompe (doit correspondre au fond réellement affiché derrière). */
  bodyColor: string;
}) {
  const [bannerThumbFailed, setBannerThumbFailed] = useState(false);

  useEffect(() => {
    setBannerThumbFailed(false);
  }, [world.banner_url]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: world.banner_url ? undefined : (world.color ?? undefined),
      }}
    >
      {world.banner_url ? (
        <Image
          src={bannerThumbFailed ? world.banner_url : (supabaseThumb(world.banner_url, 1920, 90, undefined, "cover") ?? world.banner_url)}
          onError={() => setBannerThumbFailed(true)}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
      ) : !world.color ? (
        <div className="absolute inset-0 bg-gradient-to-br from-card-400 to-card" />
      ) : null}

      {/* Fondu vers le bas, sur une hauteur fixe — au-delà, `${bodyColor}` reste uni jusqu'au panel. */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, transparent 10rem, ${bodyColor} 20rem)` }}
      />
    </div>
  );
}
