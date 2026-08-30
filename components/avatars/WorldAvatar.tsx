import { StoredImage } from "@/components/ui/stored-image";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { dim: "h-6 w-6", px: 24, text: "text-[10px]" },
  md: { dim: "h-8 w-8", px: 32, text: "text-xs" },
  lg: { dim: "h-10 w-10", px: 40, text: "text-sm" },
} as const;

export function WorldAvatar({
  world,
  size = "sm",
  className,
}: {
  world: { name: string; icon_url: string | null };
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initial = (world.name[0] ?? "W").toUpperCase();
  const { dim, px, text } = SIZES[size];

  return world.icon_url ? (
    <span className={cn(dim, "relative block rounded-lg overflow-hidden shrink-0", className)}>
      {/* ×3 (pas ×1.5) : couvre les écrans 3x DPR (courants sur mobile) — en
          dessous, l'icône reste nette à 1x mais floue dès qu'elle est affichée
          sur un écran haute densité, où `px` CSS ne correspond plus du tout au
          nombre de pixels physiques réellement affichés.

          `StoredImage` pose aussi le `unoptimized` qui va avec : l'image étant
          déjà dimensionnée par imgproxy, la repasser dans l'optimiseur de Next
          est non seulement inutile mais activement cassé — un `sizes` en px
          fixe ne correspond à aucun des deux formats que Next sait reconnaître,
          il retombe alors sur la liste ENTIÈRE de ses largeurs, jusqu'à
          3840px. Demander d'agrandir une source de 96px jusque-là échoue
          purement et simplement (`naturalWidth: 0`, vérifié en direct). */}
      <StoredImage url={world.icon_url} width={px * 3} quality={90} className="object-cover" />
    </span>
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg font-semibold text-white bg-muted", dim, text, className)}>
      {initial}
    </span>
  );
}
