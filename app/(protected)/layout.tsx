import { createClient } from "@/lib/supabase/server";
import SidebarRail from "@/components/sidebar/SidebarRail";
import AppShell from "@/components/sidebar/AppShell";
import GlobalWorldsSidebar from "@/components/sidebar/GlobalWorldsSidebar";
import { UsernameRequiredDialog } from "@/components/UsernameRequiredDialog";
import { FeatureFlagsProvider } from "@/components/providers/FeatureFlagsProvider";
import { getFeatureFlags } from "@/lib/featureFlags";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LocaleSync } from "@/components/i18n/LocaleSync";

export default async function PageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const featureFlags = await getFeatureFlags(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  let usernameDialog: React.ReactNode = null;
  let localeSync: React.ReactNode = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, locale")
      .eq("id", user.id)
      .single();

    if (!profile?.username) {
      usernameDialog = <UsernameRequiredDialog userId={user.id} />;
    }

    // Sync DB locale preference to cookie when they differ (e.g. new device login)
    if (profile?.locale) {
      const cookieStore = await cookies();
      const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
      if (cookieLocale !== profile.locale) {
        localeSync = <LocaleSync dbLocale={profile.locale} />;
      }
    }
  }

  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FeatureFlagsProvider flags={featureFlags}>
        <div className="flex h-full w-full flex-col">
          <div className="relative flex h-full w-full flex-1 z-0">
            <AppShell rail={<SidebarRail />} worldsSidebar={<GlobalWorldsSidebar />}>
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
