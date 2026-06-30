import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import AppProviders from "@/components/providers/AppProviders";
import type { InitialUser } from "@/components/providers/CurrentUserProvider";
import { getCurrentProfile } from "@/lib/currentRequest";
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
  // Profil mémoïsé pour la requête → partagé avec le layout protégé et le rail.
  const profile = await getCurrentProfile();
  const initialUser: InitialUser = profile
    ? {
        id: profile.id,
        username: profile.username ?? null,
        avatarUrl: profile.avatar_url ?? null,
        appearOffline: !!profile.appear_offline,
        plan: profile.plan ?? null,
      }
    : null;

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
