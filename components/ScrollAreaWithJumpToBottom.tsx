"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";

type Props = {
  className?: string;
  thresholdPx?: number;
  startAtBottom?: boolean;
  children: React.ReactNode;
};

export const ScrollAreaWithJumpToBottom = React.forwardRef<HTMLDivElement, Props>(
function ScrollAreaWithJumpToBottom({
  className,
  thresholdPx = 160,
  startAtBottom = true,
  children,
}, ref) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Expose rootRef via forwardRef
  React.useImperativeHandle(ref, () => rootRef.current!);
  const [showDown, setShowDown] = React.useState(false);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const viewport = root.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;

    if (!viewport) return;

    const scrollToBottomInstant = () => {
      viewport.scrollTop = viewport.scrollHeight;
    };

    const compute = () => {
      const distanceToBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

      setShowDown(distanceToBottom > thresholdPx);
    };

    // 1) Init: commencer en bas (après rendu)
    let initializing = true;

    const initScroll = () => {
      if (!startAtBottom) {
        initializing = false;
        compute();
        return;
      }

      // Double rAF: plus fiable (DOM + layout + paint)
      requestAnimationFrame(() => {
        scrollToBottomInstant();
        requestAnimationFrame(() => {
          scrollToBottomInstant();
          initializing = false;
          compute();
        });
      });
    };

    initScroll();

    // 2) Listener scroll
    const onScroll = () => compute();
    viewport.addEventListener("scroll", onScroll, { passive: true });

    // 3) Si le contenu change au chargement (ex: messages/images),
    // on “colle” au bas tant qu’on est en phase d’init.
    const ro = new ResizeObserver(() => {
      if (initializing && startAtBottom) {
        scrollToBottomInstant();
      }
      compute();
    });
    ro.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [thresholdPx, startAtBottom]);

  const scrollToBottom = () => {
    const root = rootRef.current;
    if (!root) return;

    const viewport = root.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;

    if (!viewport) return;

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  };

  return (
    <div ref={rootRef} className="relative h-full">
      <ScrollArea className={className}>{children}</ScrollArea>

      <div
        className={[
          // Offset surchargeable via --jump-btn-bottom (ex. si le footer chevauche la zone de scroll)
          "pointer-events-none absolute bottom-[var(--jump-btn-bottom,2.5rem)] left-1/2 -translate-x-1/2 z-10",
          "transition-opacity duration-200",
          showDown ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={
            showDown
              ? "pointer-events-auto rounded-full shadow hover:bg-hoverCard hover:text-foreground"
              : "pointer-events-none rounded-full shadow hover:bg-hoverCard hover:text-foreground"
          }
          tabIndex={showDown ? 0 : -1}
          aria-hidden={!showDown}
          onClick={scrollToBottom}
          aria-label="Descendre"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
