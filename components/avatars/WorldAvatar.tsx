import Image from "next/image";
import { supabaseThumb } from "@/lib/storage";
import { cn } from "@/lib/utils";

const COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-pink-500",
];

function worldColor(name: string) {
  return COLORS[name.charCodeAt(0) % COLORS.length];
}

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
  const color = worldColor(world.name);
  const { dim, px, text } = SIZES[size];

  return world.icon_url ? (
    <span className={cn(dim, "relative block rounded-lg overflow-hidden shrink-0", className)}>
      <Image
        src={supabaseThumb(world.icon_url, px * 1.5) ?? world.icon_url}
        alt=""
        fill
        sizes={`${px}px`}
        className="object-cover"
      />
    </span>
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg font-semibold text-white", dim, text, color, className)}>
      {initial}
    </span>
  );
}
