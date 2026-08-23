"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  hasActiveFilter,
  searchChatMessages,
  type SearchCursor,
  type SearchFilters,
  type SearchResultMessage,
} from "@/lib/chatSearch";
import {
  listWorldAuthorsForSearch,
  listWorldChatroomsForSearch,
  type SearchAuthorOption,
  type SearchChatroomOption,
} from "@/lib/chatSearchDirectory";
import { SearchInput } from "./SearchInput";
import { SearchFiltersDrawer } from "./SearchFiltersDrawer";
import { SearchResultsList } from "./SearchResultsList";
import type { SearchToken } from "./types";

export function SearchCenter({
  worldId,
  initialChatId,
  open,
  onOpenChange,
}: {
  worldId: string;
  /** Pré-rempli un token "dans:" retirable, quand ouvert depuis une chatroom. */
  initialChatId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");
  const router = useRouter();
  // Créé au premier besoin réel (ouverture du panneau), pas au montage —
  // WorldHome et ChatroomHeader rendent toujours <SearchCenter/>, y compris
  // fermé, et un client Supabase ne doit pas être instancié pour rien.
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase(): SupabaseClient {
    const existing = supabaseRef.current;
    if (existing) return existing;
    const created = createClient();
    supabaseRef.current = created;
    return created;
  }

  const [authors, setAuthors] = useState<SearchAuthorOption[]>([]);
  const [chatrooms, setChatrooms] = useState<SearchChatroomOption[]>([]);
  const [tokens, setTokens] = useState<SearchToken[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [freeText, setFreeText] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResultMessage[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [needFilterWarning, setNeedFilterWarning] = useState(false);

  const [cursorForCurrentPage, setCursorForCurrentPage] = useState<SearchCursor>(null);
  const [nextCursor, setNextCursor] = useState<SearchCursor>(null);
  const [hasMore, setHasMore] = useState(false);
  const [history, setHistory] = useState<SearchCursor[]>([]);

  useEffect(() => {
    if (!open) return;
    const supabase = getSupabase();
    void listWorldAuthorsForSearch(supabase, worldId).then(setAuthors);
    void listWorldChatroomsForSearch(supabase, worldId).then(setChatrooms);
  }, [open, worldId]);

  useEffect(() => {
    if (!open) return;
    if (initialChatId && chatrooms.some((c) => c.id === initialChatId)) {
      const label = chatrooms.find((c) => c.id === initialChatId)?.label ?? "";
      setTokens((prev) =>
        prev.some((tk) => tk.type === "channel" && tk.value === initialChatId)
          ? prev
          : [...prev, { id: `channel:${initialChatId}`, type: "channel", label, value: initialChatId }],
      );
      setFilters((f) => (f.chatIds?.includes(initialChatId) ? f : { ...f, chatIds: [...(f.chatIds ?? []), initialChatId] }));
    }
  }, [open, initialChatId, chatrooms]);

  async function runSearch(nextFilters: SearchFilters, cursor: SearchCursor, pushHistory: boolean) {
    setLoading(true);
    setHasSearched(true);
    try {
      const page = await searchChatMessages(getSupabase(), worldId, nextFilters, cursor);
      setResults(page.results);
      setHistory((h) => (pushHistory ? [...h, cursorForCurrentPage] : h));
      setCursorForCurrentPage(cursor);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
    }
  }

  // Le texte libre seul ne déclenche jamais de recherche : il faut au moins
  // un filtre structuré (salon, auteur, mentions, contenu, date, épinglé,
  // type d'auteur) pour éviter de scanner tout l'historique sans restriction.
  function attemptSearch(next: SearchFilters) {
    if (!hasActiveFilter(next)) {
      setNeedFilterWarning(Boolean(next.freeText?.trim()));
      setHasSearched(false);
      setResults([]);
      return;
    }
    setNeedFilterWarning(false);
    void runSearch(next, null, false);
  }

  function addToken(token: SearchToken) {
    let next = filters;
    if (token.type === "author") {
      next =
        token.kind === "profile"
          ? { ...filters, authorIds: [...new Set([...(filters.authorIds ?? []), token.value])] }
          : { ...filters, personaIds: [...new Set([...(filters.personaIds ?? []), token.value])] };
    } else if (token.type === "channel") {
      next = { ...filters, chatIds: [...new Set([...(filters.chatIds ?? []), token.value])] };
    } else if (token.type === "mentions") {
      next = { ...filters, mentionsUsername: token.mentionUsername ?? token.label };
    } else if (token.type === "contains") {
      next = token.value === "media" ? { ...filters, hasMedia: true } : { ...filters, hasLink: true };
    }
    setFilters(next);
    setTokens((prev) => (prev.some((tk) => tk.id === token.id) ? prev : [...prev, token]));
    attemptSearch(next);
  }

  function removeToken(id: string) {
    const token = tokens.find((tk) => tk.id === id);
    if (!token) return;
    let next = filters;
    if (token.type === "author") {
      next =
        token.kind === "profile"
          ? { ...filters, authorIds: (filters.authorIds ?? []).filter((x) => x !== token.value) }
          : { ...filters, personaIds: (filters.personaIds ?? []).filter((x) => x !== token.value) };
    } else if (token.type === "channel") {
      next = { ...filters, chatIds: (filters.chatIds ?? []).filter((x) => x !== token.value) };
    } else if (token.type === "mentions") {
      next = { ...filters, mentionsUsername: undefined };
    } else if (token.type === "contains") {
      next = token.value === "media" ? { ...filters, hasMedia: null } : { ...filters, hasLink: null };
    }
    setFilters(next);
    setTokens((prev) => prev.filter((tk) => tk.id !== id));
    attemptSearch(next);
  }

  function submitFreeText(text: string) {
    setFreeText(text);
    const next = { ...filters, freeText: text };
    setFilters(next);
    attemptSearch(next);
  }

  function applyAdvancedFilters(next: SearchFilters) {
    setFilters(next);
    attemptSearch(next);
  }

  function goNext() {
    if (!hasMore || loading) return;
    void runSearch(filters, nextCursor, true);
  }

  function goPrev() {
    if (history.length === 0 || loading) return;
    const prevCursor = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    void runSearch(filters, prevCursor, false);
  }

  function selectMessage(chatId: string, messageId: number) {
    onOpenChange(false);
    router.push(`/c/${chatId}?m=${messageId}`);
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
        <DrawerContent
          className="inset-y-0 right-0 flex w-[min(calc(100%_-_var(--drawer-inset)*2),_520px)] flex-col gap-0 rounded-md border bg-background p-0 text-foreground shadow-lg"
        >
          <DrawerClose
            aria-label={tCommon("close")}
            className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="size-4" />
          </DrawerClose>
          <DrawerHeader className="gap-3 border-b border-border-soft px-4 py-4">
            <DrawerTitle>{t("search.title")}</DrawerTitle>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <SearchInput
                  worldId={worldId}
                  authors={authors}
                  chatrooms={chatrooms}
                  tokens={tokens}
                  onAddToken={addToken}
                  onRemoveToken={removeToken}
                  freeText={freeText}
                  onSubmit={submitFreeText}
                  onOpenAdvancedFilters={() => setFiltersOpen(true)}
                  autoFocus
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-md"
                aria-label={t("search.filtersTitle")}
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
            {needFilterWarning && (
              <p className="text-xs text-amber-500">{t("search.needFilter")}</p>
            )}
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {hasSearched && (
              <SearchResultsList
                results={results}
                authors={authors}
                chatrooms={chatrooms}
                freeText={freeText}
                loading={loading}
                hasNext={hasMore}
                hasPrev={history.length > 0}
                onNext={goNext}
                onPrev={goPrev}
                onSelectMessage={selectMessage}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <SearchFiltersDrawer
        authors={authors}
        chatrooms={chatrooms}
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onApply={applyAdvancedFilters}
      />
    </>
  );
}
