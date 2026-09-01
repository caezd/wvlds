import { StoredImage } from "@/components/ui/stored-image";
import { AVATAR_THUMB_SMALL } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Avatar d'une catégorie de chatrooms : image de catégorie (carrée) > bannière > initiale.
 * `className` contrôle la taille/forme du conteneur (ex. "h-9 w-9 rounded-lg").
 */
export function CategoryAvatar({
  title,
  bannerUrl,
  iconUrl,
  className,
  letterClassName = "text-[11px]",
}: {
  title: string;
  bannerUrl: string | null;
  iconUrl?: string | null;
  className?: string;
  /** Taille de police de l'initiale de secours — ajuster selon la taille du conteneur. */
  letterClassName?: string;
}) {
  const src = iconUrl || bannerUrl;
  return (
    <span
      className={cn(
        "relative shrink-0 flex items-center justify-center overflow-hidden bg-muted-foreground/10",
        className,
      )}
    >
      {src ? (
        // Chargement en deux temps, comme les avatars : une vignette floutée
        // tient la place, l'image se fond par-dessus. Le petit palier suffit —
        // ces icônes ne dépassent pas quelques dizaines de pixels.
        //
        // `height` autant que `width` : sans hauteur, imgproxy garde le rapport
        // d'origine et rend par exemple du 128 × 344 pour une case carrée de
        // 36 px — trois cents pixels téléchargés pour rien, et un recadrage
        // laissé au navigateur.
        <StoredImage
          url={src}
          width={AVATAR_THUMB_SMALL}
          height={AVATAR_THUMB_SMALL}
          resize="cover"
          sizes="48px"
          className="object-cover"
        />
      ) : (
        <span className={cn("font-medium text-muted-foreground", letterClassName)}>
          {title[0]?.toUpperCase()}
        </span>
      )}
    </span>
  );
}
