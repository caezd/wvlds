"use client";

import { useState } from "react";
import { MarkdownContent, proseClassName } from "@/components/MarkdownRenderer";
import { parseDialogue } from "@/lib/dialogue-bubbles";
import { ImageLightbox } from "./ImageLightbox";
import type { ChatMessageMeta, ChatMediaItem } from "@/types/db";
import { cn, isSafeUrl } from "@/lib/utils";

export function ChatroomMessageBubble({
  persona: _persona,
  message,
  isMine: _isMine,
  ignoreBubbles,
}: {
  persona?: { user_id?: string | null; name?: string | null } | null;
  message: { content: string; metadata?: ChatMessageMeta | null };
  isMine: boolean;
  /** Ignore metadata.bubbles même si actif (utilisé par le rendu SMS, prioritaire). */
  ignoreBubbles?: boolean;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
          <img
            src={item.url}
            alt={item.name}
            className="max-h-60 max-w-xs rounded-xl object-cover cursor-zoom-in"
          />
        </button>
      ))}
    </div>
  );

  const proseClass = proseClassName(
    "base",
    "prose-a:underline prose-a:underline-offset-4 prose-hr:my-3 prose-p:my-0 flex flex-col gap-3",
  );

  const body = !ignoreBubbles && message.metadata?.bubbles ? (
    <div className={cn(proseClass)}>
      {parseDialogue(message.content).map((part, i) => {
        if (part.kind === "prose") {
          return part.text ? <MarkdownContent key={i} content={part.text} /> : null;
        }
        const color = part.color ?? message.metadata?.bubbleColor;
        return (
          <div key={i} className="not-prose inline-flex items-end gap-2 flex-wrap">
            <div
              className={cn(
                "relative rounded-xl rounded-tl-[3px] px-3 py-1.5 text-sm sm:text-base leading-snug max-w-prose",
                !color && "bg-muted",
              )}
              style={color ? { backgroundColor: color + "33" } : undefined}
            >
              {part.speech}
            </div>
          </div>
        );
      })}
    </div>
  ) : message.content ? (
    <div className={proseClass}>
      <MarkdownContent content={message.content} />
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
