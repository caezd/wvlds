import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/textFormatting";
import { isRetiredStatus } from "@/lib/personaStatus";
import { avatarThumbWidth } from "@/lib/storage";
import { StoredImage } from "@/components/ui/stored-image";
import type { PersonaNarrativeStatus } from "@/types/db";

export type MiniFace = { id: string; name: string | null; avatar_url: string | null; narrative_status: PersonaNarrativeStatus };

/** Une pile de petits portraits carrés qui se chevauchent — un aperçu, décoratif. */
export function MiniAvatarStack({ faces, max, className }: { faces: MiniFace[]; max: number; className?: string }) {
  const shown = faces.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <span aria-hidden className={cn("flex pl-1.5", className)}>
      {shown.map((f) => (
        <span
          key={f.id}
          className={cn(
            "relative -ml-1.5 grid h-[22px] w-[22px] shrink-0 place-items-center overflow-hidden rounded-sm bg-muted text-2xs font-bold text-muted-foreground ring-2 ring-background",
            isRetiredStatus(f.narrative_status) && "grayscale opacity-60",
          )}
        >
          {f.avatar_url ? (
            <StoredImage url={f.avatar_url} width={avatarThumbWidth(22)} className="object-cover" draggable={false} />
          ) : (
            getInitials(f.name ?? "", "P")
          )}
        </span>
      ))}
    </span>
  );
}
