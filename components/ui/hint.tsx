"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Hint({
  children,
  side = "bottom",
  className,
  content,
}: {
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  content?: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}

      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-56 text-center">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
