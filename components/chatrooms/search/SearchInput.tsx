"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AtSign, Hash, Paperclip, Search as SearchIcon, SlidersHorizontal, Trash2, User, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  matchesAuthorQuery,
  type SearchAuthorOption,
  type SearchChatroomOption,
} from "@/lib/chatSearchDirectory";
import { addSearchHistoryEntry, clearSearchHistory, loadSearchHistory } from "@/lib/searchHistory";
import type { SearchToken, SearchTokenType } from "./types";

// Préfixes reconnus dans la barre (français uniquement pour l'instant — la
// recherche façon Discord est un outil de "power user", pas une chaîne à
// traduire par locale).
const TOKEN_PREFIXES: { prefix: string; type: SearchTokenType }[] = [
  { prefix: "de", type: "author" },
  { prefix: "dans", type: "channel" },
  { prefix: "contient", type: "contains" },
  { prefix: "mentions", type: "mentions" },
];

const TRAILING_TOKEN_RE = new RegExp(
  `(?:^|\\s)(${TOKEN_PREFIXES.map((t) => t.prefix).join("|")}):(\\S*)$`,
  "i",
);

function prefixLabel(type: SearchTokenType): string {
  return TOKEN_PREFIXES.find((p) => p.type === type)?.prefix ?? type;
}

function authorToToken(option: SearchAuthorOption, type: "author" | "mentions"): SearchToken {
  const mentionUsername = option.kind === "profile" ? option.label : option.sublabel ?? undefined;
  return {
    id: `${type}:${option.kind}:${option.id}`,
    type,
    label: option.label,
    value: option.id,
    kind: option.kind,
    mentionUsername,
  };
}

