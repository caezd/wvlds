"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNotifications } from "@/components/providers/NotificationsProvider";

export function RailIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={label}
        >
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function WorldIcon({ name, id }: { name: string; id: string }) {
  const initial = (name ?? "W")[0].toUpperCase();
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500",   "bg-cyan-500",  "bg-indigo-500",  "bg-pink-500",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  const { worldUnread } = useNotifications();
  const unread = worldUnread[id] ?? 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/w/${id}`}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:opacity-90 transition-opacity"
          aria-label={name}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold text-white ${color}`}
          >
            {initial}
          </span>
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-0.5 shadow-[0_0_0_2px_hsl(var(--background))]">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {name}
        {unread > 0 && ` · ${unread} non-lu${unread > 1 ? "s" : ""}`}
      </TooltipContent>
    </Tooltip>
  );
}

export function EmptyWorldsIcon() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex h-9 w-9 items-center justify-center text-muted-foreground opacity-30">
          <Globe size={17} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>Aucun monde</TooltipContent>
    </Tooltip>
  );
}
