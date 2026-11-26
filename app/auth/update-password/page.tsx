import { getTranslations } from "next-intl/server";
import { UpdatePasswordForm } from "@/components/update-password-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("updatePassword.setTitle") };
}

export default function Page() {
  return <UpdatePasswordForm />;
}
