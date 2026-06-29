"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncLocale } from "@/app/(protected)/settings/actions";

export function LocaleSync({ dbLocale }: { dbLocale: string }) {
  const router = useRouter();

  useEffect(() => {
    syncLocale(dbLocale).then(() => router.refresh());
  }, [dbLocale, router]);

  return null;
}
