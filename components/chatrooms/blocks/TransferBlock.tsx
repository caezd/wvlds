"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AmountInput } from "@/components/economy/AmountInput";
import { CatalogVisual } from "@/components/worlds/catalogue/CatalogVisual";
import { currencyUnitsOf, formatAmount } from "@/lib/worldCurrency";
import { MAX_TRANSFER_ITEMS, transferBlockContent, transferIsEmpty, type TransferItemSnapshot } from "@/lib/worldTrades";
import type { usePersonaTransfer } from "@/hooks/usePersonaTransfer";
import { GameBlockSurface } from "./GameBlockShell";

type Transfer = ReturnType<typeof usePersonaTransfer>;

/** Au-delà, la liste des destinataires gagne un champ de recherche. */
const SEARCH_FROM = 8;

/**
 * Le bloc « Transférer » du composeur : donner de l'argent, des objets, ou
 * les deux, à un autre persona du monde. Le transfert est fait par la base
 * avant que le message ne parte ; le message n'en porte que l'identifiant.
 */
export function TransferDialog({
  open,
  onOpenChange,
  transfer,
  chatId,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: Transfer;
  chatId: string | null;
  onSend: (content: string) => void;
}) {
  const t = useTranslations("trades");
  const tCommon = useTranslations("common");
  const { load } = transfer;
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  // Le champ de montant garde sa saisie : on le remonte à chaque ouverture.
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTo(null);
    setAmount(null);
    setPicked({});
    setQuery("");
    setRound((r) => r + 1);
    void load();
  }, [open, load]);

  const recipients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? transfer.recipients.filter((r) => r.name.toLowerCase().includes(q)) : transfer.recipients;
  }, [transfer.recipients, query]);

  const items = Object.entries(picked).map(([id, quantity]) => ({ id, quantity }));
  const overBalance = (amount ?? 0) > transfer.balance;
  const badQuantity = items.some(({ id, quantity }) => {
    const row = transfer.items.find((i) => i.id === id);
    return !row || !Number.isInteger(quantity) || quantity < 1 || quantity > row.quantity;
  });
  const canSend = !!to && !transferIsEmpty(amount, items) && !overBalance && !badQuantity && !sending;

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = { ...prev };
      if (on) next[id] = 1;
      else delete next[id];
      return next;
    });
  }

  async function submit() {
    if (!canSend || !to) return;
    setSending(true);
    const res = await transfer.send({ to, amount: amount && amount > 0 ? amount : null, items, chatId });
    setSending(false);
    if (!res.ok) {
      toast.error(t(`errors.${res.error}`));
      return;
    }
    onSend(transferBlockContent(res.id));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          <section className="space-y-2">
            <SectionLabel as="p">{t("to")}</SectionLabel>
            {transfer.recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRecipient")}</p>
            ) : (
              <>
                {transfer.recipients.length > SEARCH_FROM && (
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("search")}
                    aria-label={t("search")}
                  />
                )}
                <RadioGroup
                  value={to ?? ""}
                  onValueChange={setTo}
                  aria-label={t("to")}
                  className="max-h-48 gap-1 overflow-y-auto"
                >
                  {recipients.map((r) => (
                    <div key={r.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
                      <RadioGroupItem value={r.id} id={`transfer-to-${r.id}`} />
                      <Label htmlFor={`transfer-to-${r.id}`} className="flex-1 cursor-pointer font-normal">
                        {r.name}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </>
            )}
          </section>

          {transfer.economyOn && (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <SectionLabel as="p">{t("amount")}</SectionLabel>
                <span className="text-xs text-muted-foreground">
                  {t("balance", { amount: formatAmount(transfer.balance, transfer.units) })}
                </span>
              </div>
              <AmountInput
                key={round}
                units={transfer.units}
                value={null}
                onChange={setAmount}
                idPrefix="transfer-amount"
                labelOf={(unit) => t("amountIn", { unit: unit.name })}
              />
              {overBalance && <p className="text-xs text-destructive">{t("errors.funds")}</p>}
            </section>
          )}

          {transfer.inventoryOn && (
            <section className="space-y-2">
              <SectionLabel as="p">{t("items")}</SectionLabel>
              {transfer.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noItems")}</p>
              ) : (
                <ul className="space-y-1">
                  {transfer.items.map((row) => {
                    const name = row.catalog?.name ?? row.name ?? "";
                    const checked = row.id in picked;
                    const full = !checked && items.length >= MAX_TRANSFER_ITEMS;
                    return (
                      <li key={row.id} className="flex items-center gap-2.5 rounded-md px-2 py-1">
                        <Checkbox
                          id={`transfer-item-${row.id}`}
                          checked={checked}
                          disabled={full}
                          onCheckedChange={(v) => toggle(row.id, v === true)}
                        />
                        <CatalogVisual
                          icon={row.catalog ? row.catalog.icon : row.icon}
                          lucideIcon={row.catalog ? row.catalog.lucide_icon : row.lucide_icon}
                          imageUrl={row.catalog?.image_url}
                          size={28}
                        />
                        <Label htmlFor={`transfer-item-${row.id}`} className="min-w-0 flex-1 cursor-pointer truncate font-normal">
                          {name}
                        </Label>
                        {checked ? (
                          <Input
                            type="number"
                            min={1}
                            max={row.quantity}
                            step={1}
                            inputMode="numeric"
                            className="h-8 w-20"
                            aria-label={t("quantityOf", { name })}
                            value={Number.isFinite(picked[row.id]) ? picked[row.id] : ""}
                            onChange={(e) => setPicked((prev) => ({ ...prev, [row.id]: e.target.valueAsNumber }))}
                          />
                        ) : (
                          <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">×{row.quantity}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSend}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TransferRow = {
  id: string;
  from_persona_id: string;
  to_persona_id: string;
  amount: number | string;
  items: TransferItemSnapshot[];
  from: { name: string } | null;
  to: { name: string } | null;
  world: { currency_units: unknown } | null;
};

/**
 * Un transfert dans le fil d'un salon. Tout se lit dans `world_transfers`,
 * que seule la base écrit ; un bloc qui désigne un transfert dont l'auteur
 * du message n'est pas le donneur ne montre rien.
 */
export function TransferBlockView({ id, authorPersonaId }: { id: string; authorPersonaId: string | null | undefined }) {
  const t = useTranslations("trades");
  const supabase = useMemo(() => createClient(), []);
  const [row, setRow] = useState<TransferRow | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("world_transfers")
      .select(
        "id, from_persona_id, to_persona_id, amount, items, " +
          "from:from_persona_id(name), to:to_persona_id(name), world:world_id(currency_units)",
      )
      .eq("id", id)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
        if (!cancelled) setRow((data as unknown as TransferRow | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  if (row === undefined) {
    return (
      <GameBlockSurface>
        <div className="h-14 animate-pulse rounded-lg border border-border bg-muted/40" />
      </GameBlockSurface>
    );
  }
  if (row === null || row.from_persona_id !== authorPersonaId) {
    return (
      <GameBlockSurface>
        <p className="text-xs italic text-muted-foreground">{t("missing")}</p>
      </GameBlockSurface>
    );
  }

  const amount = Number(row.amount);
  const units = currencyUnitsOf(row.world?.currency_units);
  return (
    <GameBlockSurface>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium">
            {t("given", { from: row.from?.name ?? "?", to: row.to?.name ?? "?" })}
          </p>
          {amount > 0 && <p className="text-sm tabular-nums">{formatAmount(amount, units)}</p>}
          {row.items.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {row.items.map((item, i) => (
                <li
                  key={`${item.catalog_item_id ?? item.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
                >
                  <CatalogVisual
                    icon={item.icon}
                    lucideIcon={item.lucide_icon}
                    imageUrl={item.image_url}
                    size={16}
                    framed={false}
                  />
                  <span>{item.name}</span>
                  <span className="text-muted-foreground tabular-nums">×{item.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </GameBlockSurface>
  );
}
