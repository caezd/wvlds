"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabaseThumb } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CreateWorldDialog } from "./CreateWorldDialog";

const COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-pink-500",
];
function worldColor(name: string) {
  return COLORS[name.charCodeAt(0) % COLORS.length];
}

type FavoriteWorld = { id: string; name: string; icon_url: string | null };

export function WorldsRailButton() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, plan: ctxPlan } = useCurrentUser();
  const pathname = usePathname();
  const isWorldPage = pathname?.startsWith("/w/") || pathname?.startsWith("/c/") || pathname === "/w" || pathname === "/c";
  const [open, setOpen] = useState(false);
  const [worlds, setWorlds] = useState<FavoriteWorld[]>([]);
  const [quotaReached, setQuotaReached] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ plan: "free" | "subscribed" | "lifetime"; ownedCount: number; quotaLimit: number }>({ plan: "free", ownedCount: 0, quotaLimit: 1 });
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    async function load() {
      // `plan` vient du contexte (résolu une seule fois) — plus de select dédié.
      const [{ data: favData }, { count: ownedCount }] = await Promise.all([
        supabase
          .from("world_user_preferences")
          .select("worlds!inner(id, name, icon_url)")
          .eq("user_id", userId)
          .eq("is_favorite", true),
        supabase
          .from("worlds")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", userId)
          .is("deleted_at", null)
          .eq("is_archived", false),
      ]);

      setWorlds((favData ?? []).map((r: { worlds: unknown }) => r.worlds as FavoriteWorld));

      const plan = (ctxPlan ?? "free") as "free" | "subscribed" | "lifetime";
      const limit = plan === "free" ? 1 : Infinity;
      const owned = ownedCount ?? 0;
      setQuotaReached(limit !== Infinity && owned >= limit);
      setQuotaInfo({ plan, ownedCount: owned, quotaLimit: limit === Infinity ? 999 : limit });
    }
    void load();
  }, [supabase, userId, ctxPlan]);

  function onEnter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setOpen(true);
  }
  function onLeave() {
    leaveTimer.current = setTimeout(() => setOpen(false), 120);
  }


  return (
    <div className="relative w-11 px-1.5" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {/* Placeholder dans le flux */}
      <div className="h-9 w-full" />

      {/* Conteneur absolu extensible */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-50 flex flex-col items-center rounded-xl transition-[background-color] duration-200",
          open ? "bg-carbon-700" : "bg-transparent",
        )}
      >
        {/* Globe */}
        <Link
          href="/w"
          // /w répond par une redirection 307 vers le dernier monde : le
          // prefetch serait systématiquement jeté.
          prefetch={false}
          aria-label="Mes mondes"
          className={cn(
            "relative flex h-9 w-full shrink-0 items-center justify-center rounded-xl transition-colors",
            isWorldPage || open ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {isWorldPage && (
            <span className="absolute -left-3 -translate-x-[2px] h-[20px] w-[8px] rounded-full bg-mist-50" />
          )}
          <Globe size={17} />
        </Link>

        {/* Section extensible */}
        <div
          className={cn(
            "flex w-full flex-col items-center overflow-hidden transition-[opacity] duration-200 ease-in-out ",
            open ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          {/* Séparateur toujours présent */}
          <div className="my-1 h-px w-4 shrink-0 bg-mist-50/10" />

          {/* Mondes favoris */}
          {worlds.length > 0 && (
            <>
              <div className="flex w-full flex-col items-center gap-1">
                {worlds.map((w) => (
                  <Tooltip key={w.id}>
                    <TooltipTrigger asChild>
                      <Link
                        href={`/w/${w.id}`}
                        className="relative flex h-6 w-6 shrink-0 overflow-hidden rounded-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {w.icon_url ? (
                          <Image
                            src={supabaseThumb(w.icon_url, 72) ?? w.icon_url}
                            alt={w.name}
                            fill
                            sizes="24px"
                            className="object-cover"
                          />
                        ) : (
                          <span className={cn("flex h-full w-full items-center justify-center text-xs font-bold text-white", worldColor(w.name))}>
                            {(w.name[0] ?? "W").toUpperCase()}
                          </span>
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>{w.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <div className="my-1 h-px w-4 shrink-0 bg-mist-50/10" />
            </>
          )}

          {/* Bouton créer un monde */}
          <div className="w-full px-1.5 pb-3 flex items-center justify-center">
            <CreateWorldDialog
              disabled={quotaReached}
              plan={quotaInfo.plan}
              ownedCount={quotaInfo.ownedCount}
              quotaLimit={quotaInfo.quotaLimit}
              trigger={
                <button
                  type="button"
                  disabled={quotaReached}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Nouveau monde"
                >
                  <Plus size={14} />
                </button>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
