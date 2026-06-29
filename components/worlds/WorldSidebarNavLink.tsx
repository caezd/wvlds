"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function WorldSidebarNavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [hrefPath, hrefQuery] = href.split("?");
  const currentView = searchParams.get("view");
  const hrefView = hrefQuery ? new URLSearchParams(hrefQuery).get("view") : null;

  const isActive = pathname === hrefPath && currentView === hrefView;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-hoverCard",
        isActive && "bg-hoverCard text-foreground",
      )}
    >
      <span className="shrink-0 text-mist-200">{icon}</span>
      <span className={cn("text-mist-100", isActive && "font-medium")}>{label}</span>
    </Link>
  );
}
