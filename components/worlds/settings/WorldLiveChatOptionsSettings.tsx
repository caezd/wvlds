"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { setWorldFeature } from "@/app/actions/worldCatalog";
import { messageErreurAction } from "@/lib/actionErrors";
import type { World } from "@/types/worlds";
import { LIVE_CHAT_OPTION_FIELDS, type LiveChatOptionField } from "@/lib/worldLiveChatOptions";
import { SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

/** Clé de traduction de chaque option (worlds.settings.liveChatOptions). */
const LABELS: Record<LiveChatOptionField, string> = {
  live_chat_colors: "colors",
  live_chat_bubbles: "bubbles",
  live_chat_personas: "personas",
  live_chat_actions: "actions",
};

/**
 * Options de la chatbox (Paramètres › Fonctions › Chatbox, migration 241) :
 * couleurs de dialogue, bulles, personas, actions `/me`. Chacune s'enregistre
 * à la bascule ; un échec la ramène où elle était.
 */
export function WorldLiveChatOptionsSettings({
  world,
  onUpdated,
}: {
  world: World;
  onUpdated?: (patch: Partial<World>) => void;
}) {
  const t = useTranslations("worlds.settings.liveChatOptions");
  const tCommon = useTranslations("common");
  const [values, setValues] = React.useState<Record<LiveChatOptionField, boolean>>(() => ({
    live_chat_colors: world.live_chat_colors === true,
    live_chat_bubbles: world.live_chat_bubbles === true,
    live_chat_personas: world.live_chat_personas === true,
    live_chat_actions: world.live_chat_actions === true,
  }));
  const [saving, setSaving] = React.useState<LiveChatOptionField | null>(null);

  async function toggle(field: LiveChatOptionField, enabled: boolean) {
    setValues((v) => ({ ...v, [field]: enabled }));
    setSaving(field);
    const res = await setWorldFeature(world.id, field, enabled);
    setSaving(null);
    if (!res.ok) {
      setValues((v) => ({ ...v, [field]: !enabled }));
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    onUpdated?.({ [field]: enabled });
  }

  return (
    <SettingsSection title={t("title")}>
      <ToggleList>
        {LIVE_CHAT_OPTION_FIELDS.map((field) => (
          <ToggleItem
            key={field}
            title={t(`${LABELS[field]}.title`)}
            description={field === "live_chat_bubbles" ? undefined : t(`${LABELS[field]}.help`)}
            checked={values[field]}
            disabled={saving === field}
            onCheckedChange={(v) => void toggle(field, v)}
          />
        ))}
      </ToggleList>
    </SettingsSection>
  );
}
