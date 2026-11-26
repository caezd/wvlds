import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * L'échec d'un lien de confirmation (cf. app/auth/confirm/route.ts). Le
 * message de Supabase, passé dans `?error=`, n'est pas affiché : il est en
 * anglais et technique ; la page dit l'essentiel dans la langue du visiteur.
 */
export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("errorPage.title") };
}

export default async function Page({
  // Le paramètre reste dans l'URL (utile au diagnostic), sans être affiché.
  searchParams: _searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("auth");
  return (
    <div>
      <h2 className="text-xl font-semibold md:text-2xl">{t("errorPage.title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("errorPage.description")}</p>
      <Link href="/auth/login" className="mt-4 inline-block text-sm underline">
        {t("backToSignin")}
      </Link>
    </div>
  );
}
