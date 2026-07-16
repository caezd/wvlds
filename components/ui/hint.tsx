"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Hint({
  children,
  side = "bottom",
  content,
}: {
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  content: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-56 text-center">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
