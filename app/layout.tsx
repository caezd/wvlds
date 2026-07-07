import type { Metadata } from "next";
import { Geist, Noto_Serif } from "next/font/google";
import localFont from "next/font/local";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import AppProviders from "@/components/providers/AppProviders";
import type { InitialUser } from "@/components/providers/CurrentUserProvider";
import { asMessageFont, asMessageTextSize } from "@/lib/messagePreferences";
import { getCurrentProfile } from "@/lib/currentRequest";
import { getLocale } from "next-intl/server";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "WVLDS",
  description: "WVLDS — créez des mondes, incarnez vos personnages et écrivez vos histoires en temps réel.",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

// Police alternative pour le texte des chatrooms (préférence utilisateur, voir /settings).
const notoSerif = Noto_Serif({
  variable: "--font-serif",
  display: "swap",
  subsets: ["latin"],
});

// Police adaptée dyslexie pour le texte des chatrooms (préférence utilisateur, voir /settings).
const openDyslexic = localFont({
  src: [
    { path: "../public/fonts/opendyslexic/OpenDyslexic-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/opendyslexic/OpenDyslexic-Italic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/opendyslexic/OpenDyslexic-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/opendyslexic/OpenDyslexic-Bold-Italic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-dyslexic",
  display: "swap",
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
        messageFont: asMessageFont(profile.message_font),
        messageTextSize: asMessageTextSize(profile.message_text_size),
      }
    : null;

  return (
    <html lang={locale} className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body
        className={`${geistSans.className} ${notoSerif.variable} ${openDyslexic.variable} antialiased`}
        suppressHydrationWarning
      >
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
