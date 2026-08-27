"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useResetOnKeyChange } from "@/hooks/useResetOnKeyChange";
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

/** Compte les salons par catégorie. */
function countByCategory(rooms: { category_id?: string | null }[]): Map<string, number> {
  const next = new Map<string, number>();
  for (const room of rooms) {
    if (!room.category_id) continue;
    next.set(room.category_id, (next.get(room.category_id) ?? 0) + 1);
  }
  return next;
}

export function WorldCategoryFolders({
  worldId,
  selectedCategoryId,
  onSelectCategory,
  fullWidth = false,
  initialCategories,
  initialRooms = [],
}: {
  worldId: string;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  /** Le bloc occupe seul toute la largeur de sa ligne (ex: `item.w === HOME_GRID_COLS`) — étagère horizontale de cartes même en desktop, comme sur mobile (cf. WorldHomeGridView.tsx). */
  fullWidth?: boolean;
  /** Catégories déjà chargées côté serveur (getChatroomCategories, mémoïsé et
   *  partagé avec WorldSidebar). Sans elles, le bloc démarrait vide — donc
   *  invisible (`categories.length === 0` rend `null`) — jusqu'au retour de son
   *  propre fetch client.
   *
   *  `undefined` = non fourni, le bloc charge alors lui-même. Un tableau vide
   *  est une réponse à part entière (« ce monde n'a aucune catégorie ») et ne
   *  doit surtout pas déclencher de requête de repli. */
  initialCategories?: Category[];
  /** Salons déjà chargés côté serveur : les compteurs en sont dérivés
   *  directement, au lieu d'un `select category_id from chatrooms` complet. */
  initialRooms?: { category_id?: string | null }[];
}) {
  const t = useTranslations("worlds");
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [counts, setCounts] = useState<Map<string, number>>(() => countByCategory(initialRooms));

  // Passer d'un monde à l'autre ne remonte pas ce composant : sans ce
  // resemis, la liste affichée reste celle du monde quitté, les props du
  // nouveau monde étant purement ignorés. Cf. useResetOnKeyChange.
  useResetOnKeyChange(worldId, () => {
    setCategories(initialCategories ?? []);
    setCounts(countByCategory(initialRooms));
  });


  const reconnectEpoch = useReconnectEpoch();
  const hasServerCategories = initialCategories !== undefined;

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
      setCounts(countByCategory((rooms as { category_id: string | null }[] | null) ?? []));
    };

    // Pas de chargement au montage quand le serveur a déjà fourni les données :
    // `load` ne sert plus qu'à rafraîchir sur événement Realtime.
    if (!hasServerCategories) void load();

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
  }, [worldId, reconnectEpoch, hasServerCategories]);

  if (categories.length === 0) return null;

  return (
    // Étagère horizontale de grandes cartes par défaut (mobile : le layout
    // de la grille repasse en une colonne unique, cf. `grid-cols-1 sm:grid-
    // cols-12` dans WorldHomeGridView.tsx — une liste verticale y prendrait
    // toute la hauteur de l'écran) ; à partir de `sm:`, la grille reprend
    // ses colonnes réelles et ce bloc redevient une liste verticale
    // compacte — SAUF s'il occupe seul toute la largeur de sa ligne
    // (`fullWidth`), auquel cas l'étagère reste plus lisible qu'une liste
    // qui s'étirerait sur toute la largeur de l'écran.
    <div
      className={cn(
        "flex h-full gap-3 overflow-x-auto overflow-y-visible px-1",
        !fullWidth && "sm:flex-col sm:gap-1.5 sm:overflow-x-visible sm:overflow-y-auto sm:px-0",
      )}
    >
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
              "flex w-36 shrink-0 flex-col items-stretch overflow-hidden rounded-xl border p-0 text-left transition-colors",
              !fullWidth && "sm:w-auto sm:shrink sm:flex-row sm:items-center sm:gap-2 sm:overflow-visible sm:rounded-lg sm:p-1.5",
              isActive
                ? "border-primary ring-1 ring-primary"
                : "border-border-soft hover:border-border",
            )}
          >
            <span
              className={cn(
                "relative block aspect-[4/3] h-auto w-full shrink-0 overflow-hidden rounded-none bg-muted-foreground/10",
                !fullWidth && "sm:aspect-auto sm:h-10 sm:w-10 sm:rounded-md",
              )}
            >
              {image ? (
                // La carte peut être une grande vignette (étagère) ou une
                // petite icône 40px (liste) selon `fullWidth`/le viewport —
                // on pré-dimensionne large (400px, x2 la plus grande carte
                // réelle pour le DPR) plutôt que de deviner laquelle des
                // deux tailles s'applique.
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
            <span
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-0.5 bg-card px-2.5 py-2",
                !fullWidth && "sm:bg-transparent sm:px-0 sm:py-0",
              )}
            >
              <span className="truncate text-sm font-semibold text-foreground">{cat.title}</span>
              <span
                className={cn(
                  "text-xs text-muted-foreground line-clamp-2 whitespace-normal",
                  !fullWidth && "sm:line-clamp-none sm:truncate sm:whitespace-nowrap",
                )}
              >
                {cat.description || t("sidebar.subjects", { count: counts.get(cat.id) ?? 0 })}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
