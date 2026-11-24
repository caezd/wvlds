"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { HelpHint } from "@/components/ui/help-hint";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AmountInput } from "@/components/economy/AmountInput";
import { addWorldShop, addWorldShopItem, updateWorldShop, updateWorldShopItem } from "@/app/actions/worldShops";
import { ERR_ARTICLE_EN_DOUBLE, messageErreurAction } from "@/lib/actionErrors";
import { formatAmount, type CurrencyUnit } from "@/lib/worldCurrency";
import {
  MAX_SHOP_DESCRIPTION_LENGTH,
  MAX_SHOP_NAME_LENGTH,
  MAX_SHOP_STOCK,
  type WorldShop,
  type WorldShopItem,
} from "@/lib/worldShops";
import type { ShopBuyer, ShopResult } from "@/hooks/useWorldShops";

/** Un entier saisi, ou `null` si la case est vide. */
function intOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function LabelWithHelp({ htmlFor, label, help }: { htmlFor?: string; label: string; help: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <HelpHint title={label}>{help}</HelpHint>
    </div>
  );
}

// ── Boutique ──────────────────────────────────────────────────────────────────

/** Créer (sans `shop`) ou modifier une boutique. */
export function ShopDialog({
  worldId,
  shop,
  open,
  onOpenChange,
  onSaved,
}: {
  worldId: string;
  shop: WorldShop | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remonté à chaque ouverture : le formulaire repart de la boutique. */}
        {open && <ShopForm worldId={worldId} shop={shop} onDone={() => { onOpenChange(false); onSaved(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function ShopForm({ worldId, shop, onDone }: { worldId: string; shop: WorldShop | null; onDone: () => void }) {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(shop?.name ?? "");
  const [description, setDescription] = useState(shop?.description ?? "");
  const [isOpen, setIsOpen] = useState(shop?.is_open ?? true);
  const [buyback, setBuyback] = useState(shop?.buyback_enabled ?? false);
  const [percent, setPercent] = useState(shop?.buyback_percent?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const data = {
      name: name.trim(),
      description: description.trim() || null,
      is_open: isOpen,
      buyback_enabled: buyback,
      buyback_percent: intOrNull(percent),
    };
    const res = shop ? await updateWorldShop(shop.id, data) : await addWorldShop(worldId, data);
    setSaving(false);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{shop ? t("editShop") : t("create")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="shop-name">{t("name")}</Label>
          <Input id="shop-name" value={name} maxLength={MAX_SHOP_NAME_LENGTH} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="shop-description">{t("description")}</Label>
          <Textarea
            id="shop-description"
            value={description}
            rows={3}
            maxLength={MAX_SHOP_DESCRIPTION_LENGTH}
            placeholder={t("descriptionPlaceholder")}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <LabelWithHelp htmlFor="shop-open" label={t("open")} help={t("openHelp")} />
          <Switch id="shop-open" checked={isOpen} onCheckedChange={setIsOpen} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <LabelWithHelp htmlFor="shop-buyback" label={t("buyback")} help={t("buybackHelp")} />
          <Switch id="shop-buyback" checked={buyback} onCheckedChange={setBuyback} />
        </div>
        {buyback && (
          <div className="flex items-center justify-between gap-3">
            <LabelWithHelp htmlFor="shop-percent" label={t("buybackPercent")} help={t("buybackPercentHelp")} />
            <Input
              id="shop-percent"
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              className="w-24"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="button" disabled={!name.trim() || saving} onClick={() => void save()}>
          {tCommon("save")}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Article ───────────────────────────────────────────────────────────────────

export type ShopItemTarget = {
  shopId: string;
  catalogItemId: string;
  name: string;
  /** L'article existant ; absent : un objet à mettre en vente. */
  item: WorldShopItem | null;
};

export function ShopItemDialog({
  target,
  units,
  onOpenChange,
  onSaved,
}: {
  target: ShopItemTarget | null;
  units: CurrencyUnit[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {target && <ShopItemForm target={target} units={units} onDone={() => { onOpenChange(false); onSaved(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function ShopItemForm({ target, units, onDone }: { target: ShopItemTarget; units: CurrencyUnit[]; onDone: () => void }) {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const [price, setPrice] = useState<number | null>(target.item?.price ?? null);
  const [stock, setStock] = useState(target.item?.stock?.toString() ?? "");
  const [buyback, setBuyback] = useState<number | null>(target.item?.buyback_price ?? null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (price === null) return;
    setSaving(true);
    const data = { price, stock: intOrNull(stock), buyback_price: buyback };
    const res = target.item
      ? await updateWorldShopItem(target.item.id, data)
      : await addWorldShopItem(target.shopId, target.catalogItemId, data);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error === ERR_ARTICLE_EN_DOUBLE ? t("errors.duplicate") : messageErreurAction(res.error, tCommon));
      return;
    }
    onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("itemTitle", { name: target.name })}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("price")}</Label>
          <AmountInput
            units={units}
            value={price}
            onChange={setPrice}
            idPrefix="shop-price"
            labelOf={(unit) => t("priceIn", { unit: unit.name })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shop-stock">{t("stock")}</Label>
          <Input
            id="shop-stock"
            type="number"
            min={0}
            max={MAX_SHOP_STOCK}
            step={1}
            inputMode="numeric"
            className="w-32"
            placeholder={t("stockPlaceholder")}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <LabelWithHelp label={t("buybackPrice")} help={t("buybackPriceHelp")} />
          <AmountInput
            units={units}
            value={buyback}
            onChange={setBuyback}
            idPrefix="shop-buyback"
            labelOf={(unit) => t("buybackPriceIn", { unit: unit.name })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" disabled={price === null || saving} onClick={() => void save()}>
          {tCommon("save")}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Achat, revente ────────────────────────────────────────────────────────────

export type TradeTarget = {
  mode: "buy" | "sell";
  itemId: string;
  name: string;
  /** Prix d'un exemplaire : à l'achat, ou au rachat. */
  unitPrice: number;
  /** Combien au plus : selon solde et stock à l'achat, selon ce qu'on porte à la revente. */
  max: number;
};

export function TradeDialog({
  target,
  buyer,
  units,
  onOpenChange,
  run,
}: {
  target: TradeTarget | null;
  buyer: ShopBuyer | null;
  units: CurrencyUnit[];
  onOpenChange: (open: boolean) => void;
  run: (target: TradeTarget, quantity: number) => Promise<ShopResult>;
}) {
  const t = useTranslations("shops");
  const title = target ? t(target.mode === "buy" ? "buyTitle" : "sellTitle", { name: target.name }) : "";
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {buyer && (
            <DialogDescription>
              {t("tradeDescription", { name: buyer.name, balance: formatAmount(buyer.balance, units) })}
            </DialogDescription>
          )}
        </DialogHeader>
        {target && <TradeForm target={target} units={units} run={run} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TradeForm({
  target,
  units,
  run,
  onDone,
}: {
  target: TradeTarget;
  units: CurrencyUnit[];
  run: (target: TradeTarget, quantity: number) => Promise<ShopResult>;
  onDone: () => void;
}) {
  const t = useTranslations("shops");
  const [raw, setRaw] = useState("1");
  const [busy, setBusy] = useState(false);
  const quantity = intOrNull(raw) ?? 0;
  const valid = quantity >= 1 && quantity <= target.max;

  async function confirm() {
    setBusy(true);
    const res = await run(target, quantity);
    setBusy(false);
    if (!res.ok) {
      toast.error(t(`errors.${res.error}`));
      return;
    }
    toast.success(t(target.mode === "buy" ? "bought" : "sold"));
    onDone();
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trade-quantity">{t("quantity")}</Label>
          <Input
            id="trade-quantity"
            type="number"
            min={1}
            max={Math.max(1, target.max)}
            step={1}
            inputMode="numeric"
            className="w-24"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{t("total")}</p>
          <p className="text-sm font-medium tabular-nums">{formatAmount(target.unitPrice * quantity, units)}</p>
        </div>
      </div>
      {target.mode === "buy" && target.max === 0 && (
        <p className="text-sm text-destructive">{t("errors.funds")}</p>
      )}
      <DialogFooter>
        <Button type="button" disabled={!valid || busy} onClick={() => void confirm()}>
          {t(target.mode === "buy" ? "buy" : "sell")}
        </Button>
      </DialogFooter>
    </>
  );
}
