"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { copyToClipboard } from "@/lib/clipboard";
import { MarkdownContent, proseClassName } from "@/components/MarkdownRenderer";
import { parseDialogue } from "@/lib/dialogue-bubbles";
import { ImageLightbox } from "../ImageLightbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ChatMessageMeta, ChatMediaItem } from "@/types/db";
import { cn, isSafeUrl } from "@/lib/utils";
import { useCurrentUser } from "@/components/providers/CurrentUserProvider";
import { useWikiLinks } from "@/components/worlds/wiki/WikiLinkContext";

export function ChatroomMessageBubble({
  persona: _persona,
  message,
  isMine: _isMine,
  ignoreBubbles,
  isMobile,
}: {
  persona?: { user_id?: string | null; name?: string | null } | null;
  message: { content: string; metadata?: ChatMessageMeta | null };
  isMine: boolean;
  /** Ignore metadata.bubbles même si actif (utilisé par le rendu SMS, prioritaire). */
  ignoreBubbles?: boolean;
  /** Sur mobile, le clic droit (menu contextuel) cède la place au long-press
   *  déjà géré au niveau du message entier (ChatroomMessage.tsx) — évite que
   *  les deux systèmes de détection de pression prolongée ne se disputent le
   *  même geste sur la bulle. */
  isMobile?: boolean;
}) {
  // Hors du wiki, un `[[lien]]` vaut ce que le monde en sait — voir
  // WikiLinkContext. Sans fournisseur, il reste visiblement cassé.
  const wikiLinks = useWikiLinks();
  const wiki = (markdown: string) => (wikiLinks ? wikiLinks.resolve(markdown) : markdown);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { messageFont, messageTextSize, messageTextAlign } = useCurrentUser();
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");

  const media: ChatMediaItem[] = (message.metadata?.media ?? []).filter((m) => isSafeUrl(m.url));

  const mediaSection = media.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {media.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setLightboxIndex(i)}
          className="focus:outline-none"
        >
          {/* dimensions intrinsèques inconnues (pas stockées en métadonnée) — fill+contain forcerait l'agrandissement des petites images */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.name}
            className="max-h-60 max-w-xs rounded-xl object-cover cursor-zoom-in"
          />
        </button>
      ))}
    </div>
  );

  const fontClass = cn(
    messageFont === "serif" && "font-message-serif",
    messageFont === "dyslexic" && "font-message-dyslexic",
  );
  const textSizeClass = cn(
    messageTextSize === "sm" && "message-text-sm",
    messageTextSize === "lg" && "message-text-lg",
  );
  const textAlignClass = messageTextAlign === "justify" && "text-justify";

  const proseClass = proseClassName(
    "base",
    cn(
      "prose-a:underline prose-a:underline-offset-4 prose-hr:my-3 prose-p:my-0 prose-headings:my-0 prose-ul:my-0 prose-ol:my-0 flex flex-col gap-3",
      fontClass,
      textSizeClass,
      textAlignClass,
    ),
  );

  const body = !ignoreBubbles && message.metadata?.bubbles ? (
    <div className={cn(proseClass)}>
      {parseDialogue(message.content).map((part, i) => {
        if (part.kind === "prose") {
          return part.text ? <MarkdownContent key={i} content={wiki(part.text)} onWikiLink={wikiLinks?.onWikiLink} /> : null;
        }
        const color = part.color ?? message.metadata?.bubbleColor;
        const bubble = (
          <div
            className={cn(
              "relative rounded-xl rounded-tl-[3px] px-3 py-1.5 -ml-1.5 text-sm sm:text-base leading-snug max-w-prose",
              !color && "bg-muted",
              fontClass,
              textSizeClass,
              textAlignClass,
            )}
            style={color ? { backgroundColor: color + "33" } : undefined}
          >
            <MarkdownContent content={wiki(part.speech)} onWikiLink={wikiLinks?.onWikiLink} />
          </div>
        );
        return (
          <div key={i} className="not-prose inline-flex items-end gap-2 flex-wrap">
            {/* Clic droit desktop uniquement — sur mobile, le long-press du
                message entier (ChatroomMessage.tsx) ouvre déjà un drawer
                d'options incluant la copie de couleur, pas besoin d'un
                second geste concurrent sur la bulle elle-même. */}
            {color && !isMobile ? (
              <ContextMenu>
                <ContextMenuTrigger asChild>{bubble}</ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onSelect={() => void copyToClipboard(color, tCommon("copyDialogueColorSuccess"), tCommon("copyError"))}
                  >
                    {t("copyDialogueColor")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : (
              bubble
            )}
          </div>
        );
      })}
    </div>
  ) : message.content ? (
    <div className={proseClass}>
      <MarkdownContent content={wiki(message.content)} onWikiLink={wikiLinks?.onWikiLink} />
    </div>
  ) : null;

  return (
    <>
      {lightboxIndex !== null && (
        <ImageLightbox
          items={media}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      {mediaSection}
      {body}
    </>
  );
}
