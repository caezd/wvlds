import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import AppProviders from "@/components/providers/AppProviders";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`} suppressHydrationWarning>
        <AppProviders>
          <div id="app-shell" className="h-full">
            {children}
          </div>
        </AppProviders>
        <Toaster />
      </body>
    </html>
  );
}
