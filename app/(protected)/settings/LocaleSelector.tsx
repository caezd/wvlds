"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { messageErreurAction } from "@/lib/actionErrors";
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
  const tCommun = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(locale: string) {
    startTransition(async () => {
      const result = await updateLocale(locale);
      if (result?.success) {
        toast.success(t("languageSaved"));
        router.refresh();
      } else if (result?.error) {
        // L'erreur était ignorée : la langue changeait à l'écran (le cookie est
        // posé avant l'écriture) mais la préférence, non enregistrée, était
        // perdue à la session suivante — sans que rien ne le signale.
        toast.error(messageErreurAction(result.error, tCommun));
      }
    });
  }

  return (
    <Select value={currentLocale} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-48" aria-label={t("languageLabel")}>
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
