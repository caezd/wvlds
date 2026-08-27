import dynamic from "next/dynamic";
import SidebarRail from "@/components/sidebar/SidebarRail";
import AppShell from "@/components/sidebar/AppShell";
import { FeatureFlagsProvider } from "@/components/providers/FeatureFlagsProvider";
import { getCurrentUserId, getCurrentProfile, getCachedFeatureFlags } from "@/lib/currentRequest";
import { NextIntlClientProvider } from "next-intl";
import { shellMessages } from "@/lib/clientMessages";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LocaleSync } from "@/components/i18n/LocaleSync";

// Rendu uniquement pour les comptes sans pseudo (rare) — pas de chunk client
// dédié pour la quasi-totalité des chargements de pages protégées.
const UsernameRequiredDialog = dynamic(() =>
  import("@/components/UsernameRequiredDialog").then((m) => m.UsernameRequiredDialog),
);

export default async function PageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tout est mémoïsé pour la requête (partagé avec le root layout et le rail).
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  // `worlds` / `worldsQuota` ne sont plus chargés ici : ils n'alimentaient que
  // `WorldsRail`, désactivé par `WORLDS_RAIL_ENABLED = false` (cf. AppShell).
  // Sur toutes les pages protégées hors /w et /c, c'était 4 requêtes pour un
  // composant mort — plus la sérialisation du tableau complet des mondes dans
  // le flux RSC à chaque navigation. À réintroduire si le rail revient.
  const [featureFlags, profile] = await Promise.all([
    getCachedFeatureFlags(),
    getCurrentProfile(),
  ]);

  let usernameDialog: React.ReactNode = null;
  let localeSync: React.ReactNode = null;

  if (!profile?.username) {
    usernameDialog = <UsernameRequiredDialog userId={userId} />;
  }

  // Sync DB locale preference to cookie when they differ (e.g. new device login)
  if (profile?.locale) {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    if (cookieLocale !== profile.locale) {
      localeSync = <LocaleSync dbLocale={profile.locale} />;
    }
  }

  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={locale} messages={shellMessages(messages)}>
      <FeatureFlagsProvider flags={featureFlags}>
        <div className="flex h-full w-full flex-col">
          <div className="relative flex h-full w-full flex-1 z-0">
            <AppShell rail={<SidebarRail />}>
              {children}
            </AppShell>
            {usernameDialog}
            {localeSync}
          </div>
        </div>
      </FeatureFlagsProvider>
    </NextIntlClientProvider>
  );
}
