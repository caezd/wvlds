"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Hint({
  children,
  side = "bottom",
  className,
}: {
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className={className ?? "h-3 w-3 text-muted-foreground cursor-default shrink-0"} />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-56 text-center">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
