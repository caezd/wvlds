"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Camera, Palette, ChevronsUpDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildExploreParams, MAX_FILTER_TAGS } from "./exploreQuery";

/** Une bascule de filtre : bouton `outline`, enfoncé tant que le filtre est actif. */
const FILTER_TOGGLE = "text-xs";

export function ExploreFilters({
  q,
  availableTags,
  selectedTags,
  selectedAvatarTypes,
}: {
  q: string;
  availableTags: string[];
  selectedTags: string[];
  selectedAvatarTypes: string[];
}) {
  const t = useTranslations("explore");
  const router = useRouter();
  const pathname = usePathname();
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [pendingTags, setPendingTags] = useState<string[]>(selectedTags);

  // Resynchronise la sélection en cours d'édition sur les tags réellement
  // appliqués tant que le combobox est fermé (ex. après un reset externe).
  useEffect(() => {
    if (!tagPickerOpen) setPendingTags(selectedTags);
  }, [selectedTags, tagPickerOpen]);

  const hasActiveFilters = selectedTags.length > 0 || selectedAvatarTypes.length > 0;

  if (availableTags.length === 0 && !hasActiveFilters) return null;

  function push(tags: string[], avatarTypes: string[]) {
    router.push(`${pathname}?${buildExploreParams({ q, tags, avatarTypes })}`);
  }

  function toggleAvatarType(v: string) {
    const next = selectedAvatarTypes.includes(v)
      ? selectedAvatarTypes.filter((x) => x !== v)
      : [...selectedAvatarTypes, v];
    push(selectedTags, next);
  }

  function togglePendingTag(tag: string) {
    setPendingTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_FILTER_TAGS) return prev;
      return [...prev, tag];
    });
  }

  // On applique tous les tags cochés en une seule navigation, à la fermeture
  // du combobox (clic extérieur, Échap, ou nouveau clic sur le déclencheur).
  function handleTagPickerOpenChange(open: boolean) {
    setTagPickerOpen(open);
    if (open) return;
    const unchanged =
      pendingTags.length === selectedTags.length && pendingTags.every((t) => selectedTags.includes(t));
    if (!unchanged) push(pendingTags, selectedAvatarTypes);
  }

  function removeTag(tag: string) {
    const next = selectedTags.filter((t) => t !== tag);
    setPendingTags(next);
    push(next, selectedAvatarTypes);
  }

  function resetAll() {
    setPendingTags([]);
    push([], []);
  }

  const tagBadgeCount = tagPickerOpen ? pendingTags.length : selectedTags.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => toggleAvatarType("real")}
        aria-pressed={selectedAvatarTypes.includes("real")}
        className={FILTER_TOGGLE}
      >
        <Camera className="h-3 w-3" />
        {t("avatarReal")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => toggleAvatarType("illustrated")}
        aria-pressed={selectedAvatarTypes.includes("illustrated")}
        className={FILTER_TOGGLE}
      >
        <Palette className="h-3 w-3" />
        {t("avatarIllustrated")}
      </Button>

      {availableTags.length > 0 && (
        <Popover open={tagPickerOpen} onOpenChange={handleTagPickerOpenChange}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="text-xs">
              {t("tagsLabel")}
              {tagBadgeCount > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-2xs leading-4 text-foreground">
                  {tagBadgeCount}
                </span>
              )}
              <ChevronsUpDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-0">
            <Command>
              <CommandInput placeholder={t("searchTagsPlaceholder")} className="h-8 text-xs" />
              <CommandList className="max-h-56">
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                  {t("noTags")}
                </CommandEmpty>
                <CommandGroup>
                  {availableTags.map((tag) => (
                    <CommandItem key={tag} value={tag} onSelect={() => togglePendingTag(tag)} className="gap-2">
                      <Checkbox
                        checked={pendingTags.includes(tag)}
                        onCheckedChange={() => togglePendingTag(tag)}
                        className="pointer-events-none"
                      />
                      {tag}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {selectedTags.map((tag) => (
        <Badge key={tag} className="pr-0.5">
          #{tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            aria-label={t("removeTagFilter", { tag })}
          >
            <X />
          </button>
        </Badge>
      ))}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("resetFilters")}
        </button>
      )}
    </div>
  );
}
