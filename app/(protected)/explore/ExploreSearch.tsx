"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

export function ExploreSearch({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("explore");
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const q = e.target.value.trim();
      timerRef.current = setTimeout(() => {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        router.push(`${pathname}?${params.toString()}`);
      }, 300);
    },
    [router, pathname],
  );

  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        defaultValue={defaultValue}
        onChange={handleChange}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>
  );
}
