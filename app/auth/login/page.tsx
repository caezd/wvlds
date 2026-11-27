import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { NEXT_PARAM, ogImageVersion, safeNextPath, shareTargetFromNext } from "@/lib/sharePreview";
import { getSharePreview } from "@/lib/sharePreviewServer";
import { ogImage, ogLocaleTag } from "@/lib/siteMetadata";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function lireNext(searchParams: Props["searchParams"]): Promise<string | null> {
  const v = (await searchParams)[NEXT_PARAM];
  return safeNextPath(typeof v === "string" ? v : null);
}


/**
 * Titre d'onglet — les pages d'auth s'appelaient toutes « WVLDS ».
 *
 * Arrivé par le lien d'un monde public, la page porte le nom du monde (et du
 * salon) : c'est elle que lisent les robots d'aperçu, qui suivent la
 * redirection du middleware sans session. Un monde non public garde
 * l'aperçu générique.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getTranslations("auth");
  const cible = shareTargetFromNext(await lireNext(searchParams));
  const preview = cible ? await getSharePreview(cible) : null;
  if (!cible || !preview) return { title: t("signin") };

  const locale = await getLocale();
  // Un salon montre l'image de son monde (app/api/og) ; l'adresse canonique
  // reste le lien partagé, sans ses paramètres. La version (`&v=`) change
  // l'adresse de l'image quand elle change : sinon Discord garde l'ancienne.
  const image = ogImage(
    `/api/og?w=${preview.id}&lang=${locale}&v=${ogImageVersion(preview)}`,
    `${preview.name} · WVLDS`,
  );
  const url = `/${cible.kind === "world" ? "w" : "c"}/${cible.id}`;
  const title = preview.chatroomName ? `${preview.chatroomName} · ${preview.name}` : preview.name;
  const description = preview.description ?? undefined;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "WVLDS",
      url,
      title,
      description,
      locale: ogLocaleTag(locale),
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Page({ searchParams }: Props) {
  const next = await lireNext(searchParams);
  const cible = shareTargetFromNext(next);
  const preview = cible ? await getSharePreview(cible) : null;
  return <LoginForm next={next} worldName={preview?.name ?? null} />;
}
