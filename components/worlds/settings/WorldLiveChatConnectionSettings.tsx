"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setWorldLiveChatConnection } from "@/app/actions/worldCatalog";
import { messageErreurAction } from "@/lib/actionErrors";
import { cn } from "@/lib/utils";
import type { World } from "@/types/worlds";
import {
  LIVE_CHAT_IDLE_PRESETS,
  liveChatConnectionOf,
  liveChatSessionsOn,
  type LiveChatConnection,
  type LiveChatConnectionPatch,
} from "@/lib/worldLiveChatConnection";
import { FIELD, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

/** La valeur du sélecteur de délai : « never » ou des minutes. */
const NEVER = "never";

/**
 * Connexion à la chatbox (Paramètres › Fonctions › Chatbox, migration 244) :
 * dès l'arrivée ou par « Rejoindre », délai d'inactivité, ce que voit un
 * joueur non connecté. Chaque choix s'enregistre aussitôt ; un échec le
 * ramène où il était.
 */
export function WorldLiveChatConnectionSettings({
  world,
  onUpdated,
}: {
  world: World;
  onUpdated?: (patch: Partial<World>) => void;
}) {
  const t = useTranslations("worlds.settings.liveChatConnection");
  const tCommon = useTranslations("common");
  const [value, setValue] = React.useState<LiveChatConnection>(() => liveChatConnectionOf(world));
  const [saving, setSaving] = React.useState(false);

  async function save(next: LiveChatConnection, patch: LiveChatConnectionPatch) {
    const previous = value;
    setValue(next);
    setSaving(true);
    const res = await setWorldLiveChatConnection(world.id, patch);
    setSaving(false);
    if (!res.ok) {
      setValue(previous);
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    onUpdated?.(patch as Partial<World>);
  }

  const idleLabel = (minutes: number) =>
    minutes % 60 === 0 ? t("idle.hours", { count: minutes / 60 }) : t("idle.minutes", { count: minutes });

  const select = (
    label: string,
    current: string,
    options: { value: string; label: string }[],
    onChange: (v: string) => void,
    disabled = false,
  ) => (
    <Select value={current} disabled={saving || disabled} onValueChange={(v) => v !== current && onChange(v)}>
      <SelectTrigger
        aria-label={label}
        className={cn("h-9 w-56 shrink-0 rounded-md data-[size=default]:h-9", FIELD)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // Connecté dès l'arrivée, personne ne l'est par « Rejoindre » : la
  // déconnexion et ce que voit un absent sont sans objet (grisés, gardés).
  const sessionsOn = liveChatSessionsOn(value);

  return (
    <SettingsSection title={t("title")}>
      <ToggleList>
        <ToggleItem
          title={t("joinMode.title")}
          help={t("joinMode.help")}
          control={select(
            t("joinMode.title"),
            value.joinMode,
            [
              { value: "auto", label: t("joinMode.auto") },
              { value: "button", label: t("joinMode.button") },
            ],
            (v) => {
              const joinMode = v === "button" ? "button" : "auto";
              void save({ ...value, joinMode }, { live_chat_join_mode: joinMode });
            },
          )}
        />
        <ToggleItem
          title={t("idle.title")}
          description={t("idle.help")}
          indent
          dimmed={!sessionsOn}
          control={select(
            t("idle.title"),
            value.idleMinutes === null ? NEVER : String(value.idleMinutes),
            [
              { value: NEVER, label: t("idle.never") },
              ...LIVE_CHAT_IDLE_PRESETS.map((m) => ({ value: String(m), label: idleLabel(m) })),
            ],
            (v) => {
              const preset = LIVE_CHAT_IDLE_PRESETS.find((m) => String(m) === v) ?? null;
              void save({ ...value, idleMinutes: preset }, { live_chat_idle_minutes: preset });
            },
            !sessionsOn,
          )}
        />
        <ToggleItem
          title={t("offline.title")}
          indent
          dimmed={!sessionsOn}
          control={select(
            t("offline.title"),
            value.offlineView,
            [
              { value: "none", label: t("offline.none") },
              { value: "read", label: t("offline.read") },
            ],
            (v) => {
              const offlineView = v === "read" ? "read" : "none";
              void save({ ...value, offlineView }, { live_chat_offline_view: offlineView });
            },
            !sessionsOn,
          )}
        />
      </ToggleList>
    </SettingsSection>
  );
}
