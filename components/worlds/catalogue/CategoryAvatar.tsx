import Image from "next/image";
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
        <Image src={src} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        <span className={cn("font-medium text-muted-foreground", letterClassName)}>
          {title[0]?.toUpperCase()}
        </span>
      )}
    </span>
  );
}
