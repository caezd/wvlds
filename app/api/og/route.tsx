import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { OG_ICON_SIZE, OG_SIZE, OgCard, OgWorldCard, loadGeist, ogLocale, ogTitle, ogWorldTexts } from "@/lib/ogCard";
import { loadOgImage } from "@/lib/ogImages";
import { shareTargetFromNext } from "@/lib/sharePreview";
import { getSharePreview } from "@/lib/sharePreviewServer";

/**
 * Image d'aperçu des liens (OpenGraph), 1200×630.
 *
 *   /api/og?lang=fr          générique : l'accroche de l'application
 *   /api/og?w=<id>&lang=en   un monde : sa bannière en fond, sa carte
 *   &v=…                     ignoré ici : une version, pour que l'adresse change avec l'image
 *
 * Le lien d'un salon montre l'image de son monde (app/auth/login/page.tsx).
 * Joignable sans session (le middleware laisse passer /api) : ce sont les
 * robots d'aperçu qui la demandent. Un monde supprimé, ou un id invalide,
 * donne l'image générique — jamais une erreur. Un monde privé n'a ni
 * bannière ni icône (la base n'en envoie que le nom) : un cadenas à la place.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const locale = ogLocale(params.get("lang"));
  const cible = shareTargetFromNext(`/w/${params.get("w") ?? ""}`);

  const [preview, fonts] = await Promise.all([cible ? getSharePreview(cible) : null, loadGeist()]);
  const [banner, icon] = await Promise.all([
    loadOgImage(preview?.bannerUrl, { ...OG_SIZE, format: "jpeg" }),
    // Deux fois la taille affichée, pour rester net.
    loadOgImage(preview?.iconUrl, { width: OG_ICON_SIZE * 2, height: OG_ICON_SIZE * 2, format: "png" }),
  ]);
  const carte = preview ? (
    <OgWorldCard {...ogWorldTexts(locale, preview)} banner={banner} icon={icon} />
  ) : (
    <OgCard title={ogTitle(locale)} />
  );

  return new ImageResponse(carte, {
    ...OG_SIZE,
    fonts: fonts.length ? fonts : undefined,
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
