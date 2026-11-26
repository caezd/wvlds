"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AmountInput } from "@/components/economy/AmountInput";
import { Money } from "@/components/economy/Money";
import { addWorldShop, addWorldShopItem, updateWorldShop, updateWorldShopItem } from "@/app/actions/worldShops";
import { ERR_ARTICLE_EN_DOUBLE, messageErreurAction } from "@/lib/actionErrors";
import type { CurrencyUnit } from "@/lib/worldCurrency";
import {
  MAX_SHOP_DESCRIPTION_LENGTH,
  MAX_SHOP_NAME_LENGTH,
  MAX_SHOP_STOCK,
  type WorldShop,
  type WorldShopItem,
} from "@/lib/worldShops";
import type { ShopBuyer, ShopResult } from "@/hooks/useWorldShops";

/** Un entier saisi, ou `null` si la case est vide. */
function intOrNull(n: number | null): number | null {
  return n !== null && Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Un libellé et sa phrase d'explication, visible : la raison d'une case grisée se lit sans ouvrir d'aide. */
function LabelWithDescription({ htmlFor, label, description }: { htmlFor?: string; label: string; description: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <p className="text-xs text-muted-foreground text-pretty">{description}</p>
    </div>
  );
}

// ── Boutique ──────────────────────────────────────────────────────────────────

/** Créer (sans `shop`) ou modifier une boutique. */
export function ShopDialog({
  worldId,
  shop,
  open,
  buyback,
  onOpenChange,
  onSaved,
}: {
  worldId: string;
  shop: WorldShop | null;
  open: boolean;
  /** Le monde permet-il le rachat (`worldAllowsBuyback`) ? */
  buyback: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remonté à chaque ouverture : le formulaire repart de la boutique. */}
        {open && <ShopForm worldId={worldId} shop={shop} allowBuyback={buyback} onDone={() => { onOpenChange(false); onSaved(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function ShopForm({
  worldId,
  shop,
  allowBuyback,
  onDone,
}: {
  worldId: string;
  shop: WorldShop | null;
  allowBuyback: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(shop?.name ?? "");
  const [description, setDescription] = useState(shop?.description ?? "");
  const [isOpen, setIsOpen] = useState(shop?.is_open ?? true);
  const [buyback, setBuyback] = useState(shop?.buyback_enabled ?? false);
  const [percent, setPercent] = useState<number | null>(shop?.buyback_percent ?? null);
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
          <LabelWithDescription htmlFor="shop-open" label={t("open")} description={t("openHelp")} />
          <Switch id="shop-open" checked={isOpen} onCheckedChange={setIsOpen} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <LabelWithDescription
            htmlFor="shop-buyback"
            label={t("buyback")}
            description={allowBuyback ? t("buybackHelp") : t("buybackHeldOnly")}
          />
          <Switch id="shop-buyback" checked={allowBuyback && buyback} disabled={!allowBuyback} onCheckedChange={setBuyback} />
        </div>
        {allowBuyback && buyback && (
          <div className="flex items-center justify-between gap-3">
            <LabelWithDescription htmlFor="shop-percent" label={t("buybackPercent")} description={t("buybackPercentHelp")} />
            <NumberInput id="shop-percent" min={0} max={100} value={percent} onValueChange={setPercent} />
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
  buyback,
  onOpenChange,
  onSaved,
}: {
  target: ShopItemTarget | null;
  units: CurrencyUnit[];
  /** Le monde permet-il le rachat (`worldAllowsBuyback`) ? */
  buyback: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {target && <ShopItemForm target={target} units={units} allowBuyback={buyback} onDone={() => { onOpenChange(false); onSaved(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function ShopItemForm({
  target,
  units,
  allowBuyback,
  onDone,
}: {
  target: ShopItemTarget;
  units: CurrencyUnit[];
  allowBuyback: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const [price, setPrice] = useState<number | null>(target.item?.price ?? null);
  const [stock, setStock] = useState<number | null>(target.item?.stock ?? null);
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
          <NumberInput
            id="shop-stock"
            min={0}
            max={MAX_SHOP_STOCK}
            placeholder={t("stockPlaceholder")}
            value={stock}
            onValueChange={setStock}
          />
        </div>
        {allowBuyback && (
          <div className="space-y-1.5">
            <LabelWithDescription label={t("buybackPrice")} description={t("buybackPriceHelp")} />
            <AmountInput
              units={units}
              value={buyback}
              onChange={setBuyback}
              idPrefix="shop-buyback"
              labelOf={(unit) => t("buybackPriceIn", { unit: unit.name })}
            />
          </div>
        )}
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
              {t.rich("tradeDescription", { name: buyer.name, balance: () => <Money amount={buyer.balance} units={units} /> })}
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
  const tEconomy = useTranslations("economy");
  const [raw, setRaw] = useState<number | null>(1);
  const [busy, setBusy] = useState(false);
  const quantity = intOrNull(raw) ?? 0;
  const valid = quantity >= 1 && quantity <= target.max;

  async function confirm() {
    setBusy(true);
    const res = await run(target, quantity);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error === "funds" ? tEconomy("insufficientFunds") : t(`errors.${res.error}`));
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
          <NumberInput
            id="trade-quantity"
            aria-label={t("quantity")}
            min={1}
            max={Math.max(1, target.max)}
            value={raw}
            onValueChange={setRaw}
          />
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{t("total")}</p>
          <Money amount={target.unitPrice * quantity} units={units} className="block text-sm font-medium" />
        </div>
      </div>
      {target.mode === "buy" && target.max === 0 && (
        <p className="text-sm text-destructive">{tEconomy("insufficientFunds")}</p>
      )}
      <DialogFooter>
        <Button type="button" disabled={!valid || busy} onClick={() => void confirm()}>
          {t(target.mode === "buy" ? "buy" : "sell")}
        </Button>
      </DialogFooter>
    </>
  );
}
