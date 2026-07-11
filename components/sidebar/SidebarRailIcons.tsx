"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function RailIcon({
  href,
  label,
  children,
  exact = false,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:text-mist-50 relative",
            isActive
              ? "bg-carbon-700 text-mist-50"
              : "text-mist-100",
          )}
          aria-label={label}
        >
          {isActive && (
            <span className="absolute w-[8px] h-[20px] bg-mist-50 -left-2 -translate-x-[6px] rounded-full" />
          )}
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
