import type { Metadata, Viewport } from "next";
import { Caveat, Geist, Noto_Serif } from "next/font/google";
import localFont from "next/font/local";

import "./globals.css";
import { SerwistProvider } from "@serwist/next/react";
import { Toaster } from "@/components/ui/sonner";
import AppProviders from "@/components/providers/AppProviders";
import type { InitialUser } from "@/components/providers/CurrentUserProvider";
import { asMessageFont, asMessageTextSize, asMessageTextAlign } from "@/lib/messagePreferences";
import { getCurrentProfile } from "@/lib/currentRequest";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { ROOT_PROVIDER_NAMESPACES, pickMessages } from "@/lib/clientMessages";
import { siteMetadata } from "@/lib/siteMetadata";

// Base des adresses absolues des métadonnées (images d'aperçu comprises).
// En production, le domaine du projet : VERCEL_URL est celle du déploiement
// (wvlds-<hash>.vercel.app), qui peut être protégée — un robot d'aperçu y
// recevrait un 401 au lieu de l'image.
const defaultUrl =
  process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("meta"), getLocale()]);
  return {
    metadataBase: new URL(defaultUrl),
    applicationName: "WVLDS",
    title: {
      // Chaque page hérite du gabarit : sans lui, tous les onglets s'appelaient
      // « WVLDS », y compris quand on en ouvre plusieurs sur des salons
      // différents. `default` couvre les pages qui ne posent pas de titre.
      default: "WVLDS",
      template: "%s · WVLDS",
    },
    description: t("description"),
    // Aperçu des liens (lib/siteMetadata) : l'accroche, l'image traduite.
    ...siteMetadata(t("description"), locale),
    appleWebApp: {
      capable: true,
      title: "WVLDS",
      statusBarStyle: "black-translucent",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Étend le contenu sous les zones d'encoche/coins arrondis en PWA
  // installée (safe-area-inset-* disponibles côté CSS).
  viewportFit: "cover",
  themeColor: "#1B1B1D",
  // Le clavier virtuel mobile rétrécit le viewport de layout (donc les
  // unités dvh) au lieu de simplement se superposer par-dessus — permet aux
  // drawers plein écran en h-[calc(100dvh-…)] (composer, etc.) de rester
  // correctement dimensionnés et à leurs actions du bas de rester visibles
  // juste au-dessus du clavier, sans JS.
  interactiveWidget: "resizes-content",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

// Police alternative pour le texte des chatrooms (préférence utilisateur, voir /settings).
// preload: false — n'est utilisée que par une minorité d'utilisateurs, inutile
// de la précharger pour tout le monde par défaut.
const notoSerif = Noto_Serif({
  variable: "--font-serif",
  display: "swap",
  subsets: ["latin"],
  preload: false,
});

// Police manuscrite, proposée pour le titre des encadrés. Non préchargée : le
// navigateur ne la télécharge que si un encadré l'affiche.
const caveat = Caveat({
  variable: "--font-hand",
  display: "swap",
  subsets: ["latin"],
  preload: false,
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
  preload: false,
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Identité résolue côté serveur : diffusée par contexte pour éviter que
  // chaque composant client refasse getUser() + select username au boot.
  // Profil mémoïsé pour la requête → partagé avec le layout protégé et le rail.
  //
  // La locale (cookie/en-tête) et le profil (requête réseau) sont indépendants :
  // les enchaîner faisait attendre le second pour rien.
  const [locale, messages, profile] = await Promise.all([
    getLocale(),
    getMessages(),
    getCurrentProfile(),
  ]);
  const initialUser: InitialUser = profile
    ? {
        id: profile.id,
        username: profile.username ?? null,
        avatarUrl: profile.avatar_url ?? null,
        appearOffline: !!profile.appear_offline,
        plan: profile.plan ?? null,
        messageFont: asMessageFont(profile.message_font),
        messageTextSize: asMessageTextSize(profile.message_text_size),
        messageTextAlign: asMessageTextAlign(profile.message_text_align),
      }
    : null;

  return (
    <html lang={locale} className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body
        className={`${geistSans.className} ${notoSerif.variable} ${caveat.variable} ${openDyslexic.variable} antialiased`}
        suppressHydrationWarning
      >
        <SerwistProvider
          swUrl="/sw.js"
          disable={process.env.NODE_ENV === "development"}
          cacheOnNavigation
          // Explicitement à false : la valeur par défaut de Serwist est true,
          // et elle recharge la page à CHAQUE événement « online » du
          // navigateur, sans condition — Firefox l'émet au moindre changement
          // d'interface réseau (wifi, VPN, station d'accueil), même sans
          // coupure perçue. Un formulaire en cours (image de catégorie envoyée
          // mais pas encore enregistrée, brouillon…) était perdu sans prévenir.
          // La reconnexion temps réel est déjà gérée par useReconnectEpoch.
          reloadOnOnline={false}
        >
          {/* Les providers de la racine (présence, veille réseau et session)
              affichent des messages traduits, et vivent AU-DESSUS du provider
              du groupe (protected) : sans celui-ci, `useTranslations` n'y
              trouve aucun contexte et le rendu casse. On ne remonte que les
              deux namespaces qu'ils lisent — le tronc commun reste découpé
              par segment, cf. lib/clientMessages. */}
          <NextIntlClientProvider
            locale={locale}
            messages={pickMessages(messages, ROOT_PROVIDER_NAMESPACES)}
          >
          <AppProviders initialUser={initialUser}>
            <div id="app-shell" className="h-full">
              {children}
            </div>
          </AppProviders>
          </NextIntlClientProvider>
          <Toaster />
        </SerwistProvider>
      </body>
    </html>
  );
}
