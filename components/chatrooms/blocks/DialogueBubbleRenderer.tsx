"use client";

import { parseDialogue } from "@/lib/dialogue-bubbles";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { cn } from "@/lib/utils";

export function DialogueBubbleRenderer({
  content,
  color,
  className,
}: {
  content: string;
  color?: string | null;
  className?: string;
}) {
  const parts = parseDialogue(content);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {parts.map((part, i) => {
        if (part.kind === "prose") {
          if (!part.text) return null;
          return (
            <MarkdownRenderer
              key={i}
              content={part.text}
              className="text-sm prose-a:underline prose-a:underline-offset-4"
            />
          );
        }

        return (
          <div key={i} className="inline-flex items-end gap-2 flex-wrap">
            <div
              className={cn("relative rounded-xl rounded-tl-[3px] px-3 py-1.5 text-sm leading-snug max-w-prose", !color && "bg-muted")}
              style={color ? { backgroundColor: color + "33" } : undefined}
            >
              {part.speech}
            </div>
            {part.incise && (
              <span className="text-xs text-muted-foreground italic pb-1">
                {part.incise}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
