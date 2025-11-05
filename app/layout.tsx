import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { PanelRightClose } from "lucide-react";
import "./globals.css";
import Logo from "@/components/logo";

const defaultUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
    metadataBase: new URL(defaultUrl),
    title: "Next.js and Supabase Starter Kit",
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
        <html lang="en" suppressHydrationWarning>
            <body className={`${geistSans.className} antialiased`}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <div className="flex h-full w-full flex-col">
                        <div className="relative flex h-full w-full flex-1 transition-colors z-0">
                            <div className="relative flex h-full w-full flex-row">
                                <aside
                                    className="border-token-border-light relative z-21 h-full shrink-0 overflow-hidden border-e max-md:hidden"
                                    style={{
                                        width: "var(--sidebar-width)",
                                        backgroundColor:
                                            "var(--bg-elevated-secondary)",
                                    }}
                                >
                                    <div className="relative flex h-full flex-col">
                                        <div className="opacity-100 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-linear h-full w-(--sidebar-width) overflow-x-clip overflow-y-auto text-clip whitespace-nowrap bg-token-bg-elevated-secondary">
                                            <nav className="group/scrollport relative flex h-full w-full flex-1 flex-col overflow-y-auto transition-opacity duration-500">
                                                <div className="short:group-data-scrolled-from-top/scrollport:shadow-(--sharp-edge-top-shadow) bg-token-bg-elevated-secondary sticky top-0 z-30">
                                                    <div className="touch:px-1.5 px-2">
                                                        <div
                                                            id="sidebar-header"
                                                            className="h-header-height flex items-center justify-between"
                                                        >
                                                            <a
                                                                aria-label="Dom."
                                                                className="text-token-text-primary no-draggable hover:bg-token-surface-hover keyboard-focused:bg-token-surface-hover touch:h-10 touch:w-10 flex h-9 w-9 items-center justify-center rounded-lg focus:outline-hidden disabled:opacity-50"
                                                                href="/"
                                                                data-discover="true"
                                                            >
                                                                <Logo
                                                                    width={20}
                                                                    height={20}
                                                                />
                                                            </a>
                                                            <div className="flex">
                                                                <button
                                                                    className="text-token-text-tertiary no-draggable hover:bg-token-surface-hover keyboard-focused:bg-token-surface-hover touch:h-10 touch:w-10 flex h-9 w-9 items-center justify-center rounded-lg focus:outline-hidden disabled:opacity-50 no-draggable cursor-w-resize rtl:cursor-e-resize"
                                                                    aria-expanded="true"
                                                                    aria-controls="stage-slideover-sidebar"
                                                                    aria-label="Fermer la barre latérale"
                                                                    data-testid="close-sidebar-button"
                                                                    data-state="closed"
                                                                >
                                                                    <PanelRightClose
                                                                        className="scale-x-[-1]"
                                                                        size={
                                                                            20
                                                                        }
                                                                    />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </nav>
                                        </div>
                                    </div>
                                </aside>
                                <section className="relative flex h-full max-w-full flex-1 flex-col">
                                    <main className="transition-width relative h-full w-full flex-1 overflow-auto">
                                        <div
                                            id="thread"
                                            className="group/thread @container/thread h-full w-full"
                                        >
                                            {children}
                                        </div>
                                    </main>
                                </section>
                            </div>
                        </div>
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
