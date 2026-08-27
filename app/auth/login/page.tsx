import { LoginForm } from "@/components/login-form";
import { getTranslations } from "next-intl/server";

/** Titre d'onglet — les pages d'auth s'appelaient toutes « WVLDS ». */
export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("signin") };
}

export default function Page() {
    return <LoginForm />;
}
