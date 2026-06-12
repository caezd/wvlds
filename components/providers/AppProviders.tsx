"use client";
import { useEffect } from "react";
import { toast } from "sonner";
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

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PresenceProvider>
      <NotificationsProvider>
        <NetworkStatusWatcher />
        {children}
      </NotificationsProvider>
    </PresenceProvider>
  );
}
