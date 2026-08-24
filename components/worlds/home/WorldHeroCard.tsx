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
 * parent (banderole + bloc titre).
 *
 * Le fondu vers le bas est un fondu d'OPACITÉ (`mask-image`), pas un fondu
 * vers une couleur de fond fixe : la bannière s'estompe progressivement en
 * transparence plutôt que de peindre `var(--background)` par-dessus. Peindre
 * une couleur en dur cassait sur mobile, où le fond ambiant de l'app n'est
 * PAS ce token — voir AppShell.tsx (`<main>` n'a `bg-background` qu'à partir
 * de `lg:`, en dessous c'est le fond du `<body>` qui doit rester visible).
 * Un fondu d'opacité laisse voir, quel qu'il soit, ce qu'il y a réellement
 * derrière, sans jamais avoir besoin de le connaître.
 */
export function WorldHeroCard({ world }: { world: Pick<World, "banner_url" | "color"> }) {
  const [bannerThumbFailed, setBannerThumbFailed] = useState(false);

  useEffect(() => {
    setBannerThumbFailed(false);
  }, [world.banner_url]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start,6rem),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start,6rem),transparent_100%)]"
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
    </div>
  );
}
