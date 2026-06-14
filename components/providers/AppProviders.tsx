"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import NotificationsProvider from "./NotificationsProvider";
import PresenceProvider from "./PresenceProvider";

const OFFLINE_TOAST_ID = "network-offline";

function NetworkStatusWatcher() {
  useEffect(() => {
    function onOffline() {
      toast.warning("Pas de connexion internet", {
        id: OFFLINE_TOAST_ID,
        description: "Certaines fonctionnalités sont indisponibles.",
        duration: Infinity,
      });
    }

    function onOnline() {
      toast.dismiss(OFFLINE_TOAST_ID);
      toast.success("Connexion rétablie");
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    if (!navigator.onLine) onOffline();

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}

const SESSION_TOAST_ID = "session-expired";

function AuthErrorWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.access_token) {
        // Pousse le nouveau JWT à toutes les connexions Realtime (singleton)
        supabase.realtime.setAuth(session.access_token);
        toast.dismiss(SESSION_TOAST_ID);
      }

      if (event === "SIGNED_OUT" && !pathname.startsWith("/auth")) {
        toast.error("Session expirée", {
          id: SESSION_TOAST_ID,
          description: "Rechargez la page pour continuer.",
          duration: Infinity,
          action: {
            label: "Recharger",
            onClick: () => window.location.reload(),
          },
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [pathname]);

  return null;
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PresenceProvider>
      <NotificationsProvider>
        <NetworkStatusWatcher />
        <AuthErrorWatcher />
        {children}
      </NotificationsProvider>
    </PresenceProvider>
  );
}
