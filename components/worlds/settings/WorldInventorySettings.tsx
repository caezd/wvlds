"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { setWorldInventoryMode, setWorldInventorySlots } from "@/app/actions/worldCatalog";
import { messageErreurAction } from "@/lib/actionErrors";
import { cn } from "@/lib/utils";
import type { World } from "@/types/worlds";
import { currencyUnitsOf } from "@/lib/worldCurrency";
import {
  INVENTORY_MODES,
  MAX_INVENTORY_SLOTS,
  MAX_SLOT_COST,
  inventoryModeOf,
  inventorySettingsOf,
  inventorySettingsSchema,
  type InventoryMode,
} from "@/lib/personaInventory";
import { FIELD, SettingsSection, TitleWithHelp, ToggleItem, ToggleList } from "./FeatureLayout";

/** Une saisie numérique : un entier, ou `null` si le champ est vide. */
function parseCount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/**
 * L'inventaire des personas (Paramètres › Fonctions › Catalogue, migration
 * 247) : qui y fait entrer des objets, et ses emplacements — nombre de
 * départ (0 : illimité), plafond, prix d'un emplacement ajouté (avec
 * l'économie seulement). Le mode s'enregistre aussitôt, les emplacements
 * d'un bouton.
 */
export function WorldInventorySettings({
  world,
  onUpdated,
}: {
  world: World;
  onUpdated?: (patch: Partial<World>) => void;
}) {
  const t = useTranslations("worlds.settings.inventory");
  const tCommon = useTranslations("common");
  const [mode, setMode] = React.useState<InventoryMode>(() => inventoryModeOf(world));
  const initial = React.useMemo(() => inventorySettingsOf(world), [world]);
  const [saved, setSaved] = React.useState(initial);
  const [slotsDefault, setSlotsDefault] = React.useState(String(initial.slotsDefault));
  const [slotsMax, setSlotsMax] = React.useState(initial.slotsMax === null ? "" : String(initial.slotsMax));
  const [slotCost, setSlotCost] = React.useState(initial.slotCost === null ? "" : String(initial.slotCost));
  const [saving, setSaving] = React.useState(false);

  const economyOn = world.enable_economy === true;
  const baseUnit = currencyUnitsOf(world.currency_units).at(-1)!;
  const unlimited = (parseCount(slotsDefault) ?? 0) === 0;

  const patch = {
    inventory_slots_default: parseCount(slotsDefault) ?? 0,
    // Sans limite de départ, ni plafond ni prix n'ont d'objet.
    inventory_slots_max: unlimited ? null : parseCount(slotsMax),
    inventory_slot_cost: unlimited || !economyOn ? null : parseCount(slotCost),
  };
  const valid = inventorySettingsSchema.safeParse(patch).success;
  const dirty =
    patch.inventory_slots_default !== saved.slotsDefault ||
    patch.inventory_slots_max !== saved.slotsMax ||
    patch.inventory_slot_cost !== (economyOn ? saved.slotCost : null);

  async function changeMode(next: InventoryMode) {
    const previous = mode;
    setMode(next);
    const res = await setWorldInventoryMode(world.id, next);
    if (!res.ok) {
      setMode(previous);
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    onUpdated?.({ inventory_mode: next });
  }

  async function saveSlots() {
    setSaving(true);
    const res = await setWorldInventorySlots(world.id, patch);
    setSaving(false);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    setSaved({ slotsDefault: patch.inventory_slots_default, slotsMax: patch.inventory_slots_max, slotCost: patch.inventory_slot_cost });
    onUpdated?.(patch);
    toast.success(t("saved"));
  }

  const numberField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { disabled?: boolean; max: number; placeholder?: string },
  ) => (
    <Input
      type="number"
      min={0}
      max={opts.max}
      step={1}
      inputMode="numeric"
      aria-label={label}
      value={value}
      placeholder={opts.placeholder}
      disabled={opts.disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 w-40 shrink-0 rounded-md text-sm", FIELD)}
    />
  );

  return (
    <SettingsSection title={t("title")}>
      <ToggleList>
        {/* Les trois modes en liste à cocher : chacun dit en clair ce qu'il permet. */}
        <div className="px-4 py-2.5">
          <p className="text-sm font-medium">
            <TitleWithHelp title={t("mode.title")} help={t("mode.help")} />
          </p>
          <RadioGroup
            aria-label={t("mode.title")}
            value={mode}
            onValueChange={(v) => v !== mode && void changeMode(v as InventoryMode)}
            className="mt-2 gap-0.5"
          >
            {INVENTORY_MODES.map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/50"
              >
                <RadioGroupItem value={m} />
                <span className="text-sm">{t(`mode.${m}`)}</span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">{t(`mode.${m}Hint`)}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
        <ToggleItem
          title={t("slotsDefault.title")}
          help={t("slotsDefault.help")}
          control={numberField(t("slotsDefault.title"), slotsDefault, setSlotsDefault, { max: MAX_INVENTORY_SLOTS })}
        />
        <ToggleItem
          indent
          dimmed={unlimited}
          title={t("slotsMax.title")}
          help={t("slotsMax.help")}
          control={numberField(t("slotsMax.title"), slotsMax, setSlotsMax, {
            disabled: unlimited,
            max: MAX_INVENTORY_SLOTS,
            placeholder: String(MAX_INVENTORY_SLOTS),
          })}
        />
        <ToggleItem
          indent
          dimmed={unlimited || !economyOn}
          title={t("slotCost.title")}
          help={economyOn ? t("slotCost.help", { unit: baseUnit.name }) : t("slotCost.needsEconomy")}
          control={numberField(t("slotCost.title"), slotCost, setSlotCost, {
            disabled: unlimited || !economyOn,
            max: MAX_SLOT_COST,
          })}
        />
      </ToggleList>
      <div className="mt-3 flex items-center gap-3">
        {dirty && !valid && <p className="text-xs text-destructive">{t("invalid")}</p>}
        <Button type="button" size="sm" className="ml-auto" disabled={!dirty || !valid || saving} onClick={() => void saveSlots()}>
          {t("save")}
        </Button>
      </div>
    </SettingsSection>
  );
}
