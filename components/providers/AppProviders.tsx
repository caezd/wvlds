"use client";
import { useEffect } from "react";
import { toast } from "sonner";
import NotificationsProvider from "./NotificationsProvider";
import PresenceProvider from "./PresenceProvider";
import { CurrentUserProvider, type InitialUser } from "./CurrentUserProvider";
import { ClientErrorRecorder } from "@/components/support/ClientErrorRecorder";
import { AuthErrorWatcher } from "./AuthErrorWatcher";
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
          {/* Retient les dernières erreurs du navigateur pour qu'un signalement
              puisse les emporter. Ici plutôt que dans le groupe protégé : une
              erreur qui empêche de se connecter est celle qu'on ne saurait pas
              décrire autrement. */}
          <ClientErrorRecorder />
          {children}
        </NotificationsProvider>
      </PresenceProvider>
    </CurrentUserProvider>
  );
}
