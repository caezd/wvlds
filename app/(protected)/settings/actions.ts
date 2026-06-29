"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/locales";

function isSupported(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

const COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
};

export async function updateLocale(locale: string) {
  if (!isSupported(locale)) return { error: "Locale non supportée" };

  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, COOKIE_OPTIONS);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.from("profiles").update({ locale }).eq("id", user.id);
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// Called by LocaleSync client component to sync a DB locale preference to cookie
export async function syncLocale(locale: string) {
  if (!isSupported(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, COOKIE_OPTIONS);
}
