"use client";

import * as React from "react";
import NotificationsProvider from "@/components/providers/NotificationsProvider";

export default function SidebarProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NotificationsProvider>{children}</NotificationsProvider>;
}
