"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SearchAuthorOption, SearchChatroomOption } from "@/lib/chatSearchDirectory";
import type { AuthorMode, SearchFilters } from "@/lib/chatSearch";

const TRI_ANY = "any";
const TRI_YES = "yes";
const TRI_NO = "no";

export function SearchFiltersDrawer({
  authors,
  chatrooms,
  open,
  onOpenChange,
  filters,
  onApply,
}: {
  authors: SearchAuthorOption[];
  chatrooms: SearchChatroomOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SearchFilters;
  onApply: (next: SearchFilters) => void;
}) {
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");
  const [draft, setDraft] = useState<SearchFilters>(filters);

  useEffect(() => {
    if (!open) return;
    setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleChatId(id: string, checked: boolean) {
    setDraft((d) => ({
      ...d,
      chatIds: checked ? [...(d.chatIds ?? []), id] : (d.chatIds ?? []).filter((x) => x !== id),
    }));
  }

  function toggleAuthor(option: SearchAuthorOption, checked: boolean) {
    setDraft((d) => {
      if (option.kind === "profile") {
        return {
          ...d,
          authorIds: checked
            ? [...(d.authorIds ?? []), option.id]
            : (d.authorIds ?? []).filter((x) => x !== option.id),
        };
      }
      return {
        ...d,
        personaIds: checked
          ? [...(d.personaIds ?? []), option.id]
          : (d.personaIds ?? []).filter((x) => x !== option.id),
      };
    });
  }

  function triValue(v: boolean | null | undefined) {
    if (v === true) return TRI_YES;
    if (v === false) return TRI_NO;
    return TRI_ANY;
  }

  function clearFilters() {
    const empty: SearchFilters = {};
    setDraft(empty);
    onApply(empty);
    onOpenChange(false);
  }

  function applyFilters() {
    onApply(draft);
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent
        className={cn(
          "inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg p-0",
          "w-[min(calc(100%_-_var(--drawer-inset)*2),_420px)]",
        )}
      >
        <DrawerClose
          aria-label={tCommon("close")}
          className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="size-4" />
        </DrawerClose>
        <DrawerHeader className="border-b border-border-soft px-6 py-4">
          <DrawerTitle>{t("search.filtersTitle")}</DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="flex flex-col gap-6">
            <FilterSection title={t("search.filterChannelLabel")} hint={t("search.filterChannelHint")}>
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                {chatrooms.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={(draft.chatIds ?? []).includes(c.id)}
                      onCheckedChange={(v) => toggleChatId(c.id, v === true)}
                    />
                    # {c.label}
                  </label>
                ))}
              </div>
            </FilterSection>

            <FilterSection title={t("search.filterAuthorLabel")} hint={t("search.filterAuthorHint")}>
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                {authors.map((a) => (
                  <label key={`${a.kind}:${a.id}`} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={
                        a.kind === "profile"
                          ? (draft.authorIds ?? []).includes(a.id)
                          : (draft.personaIds ?? []).includes(a.id)
                      }
                      onCheckedChange={(v) => toggleAuthor(a, v === true)}
                    />
                    {a.label}
                    {a.kind === "persona" && a.sublabel && (
                      <span className="text-xs text-muted-foreground">{a.sublabel}</span>
                    )}
                  </label>
                ))}
              </div>
            </FilterSection>

            <FilterSection title={t("search.filterContainsLabel")} hint={t("search.filterContainsHint")}>
              <Select
                value={draft.hasMedia ? "media" : draft.hasLink ? "link" : "any"}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    hasMedia: v === "media" ? true : null,
                    hasLink: v === "link" ? true : null,
                  }))
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("search.tokenContainsAny")}</SelectItem>
                  <SelectItem value="media">{t("search.tokenContainsMedia")}</SelectItem>
                  <SelectItem value="link">{t("search.tokenContainsLink")}</SelectItem>
                </SelectContent>
              </Select>
            </FilterSection>

            <FilterSection title={t("search.filterDateLabel")}>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={draft.dateFrom?.slice(0, 10) ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value || null }))}
                  className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="date"
                  value={draft.dateTo?.slice(0, 10) ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value || null }))}
                  className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
            </FilterSection>

            <FilterSection title={t("search.filterAuthorModeLabel")} hint={t("search.filterAuthorModeHint")}>
              <Select
                value={draft.authorMode ?? TRI_ANY}
                onValueChange={(v) => setDraft((d) => ({ ...d, authorMode: v === TRI_ANY ? null : (v as AuthorMode) }))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TRI_ANY}>{t("search.filterAny")}</SelectItem>
                  <SelectItem value="persona">{t("search.authorModePersona")}</SelectItem>
                  <SelectItem value="direct">{t("search.authorModeDirect")}</SelectItem>
                </SelectContent>
              </Select>
            </FilterSection>

            <FilterSection title={t("pinned")}>
              <Select
                value={triValue(draft.pinned)}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, pinned: v === TRI_ANY ? null : v === TRI_YES }))
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TRI_ANY}>{t("search.filterAny")}</SelectItem>
                  <SelectItem value={TRI_YES}>{t("search.filterYes")}</SelectItem>
                  <SelectItem value={TRI_NO}>{t("search.filterNo")}</SelectItem>
                </SelectContent>
              </Select>
            </FilterSection>
          </div>
        </ScrollArea>

        <DrawerFooter className="flex-row justify-between border-t border-border-soft px-6 py-4">
          <Button type="button" variant="ghost" onClick={clearFilters}>
            {t("search.clearFilters")}
          </Button>
          <Button type="button" onClick={applyFilters}>
            {t("search.applyFilters")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function FilterSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">{title}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
