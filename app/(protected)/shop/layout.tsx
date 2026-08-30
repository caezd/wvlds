import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { withRouteMessages } from "@/lib/clientMessages";

/**
 * Le namespace `shop` n'est lu par des composants clients que sous cette route.
 * Il est retiré du tronc commun et remonté ici (cf. lib/clientMessages.ts).
 */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={locale} messages={withRouteMessages(messages, ["shop"])}>
      {children}
    </NextIntlClientProvider>
  );
}
