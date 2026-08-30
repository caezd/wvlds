"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import NotificationsProvider from "./NotificationsProvider";
import PresenceProvider from "./PresenceProvider";
import { CurrentUserProvider, type InitialUser } from "./CurrentUserProvider";
import { useTranslations } from "next-intl";

const OFFLINE_TOAST_ID = "network-offline";

function NetworkStatusWatcher() {
  const t = useTranslations("common");
  useEffect(() => {
    function onOffline() {
      toast.warning(t("offline"), {
        id: OFFLINE_TOAST_ID,
        description: t("offlineDescription"),
        duration: Infinity,
      });
    }

    function onOnline() {
      toast.dismiss(OFFLINE_TOAST_ID);
      toast.success(t("connectionRestored"));
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    if (!navigator.onLine) onOffline();

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [t]);

  return null;
}

const SESSION_TOAST_ID = "session-expired";

function AuthErrorWatcher() {
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

      if (event === "SIGNED_OUT" && !pathname.startsWith("/auth")) {
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

export default function AppProviders({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: InitialUser;
}) {
  return (
    <CurrentUserProvider initialUser={initialUser}>
      <PresenceProvider>
        <NotificationsProvider>
          <NetworkStatusWatcher />
          <AuthErrorWatcher />
          {children}
        </NotificationsProvider>
      </PresenceProvider>
    </CurrentUserProvider>
  );
}
