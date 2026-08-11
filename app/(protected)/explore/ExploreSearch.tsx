"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildExploreParams } from "./exploreQuery";

export function ExploreSearch({
  defaultValue,
  tags = [],
  avatarTypes = [],
}: {
  defaultValue: string;
  tags?: string[];
  avatarTypes?: string[];
}) {
  const t = useTranslations("explore");
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const q = e.target.value.trim();
      timerRef.current = setTimeout(() => {
        router.push(`${pathname}?${buildExploreParams({ q, tags, avatarTypes })}`);
      }, 300);
    },
    [router, pathname, tags, avatarTypes],
  );

  return (
    <div className="relative w-36 sm:w-56 md:w-72">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        defaultValue={defaultValue}
        onChange={handleChange}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-lg border border-border bg-background pl-9 pr-4 py-1.5 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>
  );
}
