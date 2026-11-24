"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CatalogVisual } from "@/components/worlds/catalogue/CatalogVisual";
import { CatalogPicker, RarityMark } from "@/components/personas/fields/shared";
import { useCatalogDetail } from "@/components/personas/fields/CatalogFieldViews";
import { indexCatalog } from "@/lib/worldCatalog";
import { PersonaWalletSection, type PersonaWallet } from "@/components/personas/PersonaWalletSection";
import { ownerCanAdd } from "@/lib/personaInventory";
import { formatAmount, type CurrencyUnit } from "@/lib/worldCurrency";
import type { InventoryResult, InventoryRow, usePersonaInventory } from "@/hooks/usePersonaInventory";

export type PersonaInventory = ReturnType<typeof usePersonaInventory>;

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 1000;

/** Le petit bouton d'ajout, au pied de la liste — même allure que celui du catalogue. */
const ADD_TRIGGER =
  "flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1";

/**
 * L'onglet Inventaire d'une fiche : la bourse si l'économie du monde est
 * active, les objets si son inventaire l'est.
 */
export function PersonaInventoryTab({
  personaName,
  wallet,
  inventory,
  canEdit,
  canManage,
}: {
  personaName: string;
  wallet: PersonaWallet;
  inventory: PersonaInventory;
  canEdit: boolean;
  canManage: boolean;
}) {
  return (
    <div className="space-y-6">
      {wallet.status === "on" && <PersonaWalletSection personaName={personaName} wallet={wallet} canManage={canManage} />}
      {inventory.status === "on" && (
        <PersonaInventorySection
          personaName={personaName}
          inventory={inventory}
          units={wallet.units}
          canEdit={canEdit}
          canManage={canManage}
          onSpent={() => void wallet.refresh?.()}
        />
      )}
    </div>
  );
}

/**
 * Les objets d'un persona, dans l'onglet Inventaire de sa fiche (migration
 * 247) : la liste, les emplacements occupés, et selon le mode du monde ce que
 * le joueur peut y faire — créer un objet libre, piocher dans le catalogue,
 * ou rien (mode tenu). Qui gère l'économie donne et reprend les objets du
 * catalogue. La base a le dernier mot : un refus s'affiche en toast.
 */
