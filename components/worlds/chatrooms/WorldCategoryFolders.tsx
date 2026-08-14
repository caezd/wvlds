"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
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
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
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
              "flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border text-left transition-colors sm:w-44",
              isActive
                ? "border-primary ring-1 ring-primary"
                : "border-border-soft hover:border-border",
            )}
          >
            <span className="relative block aspect-[4/3] w-full shrink-0 bg-muted-foreground/10">
              {image ? (
                <Image src={image} alt="" fill sizes="176px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-lg font-medium text-muted-foreground">
                  {cat.title[0]?.toUpperCase()}
                </span>
              )}
            </span>
            <span className="flex flex-col gap-0.5 bg-card px-2.5 py-2">
              <span className="truncate text-sm font-semibold text-foreground">{cat.title}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {cat.description || t("sidebar.subjects", { count: counts.get(cat.id) ?? 0 })}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
