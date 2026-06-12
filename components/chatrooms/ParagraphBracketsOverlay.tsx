"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Bracket = { top: number; height: number; index: number; offset: number };

const COLORS = [
  "rgba(96,165,250,0.35)",
  "rgba(167,139,250,0.35)",
  "rgba(52,211,153,0.35)",
  "rgba(251,191,36,0.35)",
  "rgba(251,113,133,0.35)",
];

export function ParagraphBracketsOverlay({
  value,
  textareaRef,
}: {
  value: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [brackets, setBrackets] = useState<Bracket[]>([]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;

    const cs = window.getComputedStyle(ta);
    const marginTop = Math.max(0, parseFloat(cs.marginTop) || 0);
    mirror.style.font = cs.font;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.paddingTop = cs.paddingTop;
    mirror.style.paddingBottom = cs.paddingBottom;
    mirror.style.paddingLeft = cs.paddingLeft;
    mirror.style.paddingRight = cs.paddingRight;
    mirror.style.width = `${ta.offsetWidth}px`;
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordBreak = cs.wordBreak;
    mirror.style.overflowWrap = cs.overflowWrap;
    mirror.style.boxSizing = "border-box";

    const paragraphs = value.split(/\n{2,}/);
    mirror.innerHTML = paragraphs
      .map((p, i) => {
        const escaped = p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
        const sep = i < paragraphs.length - 1 ? "<br><br>" : "";
        return `<span data-para="${i}">${escaped}${sep}</span>`;
      })
      .join("");

    const result: Bracket[] = [];
    paragraphs.forEach((_, i) => {
      const span = mirror.querySelector<HTMLElement>(`[data-para="${i}"]`);
      if (span) {
        const top = span.offsetTop;
        const height = span.offsetHeight;
        if (Number.isFinite(top) && Number.isFinite(height)) {
          result.push({ top, height, index: i, offset: marginTop });
        }
      }
    });
    setBrackets(result);
  }, [value]);

  const show = value.split(/\n{2,}/).filter(Boolean).length > 1;

  return (
    <>
      <div
        ref={mirrorRef}
        aria-hidden
        className="absolute top-0 left-0 invisible pointer-events-none"
      />
      {show &&
        brackets.map((b) => (
          <div
            key={b.index}
            className="absolute pointer-events-none z-10"
            style={{
              top: b.top + b.offset + 10,
              left: 0,
              width: 5,
              height: Math.max(b.height - 20, 4),
              borderTop: `1px solid ${COLORS[b.index % COLORS.length]}`,
              borderBottom: `1px solid ${COLORS[b.index % COLORS.length]}`,
              borderLeft: `1px solid ${COLORS[b.index % COLORS.length]}`,
              borderTopLeftRadius: 3,
              borderBottomLeftRadius: 3,
            }}
          />
        ))}
    </>
  );
}
