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
      // Toutes ces vues pointent vers la même page dynamique (?view=…) : le
      // prefetch déclencherait un rendu serveur par onglet à chaque chargement.
      prefetch={false}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
        isActive && "bg-muted text-foreground",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className={cn("text-foreground", isActive && "font-medium")}>{label}</span>
    </Link>
  );
}
