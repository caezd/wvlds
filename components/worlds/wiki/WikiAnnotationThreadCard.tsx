"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, MessageSquare, MoreHorizontal, Trash2, Undo2, Unlink } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLeadingLetter } from "@/lib/textFormatting";
import { anchorPreview } from "@/lib/wikiAnnotations";
import { cn } from "@/lib/utils";
import type { WikiAnnotation, WikiAnnotationThread } from "@/types/worlds";

import { WikiAnnotationComposer } from "./WikiAnnotationComposer";

function displayNameOf(annotation: WikiAnnotation, unknown: string): string {
  return annotation.author?.username ?? unknown;
}

function AnnotationEntry({
  annotation,
  canDelete,
  onDelete,
  unknownAuthor,
}: {
  annotation: WikiAnnotation;
  canDelete: boolean;
  onDelete: () => void;
  unknownAuthor: string;
}) {
  const tCommon = useTranslations("common");
  const name = displayNameOf(annotation, unknownAuthor);

  return (
    <div className="flex gap-2">
      <Avatar className="mt-0.5 size-6 shrink-0 rounded-full">
        <AvatarImage src={annotation.author?.avatar_url ?? undefined} alt="" className="rounded-full" />
        <AvatarFallback className="rounded-full text-[10px]">
          {getLeadingLetter(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-foreground">{name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {new Date(annotation.created_at).toLocaleString(undefined, {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={tCommon("delete")}
              className="ml-auto shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/thread:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{annotation.body}</p>
      </div>
    </div>
  );
}

/**
 * Un fil d'annotation dans le panneau : l'extrait ancré, le message d'origine,
 * ses réponses, et de quoi y répondre.
 */
export function WikiAnnotationThreadCard({
  thread,
  currentUserId,
  canModerate,
  isActive,
  isDetached,
  pending,
  onActivate,
  onReply,
  onSetResolved,
  onDelete,
}: {
  thread: WikiAnnotationThread;
  currentUserId: string | null;
  /** Éditeur du monde : peut résoudre et supprimer les fils des autres. */
  canModerate: boolean;
  isActive: boolean;
  /** L'extrait ancré ne se retrouve plus dans le texte de la page. */
  isDetached: boolean;
  pending: boolean;
  onActivate: () => void;
  onReply: (body: string) => Promise<unknown>;
  onSetResolved: (resolved: boolean) => void;
  onDelete: (annotation: WikiAnnotation) => void;
}) {
  const t = useTranslations("wiki.annotations");
  const tCommon = useTranslations("common");
  // `unknownAuthor` existe déjà au niveau du wiki (historique des versions) :
  // on la réutilise plutôt que d'en créer une seconde, qui divergerait.
  const tWiki = useTranslations("wiki");
  const [replying, setReplying] = React.useState(false);

  const { root, replies } = thread;
  const resolved = root.resolved_at !== null;
  const canDeleteRoot = canModerate || root.author_id === currentUserId;

  return (
    <li
      className={cn(
        "group/thread rounded-xl border p-3 transition-colors",
        isActive ? "border-primary/50 bg-primary/5" : "border-border-soft bg-background",
        resolved && "opacity-70",
      )}
    >
      {/* En-tête : nature du fil, extrait ancré, actions */}
      <div className="mb-2 flex items-start gap-2">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        <button
          type="button"
          onClick={onActivate}
          className="min-w-0 flex-1 text-left"
          title={root.anchor_quote ?? undefined}
        >
          <span
            className={cn(
              "line-clamp-2 text-xs italic",
              isDetached
                ? "text-muted-foreground line-through decoration-muted-foreground/50"
                : "text-muted-foreground",
            )}
          >
            {anchorPreview(root.anchor_quote ?? "")}
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("threadActions")}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onSetResolved(!resolved)} disabled={pending}>
              {resolved
                ? <><Undo2 className="mr-2 h-3.5 w-3.5" /> {t("unresolve")}</>
                : <><Check className="mr-2 h-3.5 w-3.5" /> {t("resolve")}</>}
            </DropdownMenuItem>
            {canDeleteRoot && (
              <DropdownMenuItem
                onSelect={() => onDelete(root)}
                disabled={pending}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> {tCommon("delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {(isDetached || resolved) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {isDetached && (
            <span
              className="flex items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-[11px] text-muted-foreground"
              title={t("detachedHint")}
            >
              <Unlink className="h-3 w-3" /> {t("detached")}
            </span>
          )}
          {resolved && (
            <span className="flex items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-[11px] text-muted-foreground">
              <Check className="h-3 w-3" /> {t("resolved")}
            </span>
          )}
        </div>
      )}

      <div className="space-y-3">
        <AnnotationEntry
          annotation={root}
          canDelete={canDeleteRoot}
          onDelete={() => onDelete(root)}
          unknownAuthor={tWiki("unknownAuthor")}
        />
        {replies.map(r => (
          <AnnotationEntry
            key={r.id}
            annotation={r}
            canDelete={canModerate || r.author_id === currentUserId}
            onDelete={() => onDelete(r)}
            unknownAuthor={tWiki("unknownAuthor")}
          />
        ))}
      </div>

      {replying ? (
        <WikiAnnotationComposer
          className="mt-3"
          placeholder={t("replyPlaceholder")}
          submitLabel={t("reply")}
          pending={pending}
          onCancel={() => setReplying(false)}
          onSubmit={async body => {
            await onReply(body);
            setReplying(false);
          }}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 px-2 text-xs text-muted-foreground"
          onClick={() => { onActivate(); setReplying(true); }}
        >
          {t("reply")}
        </Button>
      )}
    </li>
  );
}