export function PersonaInventorySection({
  personaName,
  inventory,
  units,
  canEdit,
  canManage,
  onSpent,
}: {
  personaName: string;
  inventory: PersonaInventory;
  units: CurrencyUnit[];
  /** Le joueur du persona, ou qui mène ce PNJ. */
  canEdit: boolean;
  /** La permission `economy.manage`. */
  canManage: boolean;
  /** Après un achat d'emplacement : la bourse a bougé. */
  onSpent?: () => void;
}) {
  const t = useTranslations("personas.inventory");
  const [creating, setCreating] = useState(false);
  const [extending, setExtending] = useState(false);
  const [busy, setBusy] = useState(false);

  const { mode, items, used, capacity, extension } = inventory;
  const canAddCustom = canEdit && ownerCanAdd(mode, "custom");
  const canAddCatalog = canEdit && ownerCanAdd(mode, "catalog");
  const canGive = canManage && !canAddCatalog;
  // Un catalogue vide n'a rien à offrir : pas de sélecteur.
  const canPick = (canAddCatalog || canGive) && inventory.catalog.length > 0;
  // Un objet vivant du catalogue ouvre sa fiche d'un clic (migration 186).
  const catalogIndex = useMemo(() => indexCatalog(inventory.catalog), [inventory.catalog]);
  const detail = useCatalogDetail(catalogIndex);

  async function run(action: () => Promise<InventoryResult>): Promise<boolean> {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (!res.ok) toast.error(t(`errors.${res.error}`));
    return res.ok;
  }

  /** Ce qu'on peut faire d'une ligne : à la main du joueur, ou par la base pour qui gère. */
  function controlsOf(row: InventoryRow) {
    const byOwner = canEdit && ownerCanAdd(mode, row.catalog_item_id ? "catalog" : "custom");
    if (byOwner) {
      return {
        more: () => run(() => inventory.setQuantity(row.id, row.quantity + 1)),
        less: () => run(() => inventory.setQuantity(row.id, row.quantity - 1)),
        remove: () => run(() => inventory.removeRow(row.id)),
      };
    }
    if (canManage && row.catalog_item_id) {
      const id = row.catalog_item_id;
      return {
        more: () => run(() => inventory.give(id, 1)),
        less: () => run(() => inventory.give(id, -1)),
        remove: () => run(() => inventory.give(id, -row.quantity)),
      };
    }
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <SectionLabel id="persona-inventory-items">{t("items")}</SectionLabel>
        <span className="text-xs tabular-nums text-muted-foreground">
          {capacity === null ? t("slotsUsed", { used }) : t("slotsOf", { used, capacity })}
        </span>
        {canEdit && extension && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setExtending(true)}>
            {t("extend")}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul aria-labelledby="persona-inventory-items" className="divide-y divide-border rounded-md border border-border">
          {items.map((row) => {
            const name = row.catalog?.name ?? row.name ?? "";
            const description = row.catalog?.description ?? row.description;
            const controls = controlsOf(row);
            return (
              <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                <CatalogVisual
                  icon={row.catalog ? row.catalog.icon : row.icon}
                  lucideIcon={row.catalog ? row.catalog.lucide_icon : row.lucide_icon}
                  imageUrl={row.catalog?.image_url}
                  size={36}
                />
                {row.catalog_item_id && catalogIndex.has(row.catalog_item_id) ? (
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left hover:underline"
                    onClick={() => detail.open(row.catalog_item_id ?? undefined)}
                  >
                    <RowText row={row} name={name} description={description} />
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">
                    <RowText row={row} name={name} description={description} />
                  </div>
                )}
                {controls && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="size-7" disabled={busy} aria-label={t("less", { name })} onClick={() => void controls.less()}>
                      <Minus className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" disabled={busy} aria-label={t("more", { name })} onClick={() => void controls.more()}>
                      <Plus className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" disabled={busy} aria-label={t("remove", { name })} onClick={() => void controls.remove()}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(canPick || canAddCustom) && (
        <div className="flex flex-wrap items-center gap-x-4">
          {canPick && (
            <CatalogPicker
              available={inventory.catalog}
              categories={inventory.categories}
              type="inventory"
              label={canGive ? t("give") : undefined}
              onSelect={(item) => void run(() => (canGive ? inventory.give(item.id, 1) : inventory.addCatalog(item.id, 1)))}
            />
          )}
          {canAddCustom && (
            <button type="button" className={ADD_TRIGGER} onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("addCustom")}
            </button>
          )}
        </div>
      )}

      {detail.sheet}

      {canAddCustom && (
        <CustomItemDialog
          open={creating}
          onOpenChange={setCreating}
          onSubmit={async (n, d) => {
            const ok = await run(() => inventory.addCustom(n, d));
            if (ok) setCreating(false);
          }}
        />
      )}

      {extension && (
        <Dialog open={extending} onOpenChange={setExtending}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("extendTitle")}</DialogTitle>
              <DialogDescription>
                {t("extendDescription", { price: formatAmount(extension.cost, units), name: personaName })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                disabled={busy}
                onClick={async () => {
                  const ok = await run(() => inventory.extend(1));
                  if (!ok) return;
                  setExtending(false);
                  onSpent?.();
                  toast.success(t("extended"));
                }}
              >
                {t("pay")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Nom, rareté, quantité et description d'une ligne. */
function RowText({ row, name, description }: { row: InventoryRow; name: string; description: string | null | undefined }) {
  return (
    <>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <RarityMark rarity={row.catalog?.rarity ?? null} />
        <span className="truncate">{name}</span>
        {row.quantity > 1 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">×{row.quantity}</span>}
      </p>
      {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
    </>
  );
}

function CustomItemDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}) {
  const t = useTranslations("personas.inventory");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName("");
          setDescription("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            await onSubmit(name, description);
            setSaving(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("customTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="persona-item-name">{t("name")}</Label>
            <Input id="persona-item-name" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="persona-item-description">{t("description")}</Label>
            <Textarea
              id="persona-item-description"
              value={description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              placeholder={t("descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || name.trim() === ""}>
              {tCommon("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
