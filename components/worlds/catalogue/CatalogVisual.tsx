"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { buttonVariants } from "@/components/ui/button";

/**
 * Bouton de choix d'une source de visuel — un `outline`, enfoncé
 * (`aria-pressed`) quand c'est elle qui sert.
 * Partagé par le dialogue et la saisie rapide, pour que les deux se lisent
 * pareil.
 */
export function visualSourceButtonClass() {
  return cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "size-7");
}

/**
 * Le visuel d'un objet ou d'une compétence, où qu'il s'affiche.
 *
 * Trois sources, une seule rendue, de la plus précise à la plus générique :
 *
 *     image_url  >  lucide_icon  >  icon
 *
 * L'éditeur efface les autres quand on en choisit une, si bien que cette règle
 * ne tranche presque jamais ; elle existe pour que le rendu reste défini quoi
 * qu'il arrive en base. Voir la migration 164.
 *
 * ── Pourquoi un composant partagé ──
 * Le catalogue, l'éditeur de fiche, le sélecteur et la fiche en lecture le
 * dessinaient chacun de leur côté — trois copies, tolérables tant qu'il n'y
 * avait que deux sources. La troisième les aurait fait diverger au premier
 * oubli : le dépôt a déjà connu ça avec l'inventaire, rendu en double dans
 * `PersonaProfileSheet` et `PersonaProfileSheetTrigger`.
 *
 * Les appelants gardent leur mise en page ; ce composant ne décide que du
 * choix de la source et de son rendu.
 */
export function CatalogVisual({
  icon,
  lucideIcon,
  imageUrl,
  size,
  framed = true,
  className,
}: {
  icon?: string | null;
  lucideIcon?: string | null;
  imageUrl?: string | null;
  /** Côté de la boîte, en pixels. */
  size: number;
  /** Encadré (catalogue, éditeur) ou nu (pastilles d'une fiche). */
  framed?: boolean;
  className?: string;
}) {
  // Encadré, le glyphe respire dans sa boîte ; nu, il l'occupe entièrement.
  const glyph = framed ? Math.round(size * 0.6) : size;
  const box: React.CSSProperties = { width: size, height: size };
  const frameClass = framed
    ? "flex items-center justify-center rounded-lg border border-border bg-muted/40"
    : "";

  if (imageUrl) {
    return (
      <span
        style={box}
        className={cn("relative shrink-0 overflow-hidden rounded-lg", framed && "border border-border", className)}
      >
        <Image src={imageUrl} alt="" fill unoptimized className="object-cover" />
      </span>
    );
  }

  if (lucideIcon) {
    return (
      <span style={box} className={cn("shrink-0", frameClass, className)}>
        <LazyLucideIcon
          name={lucideIcon}
          width={glyph}
          height={glyph}
          // `currentColor` : l'icône Lucide est un trait, elle suit la couleur
          // du texte et n'a pas besoin de l'`invert` des `rpg_icons`.
          className="text-foreground"
        />
      </span>
    );
  }

  if (icon) {
    return (
      <span style={box} className={cn("shrink-0", frameClass, className)}>
        {/* Les `rpg_icons` sont des traits noirs sur fond transparent : elles
            s'inversent sur le fond sombre, contrairement à une vraie image. */}
        <Image
          src={`/rpg_icons/${icon}`}
          alt=""
          unoptimized
          width={glyph}
          height={glyph}
          className="object-contain invert"
          style={{ width: glyph, height: glyph }}
        />
      </span>
    );
  }

  // Rien de choisi : une boîte vide se justifie dans une liste alignée, pas au
  // milieu d'une phrase.
  if (!framed) return null;
  return (
    <span style={box} className={cn("shrink-0", frameClass, className)}>
      <ImageIcon className="text-muted-foreground" style={{ width: glyph * 0.7, height: glyph * 0.7 }} />
    </span>
  );
}
