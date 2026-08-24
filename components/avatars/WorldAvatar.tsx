import Image from "next/image";
import { supabaseThumb } from "@/lib/storage";
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
      <Image
        // ×3 (pas ×1.5) : couvre les écrans 3x DPR (courants sur mobile) —
        // en dessous, l'avatar reste net à 1x mais flou dès qu'il est
        // affiché sur un écran haute densité, où `px` CSS ne correspond plus
        // du tout au nombre de pixels physiques réellement affichés.
        //
        // `unoptimized` : l'image est déjà pré-dimensionnée par imgproxy
        // (ci-dessus) — laisser Next la ré-optimiser est non seulement
        // inutile, mais activement cassé ici. Un `sizes` en px fixe (sans
        // unité `vw`) ne correspond à aucun des deux formats que Next sait
        // reconnaître (ratio vw, ou largeur/hauteur explicites) : il retombe
        // alors sur `allSizes`, la liste ENTIÈRE des largeurs configurées —
        // jusqu'à 3840px. Demander à Next d'agrandir une source de 96px
        // jusqu'à 3840px échoue purement et simplement (`naturalWidth: 0`,
        // vérifié en direct), pas juste flou.
        src={supabaseThumb(world.icon_url, px * 3, 90) ?? world.icon_url}
        alt=""
        fill
        unoptimized
        className="object-cover"
      />
    </span>
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg font-semibold text-white bg-muted", dim, text, className)}>
      {initial}
    </span>
  );
}
