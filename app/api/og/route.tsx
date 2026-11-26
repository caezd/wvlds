import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { OgCard, loadGeist, ogLocale, ogTexts } from "@/lib/ogCard";
import { shareTargetFromNext } from "@/lib/sharePreview";
import { getSharePreview } from "@/lib/sharePreviewServer";

/**
 * Image d'aperçu des liens (OpenGraph), 1200×630.
 *
 *   /api/og?lang=fr          générique : l'accroche de l'application
 *   /api/og?w=<id>&lang=en   un monde public
 *   /api/og?c=<id>&lang=es   un salon d'un monde public
 *
 * Joignable sans session (le middleware laisse passer /api) : ce sont les
 * robots d'aperçu qui la demandent. Un monde non public, ou un id invalide,
 * donne l'image générique — jamais une erreur qui trahirait son existence.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const locale = ogLocale(params.get("lang"));
  const w = params.get("w");
  const c = params.get("c");
  const cible = shareTargetFromNext(w ? `/w/${w}` : c ? `/c/${c}` : null);

  const [preview, fonts] = await Promise.all([cible ? getSharePreview(cible) : null, loadGeist()]);

  return new ImageResponse(<OgCard {...ogTexts(locale, preview)} />, {
    width: 1200,
    height: 630,
    fonts: fonts.length ? fonts : undefined,
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
