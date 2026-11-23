"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setWorldLiveChatRetention } from "@/app/actions/worldCatalog";
import { messageErreurAction } from "@/lib/actionErrors";
import { cn } from "@/lib/utils";
import {
  LIVE_CHAT_RETENTION_PRESETS,
  isLiveChatRetention,
  resolveLiveChatRetention,
  type LiveChatRetention,
} from "@/lib/worldLiveChatRetention";
import { FIELD, SettingsSection } from "./FeatureLayout";

/**
 * Délestage de la chatbox (Paramètres › Fonctions › Chatbox) : combien de
 * messages chaque salle garde avant que les plus anciens ne soient effacés.
 * Enregistré au choix ; un échec ramène la valeur précédente.
 */
export function WorldLiveChatRetentionSetting({
  worldId,
  value,
  onSaved,
}: {
  worldId: string;
  value: number | null | undefined;
  onSaved?: (retention: LiveChatRetention) => void;
}) {
  const t = useTranslations("worlds.settings.liveChatRetention");
  const tCommon = useTranslations("common");
  const [retention, setRetention] = React.useState<LiveChatRetention>(() => resolveLiveChatRetention(value));
  const [saving, setSaving] = React.useState(false);

  async function choose(raw: string) {
    const next = Number(raw);
    if (!isLiveChatRetention(next) || next === retention) return;
    const previous = retention;
    setRetention(next);
    setSaving(true);
    const res = await setWorldLiveChatRetention(worldId, next);
    setSaving(false);
    if (!res.ok) {
      setRetention(previous);
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    onSaved?.(next);
  }

  return (
    <SettingsSection title={t("title")} help={t("help")}>
      <Select value={String(retention)} disabled={saving} onValueChange={(v) => void choose(v)}>
        <SelectTrigger
          aria-label={t("title")}
          className={cn("h-10 w-full max-w-sm rounded-md data-[size=default]:h-10", FIELD)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIVE_CHAT_RETENTION_PRESETS.map((p) => (
            <SelectItem key={p} value={String(p)}>
              {t("option", { count: p })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsSection>
  );
}
