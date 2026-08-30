import { requireAdmin } from "@/lib/admin";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { withRouteMessages } from "@/lib/clientMessages";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // redirect si non-admin

  // Le namespace `admin` (2,6 Ko) n'est lu que sous cette route : il est retiré
  // du tronc commun et remonté ici, pour ne pas voyager sur toutes les autres
  // pages protégées (cf. lib/clientMessages.ts).
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={locale} messages={withRouteMessages(messages, ["admin"])}>
      <div className="flex flex-col h-full">
        <ScrollArea className="flex-1">
          <main className="mx-auto w-full max-w-6xl p-6">
            {children}
          </main>
        </ScrollArea>
      </div>
    </NextIntlClientProvider>
  );
}
