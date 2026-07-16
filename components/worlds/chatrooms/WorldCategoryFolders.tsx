"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { CategoryAvatar } from "@/components/worlds/catalogue/CategoryAvatar";
import { cn } from "@/lib/utils";

type Category = {
  id: string;
  title: string;
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
          .select("id, title, banner_url, icon_url, position")
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
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {categories.map((cat) => {
        const isActive = selectedCategoryId === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(isActive ? null : cat.id)}
            className={cn(
              "flex min-w-40 max-w-56 shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors",
              isActive
                ? "border-primary bg-primary/5"
                : "border-border-soft bg-background hover:border-border hover:bg-secondary/30",
            )}
          >
            <CategoryAvatar
              title={cat.title}
              bannerUrl={cat.banner_url}
              iconUrl={cat.icon_url}
              className="h-9 w-9 rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground leading-tight">{cat.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {t("sidebar.subjects", { count: counts.get(cat.id) ?? 0 })}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