export function SearchInput({
  worldId,
  authors,
  chatrooms,
  tokens,
  onAddToken,
  onRemoveToken,
  freeText,
  onSubmit,
  onOpenAdvancedFilters,
  autoFocus,
}: {
  worldId: string;
  authors: SearchAuthorOption[];
  chatrooms: SearchChatroomOption[];
  tokens: SearchToken[];
  onAddToken: (token: SearchToken) => void;
  onRemoveToken: (id: string) => void;
  freeText: string;
  onSubmit: (text: string) => void;
  onOpenAdvancedFilters: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("chatrooms");
  const inputRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState(freeText);
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadSearchHistory(worldId));
  }, [worldId]);

  const match = useMemo(() => raw.match(TRAILING_TOKEN_RE), [raw]);
  const activeType = match
    ? TOKEN_PREFIXES.find((t) => t.prefix.toLowerCase() === match[1].toLowerCase())?.type ?? null
    : null;
  const partialQuery = match?.[2] ?? "";
  // Champ vide et focus : on propose les raccourcis de filtres (façon
  // Discord) plutôt que de laisser le champ silencieux.
  const showQuickHelper = isFocused && activeType === null && raw.trim() === "";
  const open = activeType !== null || showQuickHelper;

  const containsOptions = [
    { value: "media", label: t("search.tokenContainsMedia") },
    { value: "link", label: t("search.tokenContainsLink") },
  ].filter((o) => o.label.toLowerCase().includes(partialQuery.toLowerCase()));

  const authorOptions = authors.filter((a) => matchesAuthorQuery(a, partialQuery)).slice(0, 20);
  const channelOptions = chatrooms
    .filter((c) => c.label.toLowerCase().includes(partialQuery.toLowerCase()))
    .slice(0, 20);

  function stripMatchedToken() {
    if (!match) return;
    const start = match.index ?? 0;
    const leading = raw.slice(0, start);
    const boundary = match[0].startsWith(" ") ? " " : "";
    setRaw(`${leading}${boundary}`.trimStart());
  }

  function selectAuthor(option: SearchAuthorOption, type: "author" | "mentions") {
    onAddToken(authorToToken(option, type));
    stripMatchedToken();
    inputRef.current?.focus();
  }

  function selectChannel(option: SearchChatroomOption) {
    onAddToken({ id: `channel:${option.id}`, type: "channel", label: option.label, value: option.id });
    stripMatchedToken();
    inputRef.current?.focus();
  }

  function selectContains(value: string, label: string) {
    onAddToken({ id: `contains:${value}`, type: "contains", label, value });
    stripMatchedToken();
    inputRef.current?.focus();
  }

  function submit(text: string) {
    if (text.trim()) setHistory(addSearchHistoryEntry(worldId, text));
    onSubmit(text);
  }

  function selectHistory(term: string) {
    setRaw(term);
    submit(term);
    inputRef.current?.blur();
  }

  function clearHistory() {
    clearSearchHistory(worldId);
    setHistory([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !open) {
      submit(raw.trim());
    }
    if (e.key === "Backspace" && raw === "" && tokens.length > 0) {
      onRemoveToken(tokens[tokens.length - 1].id);
    }
  }

  function pickQuickFilter(type: SearchTokenType) {
    setRaw(`${prefixLabel(type)}:`);
    inputRef.current?.focus();
  }

  function openAdvancedFilters() {
    inputRef.current?.blur();
    onOpenAdvancedFilters();
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={() => {}}>
        <PopoverAnchor asChild>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
            <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {tokens.map((token) => (
              <Badge key={token.id} variant="secondary" className="gap-1 pr-1">
                {prefixLabel(token.type)}: {token.label}
                <button
                  type="button"
                  onClick={() => onRemoveToken(token.id)}
                  aria-label={t("search.removeToken", { label: token.label })}
                  className="rounded-full p-0.5 hover:bg-hoverCard"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <input
              ref={inputRef}
              autoFocus={autoFocus}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={tokens.length === 0 ? t("search.placeholder") : undefined}
              className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Empêche le mousedown sur une suggestion de blurer le champ avant
          // que le clic n'atteigne le CommandItem (sinon le popover se
          // referme — via showQuickHelper/isFocused — avant la sélection).
          onMouseDown={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              {showQuickHelper && (
                <CommandGroup heading={t("search.filtersTitle")}>
                  <CommandItem onSelect={() => pickQuickFilter("author")}>
                    <QuickFilterRow icon={<User className="h-4 w-4" />} title={t("search.quickAuthorTitle")} sub="de: utilisateur" />
                  </CommandItem>
                  <CommandItem onSelect={() => pickQuickFilter("channel")}>
                    <QuickFilterRow icon={<Hash className="h-4 w-4" />} title={t("search.quickChannelTitle")} sub="dans: salon" />
                  </CommandItem>
                  <CommandItem onSelect={() => pickQuickFilter("contains")}>
                    <QuickFilterRow icon={<Paperclip className="h-4 w-4" />} title={t("search.quickContainsTitle")} sub="contient: lien, pièce jointe" />
                  </CommandItem>
                  <CommandItem onSelect={() => pickQuickFilter("mentions")}>
                    <QuickFilterRow icon={<AtSign className="h-4 w-4" />} title={t("search.quickMentionsTitle")} sub="mentions: utilisateur" />
                  </CommandItem>
                  <CommandItem onSelect={openAdvancedFilters}>
                    <QuickFilterRow icon={<SlidersHorizontal className="h-4 w-4" />} title={t("search.quickMoreTitle")} sub={t("search.quickMoreSub")} />
                  </CommandItem>
                </CommandGroup>
              )}
              {showQuickHelper && history.length > 0 && (
                <>
                  <CommandSeparator />
                  <div className="flex items-center justify-between px-2 pt-2 pb-1">
                    <span className="text-muted-foreground px-0 py-1.5 text-xs font-medium">{t("search.historyTitle")}</span>
                    <button
                      type="button"
                      onClick={clearHistory}
                      aria-label={t("search.clearHistory")}
                      className="rounded p-1 text-muted-foreground hover:bg-hoverCard hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <CommandGroup>
                    {history.map((term) => (
                      <CommandItem key={term} onSelect={() => selectHistory(term)}>
                        <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{term}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {activeType === "author" && (
                <CommandGroup heading={t("search.suggestAuthor")}>
                  {authorOptions.length === 0 && <CommandEmpty>{t("search.noResults")}</CommandEmpty>}
                  {authorOptions.map((option) => (
                    <CommandItem key={`${option.kind}:${option.id}`} onSelect={() => selectAuthor(option, "author")}>
                      <AuthorRow option={option} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {activeType === "mentions" && (
                <CommandGroup heading={t("search.suggestMentions")}>
                  {authorOptions.length === 0 && <CommandEmpty>{t("search.noResults")}</CommandEmpty>}
                  {authorOptions.map((option) => (
                    <CommandItem key={`${option.kind}:${option.id}`} onSelect={() => selectAuthor(option, "mentions")}>
                      <AuthorRow option={option} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {activeType === "channel" && (
                <CommandGroup heading={t("search.suggestChannel")}>
                  {channelOptions.length === 0 && <CommandEmpty>{t("search.noResults")}</CommandEmpty>}
                  {channelOptions.map((option) => (
                    <CommandItem key={option.id} onSelect={() => selectChannel(option)}>
                      # {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {activeType === "contains" && (
                <CommandGroup heading={t("search.suggestContains")}>
                  {containsOptions.length === 0 && <CommandEmpty>{t("search.noResults")}</CommandEmpty>}
                  {containsOptions.map((option) => (
                    <CommandItem key={option.value} onSelect={() => selectContains(option.value, option.label)}>
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function QuickFilterRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm">{title}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function AuthorRow({ option }: { option: SearchAuthorOption }) {
  return (
    <div className={cn("flex items-center gap-2")}>
      <Avatar className="h-6 w-6">
        <AvatarImage src={option.avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="text-[10px]">{option.label.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="font-medium">{option.label}</span>
      {option.kind === "persona" && option.sublabel && (
        <span className="text-xs text-muted-foreground">{option.sublabel}</span>
      )}
    </div>
  );
}
