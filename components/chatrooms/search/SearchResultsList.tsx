"use client";

import { Fragment, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Pin, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import DateDisplay from "@/components/date-display";
import { excerpt } from "@/components/chatrooms/message/PinBar";
import type { SearchResultMessage } from "@/lib/chatSearch";
import type { SearchAuthorOption, SearchChatroomOption } from "@/lib/chatSearchDirectory";

function resolveAuthor(
  msg: SearchResultMessage,
  authors: SearchAuthorOption[],
): { name: string; avatarUrl: string | null } {
  if (msg.personaId) {
    const persona = authors.find((a) => a.kind === "persona" && a.id === msg.personaId);
    if (persona) return { name: persona.label, avatarUrl: persona.avatarUrl };
  }
  const profile = authors.find((a) => a.kind === "profile" && a.id === msg.authorId);
  if (profile) return { name: profile.label, avatarUrl: profile.avatarUrl };
  return { name: "?", avatarUrl: null };
}

function highlight(content: string, query: string) {
  const text = excerpt(content, 160) || content;
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/25 text-inherit">{text.slice(idx, idx + query.trim().length)}</mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

export function SearchResultsList({
  results,
  authors,
  chatrooms,
  freeText,
  loading,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  onSelectMessage,
}: {
  results: SearchResultMessage[];
  authors: SearchAuthorOption[];
  chatrooms: SearchChatroomOption[];
  freeText: string;
  loading: boolean;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSelectMessage: (chatId: string, messageId: number) => void;
}) {
  const t = useTranslations("chatrooms");
  const chatroomLabel = useMemo(() => {
    const map = new Map(chatrooms.map((c) => [c.id, c.label]));
    return (chatId: string) => map.get(chatId) ?? "?";
  }, [chatrooms]);

  const groups = useMemo(() => {
    const out: { chatId: string; items: SearchResultMessage[] }[] = [];
    for (const msg of results) {
      const last = out.at(-1);
      if (last && last.chatId === msg.chatId) last.items.push(msg);
      else out.push({ chatId: msg.chatId, items: [msg] });
    }
    return out;
  }, [results]);

  if (!loading && results.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">{t("search.noResults")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={`${group.chatId}-${group.items[0]?.id}`} className="flex flex-col gap-1.5">
          <div className="px-1 text-xs font-semibold text-muted-foreground"># {chatroomLabel(group.chatId)}</div>
          {group.items.map((msg) => {
            const author = resolveAuthor(msg, authors);
            return (
              <Fragment key={msg.id}>
                <button
                  type="button"
                  onClick={() => onSelectMessage(msg.chatId, msg.id)}
                  className="flex items-start gap-2.5 rounded-lg border border-border-soft bg-card p-3 text-left transition-colors hover:bg-secondary/50"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={author.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-xs">{author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{author.name}</span>
                      <span className="text-xs text-muted-foreground">
                        <DateDisplay value={msg.createdAt} />
                      </span>
                      {msg.pinned && <Pin className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <p className="line-clamp-2 text-sm text-foreground/90">{highlight(msg.content, freeText)}</p>
                  </div>
                </button>
              </Fragment>
            );
          })}
        </div>
      ))}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("search.scanning")}
        </div>
      )}

      {!loading && (hasPrev || hasNext) && (
        <div className="flex items-center justify-between border-t border-border-soft pt-3">
          <Button type="button" variant="ghost" size="sm" disabled={!hasPrev} onClick={onPrev}>
            {t("search.resultsPrev")}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!hasNext} onClick={onNext}>
            {t("search.resultsNext")}
          </Button>
        </div>
      )}
    </div>
  );
}
