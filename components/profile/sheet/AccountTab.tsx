"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, KeyRound, Mail } from "lucide-react";

/** L'onglet « Compte » : l'adresse e-mail, et le changement de mot de passe. */
export function AccountTab({ email }: { email: string }) {
  const t = useTranslations("userProfile");
  const tNav = useTranslations("nav");
  const router = useRouter();
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{t("email")}</span>
          <span className="truncate text-sm">{email}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => router.push("/auth/update-password")}
        className="flex items-center gap-3 px-3.5 py-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1">{tNav("password")}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </div>
  );
}
