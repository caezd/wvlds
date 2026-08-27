import { SignUpForm } from "@/components/sign-up-form";
import { getTranslations } from "next-intl/server";

/** Titre d'onglet — les pages d'auth s'appelaient toutes « WVLDS ». */
export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("signup") };
}

export default function Page() {
  return <SignUpForm />;
}
