import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import AppProviders from "@/components/providers/AppProviders";
import type { InitialUser } from "@/components/providers/CurrentUserProvider";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "WVLDS",
  description: "The fastest way to build apps with Next.js and Supabase",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  // Identité résolue côté serveur : diffusée par contexte pour éviter que
  // chaque composant client refasse getUser() + select username au boot.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let initialUser: InitialUser = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, avatar_url, appear_offline, plan")
      .eq("id", user.id)
      .single();
    initialUser = {
      id: user.id,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      appearOffline: !!profile?.appear_offline,
      plan: profile?.plan ?? null,
    };
  }

  return (
    <html lang={locale} className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`} suppressHydrationWarning>
        <AppProviders initialUser={initialUser}>
          <div id="app-shell" className="h-full">
            {children}
          </div>
        </AppProviders>
        <Toaster />
      </body>
    </html>
  );
}
