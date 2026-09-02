import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { withRouteMessages } from "@/lib/clientMessages";

/**
 * Le namespace `bugReport` n'est lu côté client que par `BugReportForm`, sous
 * cette seule route. Il est retiré du tronc commun et remonté ici, pour ne pas
 * voyager sur toutes les autres pages protégées (cf. lib/clientMessages.ts).
 *
 * Ce n'était pas le cas tant que le signalement était un modal ouvert depuis le
 * menu utilisateur : il était alors monté sur chaque page.
 */
export default async function BugReportLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={locale} messages={withRouteMessages(messages, ["bugReport"])}>
      {children}
    </NextIntlClientProvider>
  );
}
