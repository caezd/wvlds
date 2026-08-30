import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getTranslations } from "next-intl/server";

/** Titre d'onglet — les pages d'auth s'appelaient toutes « WVLDS ». */
export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("forgotPassword") };
}

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
