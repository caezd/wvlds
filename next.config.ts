import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
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
