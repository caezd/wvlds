"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { VALID_LUCIDE_ICONS } from "@/components/ui/LucideIconPicker";

const DEFAULT_PAGE_LIMIT = 6;

type WikiPage = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  updated_at: string;
};

function relativeTime(iso: string, locale: string, justNow: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.floor(h / 24);
  if (d < 30) return rtf.format(-d, "day");
  return new Date(iso).toLocaleDateString(locale);
}

/** Dernières pages de wiki modifiées — liens directs (voir WorldWiki `initialSlug`). */
export function WorldWikiShortcutsWidget({
  worldId,
  limit = DEFAULT_PAGE_LIMIT,
}: {
  worldId: string;
  /** Nombre de pages listées — réglage du widget (voir WORLD_HOME_WIDGET_OPTIONS). */
  limit?: number;
}) {
  const t = useTranslations("worlds");
  const locale = useLocale();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const reconnectEpoch = useReconnectEpoch();

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      const { data } = await supabase
        .from("world_wiki_pages")
        .select("id, title, slug, icon, updated_at")
        .eq("world_id", worldId)
        .eq("is_folder", false)
        .order("updated_at", { ascending: false })
        .limit(limit);
      setPages((data as WikiPage[] | null) ?? []);
    };

    void load();

    const channel = supabase
      .channel(`world_wiki_shortcuts:${worldId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "world_wiki_pages", filter: `world_id=eq.${worldId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [worldId, reconnectEpoch, limit]);

  if (pages.length === 0) return null;

  return (
    <div className="rounded-lg border p-2">
      <ul>
        {pages.map((page) => {
          const href = `/w/${worldId}?view=wiki&page=${encodeURIComponent(page.slug)}`;
          return (
            <li key={page.id}>
              <Link
                href={href}
                className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-hoverCard"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card-400 text-muted-foreground">
                  {page.icon && VALID_LUCIDE_ICONS.has(page.icon) ? (
                    <LazyLucideIcon name={page.icon} className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground/90">
                    {page.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {t("home.wikiShortcuts.updated", {
                      time: relativeTime(page.updated_at, locale, t("home.wikiShortcuts.justNow")),
                    })}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
