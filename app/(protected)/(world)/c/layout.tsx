import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { withRouteMessages } from "@/lib/clientMessages";

/**
 * Layout commun à tous les salons, AU-DESSUS du segment `[id]`.
 *
 * La barre latérale du monde vit plus haut, dans `app/(protected)/(world)/layout.tsx`,
 * partagé avec les pages de monde : elle reste montée d'un salon à l'autre
 * comme entre l'accueil d'un monde et ses salons.
 *
 * `catalogue` : la fiche d'un objet s'ouvre depuis l'inventaire d'un persona
 * consulté dans le salon (migration 186) — c'est le seul onglet de monde que
 * le salon lit ; wiki, carte et relations restent à /w/[id].
 */
export default async function ChatroomsLayout({ children }: { children: ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider locale={locale} messages={withRouteMessages(messages, ["catalogue"])}>
      {children}
    </NextIntlClientProvider>
  );
}
