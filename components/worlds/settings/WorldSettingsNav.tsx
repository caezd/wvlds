"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  ChevronRight,
  Clock,
  Flag,
  FolderTree,
  Globe,
  House,
  Map as MapIcon,
  Megaphone,
  MessagesSquare,
  Package,
  Shield,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/ui/section-label";
import { StatusPill } from "./FeatureLayout";
import {
  isFeatureSection,
  UNTITLED_SETTINGS_GROUPS,
  type FeatureSectionId,
  type SettingsGroupId,
  type SettingsSectionId,
} from "./worldSettingsSections";

const ICONS: Record<SettingsSectionId, LucideIcon> = {
  general: SlidersHorizontal,
  home: House,
  community: Globe,
  catalogue: Package,
  map: MapIcon,
  wiki: BookOpen,
  personas: UserRound,
  timeline: Clock,
  chatbox: MessagesSquare,
  categories: FolderTree,
  groups: UsersRound,
  relations: Waypoints,
  roles: Shield,
  announcements: Megaphone,
  reports: Flag,
};

/** Le nom d'une section, dans le menu comme en titre de sa page. */
export function useSettingsSectionLabel() {
  const t = useTranslations("worlds");
  const tSettings = useTranslations("worlds.settings");
  return React.useCallback(
    (id: SettingsSectionId): string => {
      switch (id) {
        case "general": return tSettings("menu.general");
        case "home": return t("tabHome");
        case "community": return t("tabCommunity");
        case "catalogue": return t("nav.catalogue");
        case "map": return t("nav.map");
        case "wiki": return tSettings("wiki");
        case "personas": return t("nav.personas");
        case "timeline": return t("nav.timeline");
        case "chatbox": return tSettings("chatbox");
        case "categories": return t("tabCategories");
        case "groups": return t("tabGroups");
        case "relations": return t("tabRelations");
        case "roles": return t("tabRoles");
        case "announcements": return t("tabAnnouncements");
        case "reports": return t("tabReports");
      }
    },
    [t, tSettings],
  );
}

/**
 * Le menu de gauche des paramètres d'un monde, rangé en groupes. Les pages
 * « Fonctions » y portent leur état (Actif / Off), lu en description.
 *
 * Sur mobile, il occupe toute la largeur tant qu'aucune section n'est
 * ouverte (WorldSettingsView le masque ensuite) : chaque entrée y prend une
 * flèche, comme une liste de réglages de téléphone.
 */
export function WorldSettingsNav({
  groups,
  selected,
  featureStatus,
  onSelect,
  selectedOnDesktopOnly = false,
}: {
  groups: { id: SettingsGroupId; sections: SettingsSectionId[] }[];
  /** La section affichée à droite (desktop) ; `null` sur la liste mobile. */
  selected: SettingsSectionId | null;
  /** L'état des pages « Fonctions », une fois connu. */
  featureStatus: Partial<Record<FeatureSectionId, boolean>>;
  onSelect: (id: SettingsSectionId) => void;
  /** Surligner la section choisie seulement à partir de `md`. */
  selectedOnDesktopOnly?: boolean;
}) {
  const tSettings = useTranslations("worlds.settings");
  const label = useSettingsSectionLabel();
  const on = tSettings("statusOn");
  const off = tSettings("statusOff");

  return (
    <nav aria-label={tSettings("menu.label")} className="space-y-5 p-3 md:p-4" data-testid="settings-nav">
      {groups.map((group) => {
        // Sans titre (Général, Communauté) : une simple liste en tête.
        const titled = !UNTITLED_SETTINGS_GROUPS.includes(group.id);
        return (
        <div
          key={group.id}
          {...(titled
            ? { role: "group", "aria-labelledby": `settings-group-${group.id}` }
            : { "data-testid": `settings-nav-${group.id}` })}
        >
          {titled && (
            <SectionLabel as="p" id={`settings-group-${group.id}`} className="px-2.5 pb-1.5">
              {tSettings(`menu.groups.${group.id as Exclude<SettingsGroupId, "top">}`)}
            </SectionLabel>
          )}
          <ul className="space-y-0.5">
            {group.sections.map((id) => {
              const Icon = ICONS[id];
              const isSelected = id === selected;
              const status = isFeatureSection(id) ? featureStatus[id] : undefined;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    aria-current={isSelected ? "page" : undefined}
                    // Nommé par sa section ; l'état éventuel se lit en description.
                    aria-label={label(id)}
                    aria-describedby={status === undefined ? undefined : `settings-status-${id}`}
                    data-section={id}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-sm transition-colors md:py-1.5",
                      isSelected && !selectedOnDesktopOnly
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      isSelected && selectedOnDesktopOnly && "md:bg-muted md:font-medium md:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{label(id)}</span>
                    {status !== undefined && (
                      <StatusPill id={`settings-status-${id}`} active={status} onLabel={on} offLabel={off} />
                    )}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground md:hidden" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        );
      })}
    </nav>
  );
}
