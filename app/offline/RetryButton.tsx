"use client";

import { Button } from "@/components/ui/button";

// Le layout racine ne fournit pas NextIntlClientProvider (seuls
// (protected)/layout.tsx et auth/layout.tsx le font) : le libellé est déjà
// traduit côté serveur par la page et passé en prop plutôt que d'appeler
// useTranslations ici.
export function RetryButton({ label }: { label: string }) {
  return <Button onClick={() => window.location.reload()}>{label}</Button>;
}
