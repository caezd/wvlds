"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { supabaseThumb } from "@/lib/storage";
import { cn } from "@/lib/utils";

type Category = {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  icon_url: string | null;
  position: number;
};

export function WorldCategoryFolders({
  worldId,
  selectedCategoryId,
  onSelectCategory,
}: {
  worldId: string;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}) {
  const t = useTranslations("worlds");
  const [categories, setCategories] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const reconnectEpoch = useReconnectEpoch();

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      const [{ data: cats }, { data: rooms }] = await Promise.all([
        supabase
          .from("chatroom_categories")
          .select("id, title, description, banner_url, icon_url, position")
          .eq("world_id", worldId)
          .order("position"),
        supabase.from("chatrooms").select("category_id").eq("world_id", worldId),
      ]);
      setCategories((cats as Category[] | null) ?? []);
      const next = new Map<string, number>();
      for (const room of (rooms as { category_id: string | null }[] | null) ?? []) {
        if (!room.category_id) continue;
        next.set(room.category_id, (next.get(room.category_id) ?? 0) + 1);
      }
      setCounts(next);
    };

    void load();

    const channel = supabase
      .channel(`world_category_folders:${worldId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatrooms", filter: `world_id=eq.${worldId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatroom_categories", filter: `world_id=eq.${worldId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [worldId, reconnectEpoch]);

  if (categories.length === 0) return null;

  return (
    // Conteneur de container queries hérité du bloc parent (voir
    // WorldHomeGridView.tsx) : la mise en page s'adapte à la largeur réelle
    // de la cellule de grille, pas au viewport. Étroit (par défaut) → liste
    // verticale compacte sur toute la hauteur ; large (@sm+) → étagère
    // horizontale de grandes cartes, comme avant.
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto @sm:flex-row @sm:gap-3 @sm:overflow-x-auto @sm:overflow-y-visible @sm:px-1">
      {categories.map((cat) => {
        const isActive = selectedCategoryId === cat.id;
        // icon_url est une petite image dédiée aux avatars (sidebar) — l'étirer
        // sur la grande carte la pixelliserait ; seule la bannière (pensée pour
        // du grand format) convient ici.
        const image = cat.banner_url;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(isActive ? null : cat.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-1.5 text-left transition-colors",
              "@sm:w-36 @sm:shrink-0 @sm:flex-col @sm:items-stretch @sm:gap-0 @sm:overflow-hidden @sm:rounded-xl @sm:p-0",
              isActive
                ? "border-primary ring-1 ring-primary"
                : "border-border-soft hover:border-border",
            )}
          >
            <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted-foreground/10 @sm:aspect-[4/3] @sm:h-auto @sm:w-full @sm:rounded-none">
              {image ? (
                // La largeur réelle de CE conteneur est pilotée par une
                // container query (@sm:, voir le parent), pas par le
                // viewport — la carte peut donc être une liste 40px ou une
                // étagère 144px selon la colonne de grille, sans qu'aucun
                // `sizes` viewport-based ne puisse le distinguer. On
                // pré-dimensionne donc nous-mêmes via imgproxy, large de
                // marge (400px, x2 la plus grande carte réelle pour le DPR).
                //
                // `unoptimized` indispensable : un `sizes` en px fixe (sans
                // `vw`) fait retomber Next.js sur sa plus grande largeur
                // configurée (jusqu'à 3840px) au lieu d'une taille adaptée —
                // voir le commentaire détaillé dans WorldAvatar.tsx. Sans
                // `unoptimized`, Next tenterait de ré-agrandir une source
                // déjà petite jusqu'à 3840px et l'image ne chargerait pas.
                <Image
                  src={supabaseThumb(image, 400, 90) ?? image}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-lg font-medium text-muted-foreground">
                  {cat.title[0]?.toUpperCase()}
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 @sm:bg-card @sm:px-2.5 @sm:py-2">
              <span className="truncate text-sm font-semibold text-foreground">{cat.title}</span>
              <span className="truncate text-xs text-muted-foreground @sm:line-clamp-2 @sm:whitespace-normal">
                {cat.description || t("sidebar.subjects", { count: counts.get(cat.id) ?? 0 })}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
