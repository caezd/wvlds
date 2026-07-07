"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/locales";
import { sanitizePronouns } from "@/lib/pronouns";

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

const MESSAGE_FONTS = ["sans", "serif", "dyslexic"] as const;
type MessageFont = (typeof MESSAGE_FONTS)[number];

function isSupportedFont(value: string): value is MessageFont {
  return (MESSAGE_FONTS as readonly string[]).includes(value);
}

export async function updateMessageFont(font: string) {
  if (!isSupportedFont(font)) return { error: "Police non supportée" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase
    .from("profiles")
    .update({ message_font: font })
    .eq("id", user.id);

  if (error) return { error: error.message ?? "Impossible d'enregistrer la police." };

  revalidatePath("/", "layout");
  return { success: true };
}

const MESSAGE_TEXT_SIZES = ["sm", "base", "lg"] as const;
type MessageTextSize = (typeof MESSAGE_TEXT_SIZES)[number];

function isSupportedTextSize(value: string): value is MessageTextSize {
  return (MESSAGE_TEXT_SIZES as readonly string[]).includes(value);
}

export async function updateMessageTextSize(size: string) {
  if (!isSupportedTextSize(size)) return { error: "Taille non supportée" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase
    .from("profiles")
    .update({ message_text_size: size })
    .eq("id", user.id);

  if (error) return { error: error.message ?? "Impossible d'enregistrer la taille du texte." };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateProfileBioAndPronouns(bio: string, pronouns: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const trimmedBio = bio.trim().slice(0, 500);
  const cleanPronouns = sanitizePronouns(pronouns);

  const { error } = await supabase
    .from("profiles")
    .update({ bio: trimmedBio || null, pronouns: cleanPronouns })
    .eq("id", user.id);

  if (error) return { error: error.message ?? "Impossible d'enregistrer le profil." };

  revalidatePath("/settings");
  return { success: true };
}
