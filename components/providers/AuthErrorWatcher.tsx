"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { consumeAnnouncedSignOut } from "@/lib/intentionalSignOut";

/**
 * Annonce la perte de session, et elle seule.
 *
 * Dans son propre fichier pour être éprouvé : `AppProviders` entraîne avec lui
 * la présence, les notifications et le Realtime, tout un attirail dont ce
 * surveillant n'a que faire — et le monter pour vérifier un toast revenait à
 * ne rien vérifier du tout.
 */
const SESSION_TOAST_ID = "session-expired";

export function AuthErrorWatcher() {
  const t = useTranslations("common");
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      if (event === "TOKEN_REFRESHED" && session?.access_token) {
        // Pousse le nouveau JWT à toutes les connexions Realtime (singleton)
        supabase.realtime.setAuth(session.access_token);
        toast.dismiss(SESSION_TOAST_ID);
      }

      if (event === "SIGNED_OUT") {
        // Consommé quoi qu'il arrive : le drapeau ne vaut que pour CE
        // `SIGNED_OUT`, et le laisser en place masquerait la prochaine
        // expiration — celle qu'il faut vraiment annoncer.
        const voulue = consumeAnnouncedSignOut();
        if (voulue || pathname.startsWith("/auth")) return;

        toast.error(t("sessionExpired"), {
          id: SESSION_TOAST_ID,
          description: t("sessionExpiredDescription"),
          duration: Infinity,
          action: {
            label: "Recharger",
            onClick: () => window.location.reload(),
          },
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [pathname, t]);

  return null;
}
