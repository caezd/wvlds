"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function RetryButton() {
  const t = useTranslations("offline");
  return <Button onClick={() => window.location.reload()}>{t("retry")}</Button>;
}
