"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateLocale } from "./actions";
import { SUPPORTED_LOCALES } from "@/i18n/locales";

export function LocaleSelector({ currentLocale }: { currentLocale: string }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(locale: string) {
    startTransition(async () => {
      const result = await updateLocale(locale);
      if (result?.success) {
        toast.success(t("languageSaved"));
        router.refresh();
      }
    });
  }

  return (
    <Select value={currentLocale} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {t(`locales.${locale}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
