"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { supabaseThumb, supabaseTinyThumb, TINY_THUMB_WIDTH } from "@/lib/storage";

/**
 * Image stockée (avatar, bannière, icône…) affichée en « flou progressif » :
 * une vignette de 16 px, agrandie et floutée, occupe la place le temps que
 * l'image réelle arrive, puis celle-ci se fond par-dessus.
 *
 * Le substitut est la vraie image, pas une couleur inventée : mêmes teintes,
 * même composition. Il ne coûte ni colonne en base ni reprise de l'existant —
 * imgproxy redimensionne déjà à la volée (voir supabaseTinyThumb) — et il est
 * mis en cache par URL, donc un même avatar répété dans une liste ne déclenche
 * qu'une seule requête supplémentaire.
 *
 * Le composant prend l'URL **d'origine** et les dimensions voulues, et calcule
 * lui-même les deux variantes. C'est délibéré : les tailles étaient jusqu'ici
 * décidées à chaque appel, avec des conventions qui avaient divergé — l'avatar
 * d'un éditeur et celui de son aperçu ne demandaient pas la même image.
 *
 * S'utilise comme un `<Image fill>` : le conteneur doit être `relative` et
 * `overflow-hidden` (le flou est légèrement agrandi pour que ses bords, rendus
 * translucides par le filtre, restent hors du cadre).
 */
/**
 * URL déjà affichées au moins une fois dans cette page.
 *
 * Le cache du navigateur évite de RETÉLÉCHARGER l'image ; il ne dit pas à
 * React qu'elle a déjà été vue. Sans cette mémoire, remonter un composant sur
 * une image connue rejouerait son fondu depuis le substitut flou — un
 * clignotement pour rien. Elle ne grandit que du nombre d'images distinctes
 * réellement affichées, et disparaît au rechargement de la page.
 *
 * Elle ne sert qu'à ça : elle ne remplace pas le cache du navigateur, et ne
 * peut rien pour deux vues qui demandent des largeurs différentes — c'est le
 * rôle des paliers d'`avatarThumbWidth`.
 */
const dejaAffichées = new Set<string>();

export function StoredImage({
  url,
  width,
  height,
  quality,
  resize,
  alt = "",
  className,
  sizes,
  priority,
  draggable,
  onClick,
}: {
  /** URL telle qu'enregistrée en base — surtout pas déjà passée par `supabaseThumb`. */
  url: string | null | undefined;
  /** Largeur demandée, en pixels physiques : pensez `taille CSS × 3` (écrans haute densité). */
  width: number;
  /** Hauteur demandée, quand le cadrage l'impose (bannières). */
  height?: number;
  quality?: number;
  /** Mode de recadrage d'imgproxy — `contain` par défaut, voir supabaseThumb. */
  resize?: "contain" | "cover" | "fill";
  alt?: string;
  /** Classes de l'image elle-même (ex: `object-cover`). */
  className?: string;
  sizes?: string;
  priority?: boolean;
  draggable?: boolean;
  /** Transmis à l'image — une visionneuse arrête ainsi la propagation du clic. */
  onClick?: React.MouseEventHandler<HTMLImageElement>;
}) {
  const [loaded, setLoaded] = React.useState(false);
  // Repli partagé plutôt que redéclaré à chaque appel : imgproxy échoue sur
  // certaines images, on repasse alors à l'original.
  const [thumbFailed, setThumbFailed] = React.useState(false);

  // Changer d'image remet les deux états à zéro — sinon une image remplacée
  // hériterait du `loaded` de la précédente (elle apparaîtrait d'un coup, sans
  // fondu ni substitut) et de son `thumbFailed` (elle serait servie en pleine
  // résolution alors que sa propre vignette marche peut-être très bien).
  // Ajustement pendant le rendu plutôt qu'en effet : React ré-exécute
  // immédiatement le composant, sans peindre l'image intermédiaire.
  const [urlAffichée, setUrlAffichée] = React.useState(url);
  if (url !== urlAffichée) {
    setUrlAffichée(url);
    setLoaded(false);
    setThumbFailed(false);
  }

  const src = url
    ? (thumbFailed ? url : (supabaseThumb(url, width, quality, height, resize) ?? url))
    : "";

  // Une image déjà en cache peut être complète AVANT que React n'attache son
  // `onLoad` : sans cette vérification au montage, elle resterait
  // indéfiniment à `opacity: 0`.
  const ref = React.useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete || (src && dejaAffichées.has(src))) setLoaded(true);
    },
    [src],
  );

  const tiny = supabaseTinyThumb(
    url,
    height ? Math.max(1, Math.round((height * TINY_THUMB_WIDTH) / width)) : undefined,
  );

  if (!url) return null;

  return (
    <>
      {tiny && (
        <span
          aria-hidden
          data-testid="stored-image-blur"
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center blur-lg"
          style={{ backgroundImage: `url("${tiny}")` }}
        />
      )}
      <Image
        ref={ref}
        src={src}
        alt={alt}
        fill
        // Déjà dimensionnée par imgproxy : la repasser dans l'optimiseur de
        // Next ne ferait que la ré-encoder (cf. WorldAvatar.tsx).
        unoptimized
        sizes={sizes}
        priority={priority}
        draggable={draggable}
        onClick={onClick}
        onLoad={() => { dejaAffichées.add(src); setLoaded(true); }}
        onError={() => setThumbFailed(true)}
        className={cn(
          "transition-opacity duration-500 motion-reduce:transition-none",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}
