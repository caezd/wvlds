"use client";

import { type World } from "@/types/worlds";
import { StoredImage } from "@/components/ui/stored-image";
import { cn } from "@/lib/utils";

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
 *
 * `blurred` : variante pour la barre collante qui remplace la bannière une
 * fois celle-ci défilée (voir WorldHomeHeader.tsx) — même image, floutée,
 * sans fondu. Mêmes paramètres d'image que la bannière, exprès : le
 * navigateur la sert depuis son cache au lieu d'en télécharger une seconde.
 */
export function WorldHeroCard({
  world,
  blurred = false,
}: {
  world: Pick<World, "banner_url" | "color">;
  blurred?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        !blurred &&
          "[mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start,6rem),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start,6rem),transparent_100%)]",
      )}
      style={{
        backgroundColor: world.banner_url ? undefined : (world.color ?? undefined),
      }}
    >
      {world.banner_url ? (
        // Le flou s'applique à un conteneur, pas à l'image : il couvre ainsi
        // aussi la vignette de substitution de StoredImage. Le filtre rend
        // translucides les bords sur une largeur de l'ordre de son rayon
        // (24px) : le conteneur déborde du cadre bien au-delà (64px de chaque
        // côté) pour que seule la partie pleinement opaque reste visible. Un
        // simple `scale` ne suffisait pas sur une barre de 56px de haut — il
        // n'y ajoutait que quelques pixels, et le header paraissait
        // transparent.
        <div className={cn(blurred ? "absolute -inset-16 blur-xl" : "absolute inset-0")}>
          <StoredImage
            url={world.banner_url}
            width={1920}
            quality={90}
            resize="cover"
            sizes="100vw"
            className="object-cover"
            priority={!blurred}
          />
        </div>
      ) : !world.color ? (
        <div className="absolute inset-0 bg-gradient-to-br from-card-400 to-card" />
      ) : null}
    </div>
  );
}
