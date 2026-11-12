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
  experimental: {
    // Cache du routeur client pour les pages dynamiques (0 s par défaut) :
    // revenir sur un salon ou un monde visité dans les 30 dernières secondes
    // (retour arrière, aller-retour entre deux salons) s'affiche sans
    // aller-retour serveur. Le temps réel reste juste parce que chaque vue
    // rouvre ses canaux au montage, et que le salon RATTRAPE les messages
    // postés depuis le rendu mis en cache (cf. hooks/useRealtimeChatSync.ts).
    // `router.refresh()` et les Server Actions (`revalidatePath`) vident ce
    // cache : une modification faite par l'utilisateur reste visible aussitôt.
    staleTimes: {
      dynamic: 30,
    },
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
