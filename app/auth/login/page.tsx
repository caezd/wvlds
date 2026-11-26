import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { NEXT_PARAM, safeNextPath, shareTargetFromNext, type ShareTarget } from "@/lib/sharePreview";
import { getSharePreview } from "@/lib/sharePreviewServer";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function lireNext(searchParams: Props["searchParams"]): Promise<string | null> {
  const v = (await searchParams)[NEXT_PARAM];
  return safeNextPath(typeof v === "string" ? v : null);
}

/** Adresse de l'image d'aperçu d'un monde ou d'un salon (app/api/og). */
function ogImage(cible: ShareTarget, locale: string): string {
  return `/api/og?${cible.kind === "world" ? "w" : "c"}=${cible.id}&lang=${locale}`;
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
  const image = ogImage(cible, locale);
  const title = preview.chatroomName ? `${preview.chatroomName} · ${preview.name}` : preview.name;
  const description = preview.description ?? undefined;
  return {
    title,
    description,
    openGraph: { type: "website", siteName: "WVLDS", title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Page({ searchParams }: Props) {
  const next = await lireNext(searchParams);
  const cible = shareTargetFromNext(next);
  const preview = cible ? await getSharePreview(cible) : null;
  return <LoginForm next={next} worldName={preview?.name ?? null} />;
}
