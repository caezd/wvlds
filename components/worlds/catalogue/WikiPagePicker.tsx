"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Plus, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";

/** Une page du wiki, ce qu'il en faut pour la lier et l'ouvrir. */
export type WikiPageRef = { id: string; title: string; slug: string; icon: string | null };

export const MAX_LINKED_PAGES = 10;

/** Les pages (pas les dossiers) d'un monde, une fois par montage. */
export function useWorldWikiPages(worldId: string, enabled = true): WikiPageRef[] | null {
  const supabase = useMemo(() => createClient(), []);
  const [pages, setPages] = useState<WikiPageRef[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("world_wiki_pages")
        .select("id, title, slug, icon")
        .eq("world_id", worldId)
        .eq("is_folder", false)
        .is("deleted_at", null)
        .order("title");
      if (!cancelled) setPages((data ?? []) as WikiPageRef[]);
    })();
    return () => { cancelled = true; };
  }, [supabase, worldId, enabled]);
  return pages;
}

/** Une page en pastille — dans le sélecteur comme sur la fiche. */
export function WikiPageChip({
  page,
  onRemove,
  onOpen,
  className,
}: {
  page: WikiPageRef;
  onRemove?: () => void;
  onOpen?: () => void;
  className?: string;
}) {
  const t = useTranslations("catalogue");
  const inner = (
    <>
      {page.icon ? <LazyLucideIcon name={page.icon} className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="truncate">{page.title}</span>
    </>
  );
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border border-border-soft bg-muted/40 pl-2 text-xs", onRemove ? "pr-1" : "pr-2", className)}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="inline-flex min-w-0 items-center gap-1 py-0.5 hover:underline">{inner}</button>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1 py-0.5">{inner}</span>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t("unlinkPage", { title: page.title })} className="rounded-full p-0.5 text-muted-foreground hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Choisir les pages du wiki liées à un objet (migration 186) : les pastilles
 * des pages retenues, et un bouton qui ouvre la recherche parmi les pages du
 * monde. Dix au plus, comme en base.
 */
export function WikiPagePicker({
  worldId,
  value,
  onChange,
}: {
  worldId: string;
  value: string[];
  onChange: (pageIds: string[]) => void;
}) {
  const t = useTranslations("catalogue");
  const [open, setOpen] = useState(false);
  const pages = useWorldWikiPages(worldId);
  const byId = useMemo(() => new Map((pages ?? []).map((p) => [p.id, p])), [pages]);
  const chosen = value.map((id) => byId.get(id)).filter((p): p is WikiPageRef => !!p);
  const remaining = (pages ?? []).filter((p) => !value.includes(p.id));
  const full = value.length >= MAX_LINKED_PAGES;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chosen.map((page) => (
        <WikiPageChip key={page.id} page={page} onRemove={() => onChange(value.filter((id) => id !== page.id))} />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-6 rounded-full px-2 text-xs" disabled={full || pages === null}>
            <Plus className="mr-1 h-3 w-3" />
            {t("linkPage")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder={t("searchPage")} />
            <CommandList>
              <CommandEmpty>{t("noPageFound")}</CommandEmpty>
              <CommandGroup>
                {remaining.map((page) => (
                  <CommandItem
                    key={page.id}
                    value={page.title}
                    onSelect={() => { onChange([...value, page.id]); setOpen(false); }}
                    className="gap-2 text-sm"
                  >
                    {page.icon ? <LazyLucideIcon name={page.icon} className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    <span className="truncate">{page.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
