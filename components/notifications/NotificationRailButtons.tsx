"use client";

/**
 * Boutons des notifications : la cloche du rail et sa variante texte.
 *
 * Séparés de `index.tsx` : la cloche est affichée sur toutes les pages, alors
 * que le panneau des notifications ne se charge qu'à l'ouverture (`dynamic()`
 * dans AppShell). Tant que le rail importait la cloche depuis `index.tsx`, tout
 * le panneau (cartes d'invitation, de relation, de suite…) entrait quand même
 * dans le JavaScript de chaque page.
 */

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CountPip } from "@/components/ui/count-pip";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useTranslations } from "next-intl";

// ── 2. Bell button — icône dans le rail de la sidebar ─────────────────────────

export function NotificationBellButton() {
    const t = useTranslations("notifications");
    const { panelOpen, togglePanel, unreadNotifCount } = useNotifications();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={togglePanel}
                    aria-label={t("title")}
                    aria-pressed={panelOpen}
                    className="relative"
                >
                    <Bell size={17} />
                    <CountPip count={unreadNotifCount} className="absolute -right-0.5 -top-0.5" />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{t("title")}</TooltipContent>
        </Tooltip>
    );
}

// ── 3. Sidebar button — variante texte pour sidebar étendue ──────────────────

export function NotificationSidebarButton() {
    const t = useTranslations("notifications");
    const { panelOpen, togglePanel, unreadNotifCount } = useNotifications();

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={togglePanel}
            aria-pressed={panelOpen}
            className="w-full justify-start"
        >
            <Bell className="h-4 w-4 opacity-80 mr-1" />
            <span className="flex-1 truncate text-left">{t("title")}</span>
            <CountPip count={unreadNotifCount} className="ml-auto" />
        </Button>
    );
}
