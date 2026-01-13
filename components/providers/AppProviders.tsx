// components/providers/AppProviders.tsx
"use client";
import NotificationsProvider from "./NotificationsProvider";

export default function AppProviders({
    children,
}: {
    children: React.ReactNode;
}) {
    return <NotificationsProvider>{children}</NotificationsProvider>;
}
