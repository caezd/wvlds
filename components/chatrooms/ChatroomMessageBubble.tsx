"use client";

import { useState } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { DialogueBubbleRenderer } from "./blocks/DialogueBubbleRenderer";
import { ImageLightbox } from "./ImageLightbox";
import { cn } from "@/lib/utils";
import type { ChatMessageMeta, ChatMediaItem } from "@/types/db";

export function ChatroomMessageBubble({
  persona,
  message,
  isMine,
}: {
  persona?: { user_id?: string | null; name?: string | null } | null;
  message: { content: string; metadata?: ChatMessageMeta | null };
  isMine: boolean;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const media: ChatMediaItem[] = message.metadata?.media ?? [];

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

  return (
    <>
      {lightboxIndex !== null && (
        <ImageLightbox
          items={media}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {message.metadata?.bubbles ? (
        <>
          {mediaSection}
          <DialogueBubbleRenderer content={message.content} color={message.metadata?.bubbleColor} />
        </>
      ) : (
        <>
          {mediaSection}
          {message.content && (
            <MarkdownRenderer
              content={message.content}
              isMine
              proseSize="base"
              className="prose-a:underline prose-a:underline-offset-4 prose-hr:my-3"
            />
          )}
        </>
      )}
    </>
  );
}
