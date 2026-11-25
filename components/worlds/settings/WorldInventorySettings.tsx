"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Hand, Library, PencilLine, type LucideIcon } from "lucide-react";
import { setWorldInventoryMode, setWorldInventorySlots } from "@/app/actions/worldCatalog";
import { useAutoSave } from "@/hooks/useAutoSave";
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
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { FIELD, SettingsChoiceCards, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

const MODE_ICONS: Record<InventoryMode, LucideIcon> = { free: PencilLine, catalog: Library, held: Hand };

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
 * d'eux-mêmes après la saisie (useAutoSave).
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
  const [slotsDefault, setSlotsDefault] = React.useState(String(initial.slotsDefault));
  const [slotsMax, setSlotsMax] = React.useState(initial.slotsMax === null ? "" : String(initial.slotsMax));
  const [slotCost, setSlotCost] = React.useState(initial.slotCost === null ? "" : String(initial.slotCost));

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

  const { status, flush } = useAutoSave({
    value: patch,
    valid,
    save: async (next) => {
      const res = await setWorldInventorySlots(world.id, next);
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return false;
      }
      onUpdated?.(next);
      return true;
    },
  });

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
    <div className="space-y-4">
      {/* Les trois modes en cartes : chacune dit en clair ce qu'elle permet. */}
      <SettingsSection title={t("mode.title")} description={t("mode.help")}>
        <SettingsChoiceCards
          label={t("mode.title")}
          value={[mode]}
          options={INVENTORY_MODES.map((m) => ({ value: m, icon: MODE_ICONS[m], label: t(`mode.${m}`), description: t(`mode.${m}Hint`) }))}
          onToggle={(m) => void changeMode(m)}
          testIdPrefix="inventory-mode"
        />
      </SettingsSection>
      <SettingsSection title={t("slotsTitle")} aside={<AutoSaveIndicator status={status} />}>
        <div onBlur={flush}>
          <ToggleList>
            <ToggleItem
              title={t("slotsDefault.title")}
              description={t("slotsDefault.help")}
              control={numberField(t("slotsDefault.title"), slotsDefault, setSlotsDefault, { max: MAX_INVENTORY_SLOTS })}
            />
            <ToggleItem
              indent
              dimmed={unlimited}
              title={t("slotsMax.title")}
              description={t("slotsMax.help")}
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
              description={economyOn ? t("slotCost.help", { unit: baseUnit.name }) : t("slotCost.needsEconomy")}
              control={numberField(t("slotCost.title"), slotCost, setSlotCost, {
                disabled: unlimited || !economyOn,
                max: MAX_SLOT_COST,
              })}
            />
          </ToggleList>
        </div>
        {!valid && <p className="text-xs text-destructive">{t("invalid")}</p>}
      </SettingsSection>
    </div>
  );
}
