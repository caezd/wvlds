import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { withRouteMessages } from "@/lib/clientMessages";

/**
 * Le namespace `settings` (3 Ko) n'est lu par des composants clients que sous
 * cette route (ProfileSettingsForm). Il est retiré du tronc commun et remonté
 * ici, pour ne pas voyager sur toutes les autres pages protégées
 * (cf. lib/clientMessages.ts).
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={locale} messages={withRouteMessages(messages, ["settings"])}>
      {children}
    </NextIntlClientProvider>
  );
}
