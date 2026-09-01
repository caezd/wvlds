import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

let supabaseHostname: string | undefined;
try {
  supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
    : undefined;
} catch {
  supabaseHostname = undefined;
}

const nextConfig: NextConfig = {
  // Version déployée, jointe aux signalements de bug (voir lib/bugReports.ts).
  // Sans elle, un rapport ne dit pas CONTRE QUOI il a été écrit — et une
  // version déployée depuis peut avoir déjà corrigé le problème. Vercel expose
  // le SHA du commit déployé ; en local il n'y en a pas.
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  },
  turbopack: {
    // pnpm virtual store requires explicit root for module resolution
    root: __dirname,
  },
  images: {
    remotePatterns: [
      // fallback large : couvre tous les projets Supabase (dev/staging/prod)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/**" },
      ...(supabaseHostname && !supabaseHostname.endsWith(".supabase.co")
        ? [{ protocol: "https" as const, hostname: supabaseHostname, pathname: "/storage/v1/**" }]
        : []),
      // CDN des emoji Twitter (ReactionEmoji)
      { protocol: "https", hostname: "cdn.jsdelivr.net", pathname: "/npm/emoji-datasource-twitter/**" },
    ],
  },
};

export default withNextIntl(nextConfig);
