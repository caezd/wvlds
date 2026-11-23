"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { RoleChip } from "@/components/worlds/members/RoleChip";
import { ANNOUNCEMENT_FILTER_DAYS, type AnnouncementFilters } from "@/lib/worldAnnouncements";

export type RoleLike = { id: string; name: string; color: string; lucide_icon: string | null };

/**
 * Affiner les destinataires (migration 229) : sauf certains rôles, arrivés
 * récemment, ou sans message dans le monde depuis un temps donné.
 */
export function AnnouncementFiltersPanel({
  roles,
  filters,
  onChange,
}: {
  roles: RoleLike[];
  filters: AnnouncementFilters;
  onChange: (filters: AnnouncementFilters) => void;
}) {
  const t = useTranslations("worlds.announcements");
  const excluded = filters.exclude_role_ids ?? [];

  function toggleExcluded(id: string) {
    onChange({
      ...filters,
      exclude_role_ids: excluded.includes(id) ? excluded.filter((r) => r !== id) : [...excluded, id],
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3" data-testid="announcement-filters">
      {roles.length > 0 && (
        <FilterRow label={t("filterExcept")}>
          {roles.map((role) => (
            <Button
              key={role.id}
              type="button"
              variant="outline"
              size="xs"
              aria-pressed={excluded.includes(role.id)}
              onClick={() => toggleExcluded(role.id)}
              data-testid="announcement-filter-except"
            >
              <RoleChip role={role} plain />
            </Button>
          ))}
        </FilterRow>
      )}
      <FilterRow label={t("filterJoined")}>
        <DayChoices
          value={filters.joined_within_days}
          onChange={(days) => onChange({ ...filters, joined_within_days: days })}
          testId="announcement-filter-joined"
        />
      </FilterRow>
      <FilterRow label={t("filterInactive")}>
        <DayChoices
          value={filters.inactive_days}
          onChange={(days) => onChange({ ...filters, inactive_days: days })}
          testId="announcement-filter-inactive"
        />
      </FilterRow>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <SectionLabel as="div">{label}</SectionLabel>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function DayChoices({
  value,
  onChange,
  testId,
}: {
  value: number | undefined;
  onChange: (days: number | undefined) => void;
  testId: string;
}) {
  const t = useTranslations("worlds.announcements");
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        aria-pressed={!value}
        onClick={() => onChange(undefined)}
        data-testid={testId}
        data-days="any"
      >
        {t("filterAny")}
      </Button>
      {ANNOUNCEMENT_FILTER_DAYS.map((days) => (
        <Button
          key={days}
          type="button"
          variant="outline"
          size="xs"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          data-testid={testId}
          data-days={days}
        >
          {t("filterDays", { count: days })}
        </Button>
      ))}
    </>
  );
}

/** Les filtres d'une annonce envoyée, en clair (historique). */
export function FiltersSummary({
  filters,
  roleById,
}: {
  filters: AnnouncementFilters | null | undefined;
  roleById: Map<string, RoleLike>;
}) {
  const t = useTranslations("worlds.announcements");
  if (!filters) return null;
  const excluded = (filters.exclude_role_ids ?? []).map((id) => roleById.get(id)).filter((r): r is RoleLike => !!r);
  const parts: React.ReactNode[] = [];
  if (excluded.length > 0) {
    parts.push(
      <span key="except" className="flex flex-wrap items-center gap-1">
        {t("summaryExcept")}
        {excluded.map((r) => (
          <RoleChip key={r.id} role={r} />
        ))}
      </span>,
    );
  }
  if (filters.joined_within_days) parts.push(<span key="joined">{t("summaryJoined", { count: filters.joined_within_days })}</span>);
  if (filters.inactive_days) parts.push(<span key="inactive">{t("summaryInactive", { count: filters.inactive_days })}</span>);
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          <span>·</span>
          {p}
        </React.Fragment>
      ))}
    </>
  );
}
