"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Dices, Eye, EyeOff, ImageIcon, ListChecks, Settings2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { DieGlyph } from "@/components/worlds/dice/DieGlyph";
import {
  createWorldDie,
  deleteWorldDie,
  listWorldDice,
  setWorldDiceRules,
  setWorldDieFaces,
  updateWorldDie,
} from "@/app/actions/worldDice";
import { useAutoSave } from "@/hooks/useAutoSave";
import { messageErreurAction } from "@/lib/actionErrors";
import { cn } from "@/lib/utils";
import {
  MAX_DIE_NAME_LENGTH,
  MAX_WORLD_DICE,
  STANDARD_DICE_FACES,
  standardDie,
  standardFacesOf,
  worldDieInputSchema,
  type DiceMode,
  type DiceRules,
  type DieFace,
  type WorldDie,
  type WorldDieInput,
} from "@/lib/worldDice";
import type { World } from "@/types/worlds";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { DieFacesDialog, removeDieFaceImages } from "./DieFacesDialog";
import { FIELD, SettingsAddRow, SettingsChoiceCards, SettingsEmpty, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

/**
 * Paramètres › Jeu › Dés (migration 270) : les règles des lancers du monde,
 * puis ses dés. Tout s'enregistre de soi-même (useAutoSave) ; un dé s'ajoute
 * d'un geste depuis une grille de dés standard, ou sur mesure.
 */
export function WorldDiceSettings({
  world,
  onUpdated,
}: {
  world: World;
  onUpdated?: (patch: Partial<World>) => void;
}) {
  const t = useTranslations("worlds.settings.dice");
  const tCommon = useTranslations("common");

  // ── Les règles ──
  const [rules, setRules] = React.useState<DiceRules>(() => ({
    dice_mode: world.dice_mode === "predefined" ? "predefined" : "free",
    dice_allow_edit: !!world.dice_allow_edit,
  }));
  const { status } = useAutoSave({
    value: rules,
    valid: true,
    save: async (next) => {
      const res = await setWorldDiceRules(world.id, next);
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return false;
      }
      onUpdated?.(next);
      return true;
    },
  });

  // ── Les dés ──
  const [dice, setDice] = React.useState<WorldDie[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    // Une action serveur peut aussi rejeter (réseau, serveur qui redémarre) :
    // sans ce rattrapage, la liste resterait en chargement.
    listWorldDice(world.id)
      .catch(() => ({ ok: false as const, error: "failed" }))
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(res.error);
          setDice([]);
          return;
        }
        setDice(res.dice);
      });
    return () => { cancelled = true; };
  }, [world.id]);

  async function add(input: WorldDieInput) {
    setAdding(true);
    const res = await createWorldDie(world.id, input);
    setAdding(false);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    setDice((current) => [...(current ?? []), res.die]);
    setPicking(false);
  }

  // Retiré tout de suite ; remis à sa place si la base refuse. Ses images de
  // faces partent avec lui (les lancers passés gardent les leurs en copie,
  // mais pas le fichier : ils retombent alors sur le nombre).
  async function remove(die: WorldDie, faces: DieFace[]) {
    setDice((current) => (current ?? []).filter((d) => d.id !== die.id));
    const res = await deleteWorldDie(die.id);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      setDice((current) => [...(current ?? []), die].sort((x, y) => x.position - y.position));
      return;
    }
    await removeDieFaceImages(world.id, faces.map((f) => f.image));
  }

  const full = (dice?.length ?? 0) >= MAX_WORLD_DICE;
  const modes: readonly { value: DiceMode; label: string; description: string; icon: typeof Dices }[] = [
    { value: "free", label: t("modeFree"), description: t("modeFreeHint"), icon: Dices },
    { value: "predefined", label: t("modePredefined"), description: t("modePredefinedHint"), icon: ListChecks },
  ];

  return (
    <>
      {/* ── Les règles des lancers ── */}
      <SettingsSection title={t("rules")} description={t("rulesHelp")} aside={<AutoSaveIndicator status={status} />}>
        <SettingsChoiceCards
          label={t("modeLabel")}
          options={modes}
          value={[rules.dice_mode]}
          onToggle={(mode) => setRules((r) => ({ ...r, dice_mode: mode }))}
          testIdPrefix="dice-mode"
        />
        <ToggleList>
          <ToggleItem
            title={t("allowEdit")}
            description={t("allowEditHint")}
            checked={rules.dice_allow_edit}
            onCheckedChange={(v) => setRules((r) => ({ ...r, dice_allow_edit: v }))}
          />
        </ToggleList>
      </SettingsSection>

      {/* ── Les dés du monde ── */}
      <SettingsSection
        title={t("list")}
        description={t("listHelp")}
        count={dice ? dice.length : undefined}
        layout="stacked"
      >
        {/* `data-ready` : la liste est chargée (les E2E l'attendent avant de la lire). */}
        <div data-testid="world-dice-list" data-ready={dice !== null || undefined} className="space-y-3">
        {loadError ? (
          <p className="text-sm text-destructive">{messageErreurAction(loadError, tCommon)}</p>
        ) : dice === null ? (
          <div data-testid="world-dice-loading" className="h-12 animate-pulse rounded-lg bg-muted/40" aria-hidden />
        ) : dice.length === 0 ? (
          <SettingsEmpty onAdd={() => setPicking(true)} addLabel={t("add")}>
            {t("empty")}
          </SettingsEmpty>
        ) : (
          <>
            <ul className="space-y-2">
              {dice.map((die, i) => (
                <WorldDieRow
                  key={die.id}
                  worldId={world.id}
                  die={die}
                  index={i}
                  onDelete={(faces) => void remove(die, faces)}
                />
              ))}
            </ul>
            {full ? (
              <p className="text-xs text-muted-foreground">{t("limit", { max: MAX_WORLD_DICE })}</p>
            ) : (
              <SettingsAddRow label={t("add")} onClick={() => setPicking(true)} />
            )}
          </>
        )}
        </div>
      </SettingsSection>

      <DiePickerDialog open={picking} onOpenChange={setPicking} disabled={adding} onPick={(input) => void add(input)} />
    </>
  );
}

/** Une ligne de la liste : nom, plage, faces, masqué, supprimer. Enregistrée d'elle-même. */
function WorldDieRow({
  worldId,
  die,
  index,
  onDelete,
}: {
  worldId: string;
  die: WorldDie;
  index: number;
  onDelete: (faces: DieFace[]) => void;
}) {
  const t = useTranslations("worlds.settings.dice");
  const tCommon = useTranslations("common");
  const [draft, setDraft] = React.useState<WorldDieInput>({
    name: die.name,
    min_value: die.min_value,
    max_value: die.max_value,
    hidden: die.hidden,
  });
  const parsed = worldDieInputSchema.safeParse(draft);
  const value = parsed.success ? parsed.data : draft;

  const { flush } = useAutoSave({
    value,
    valid: parsed.success,
    save: async (next) => {
      const res = await updateWorldDie(die.id, next);
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return false;
      }
      return true;
    },
  });

  // Les faces en image (migration 272), enregistrées à part du reste du dé.
  const [faces, setFaces] = React.useState<DieFace[]>(die.faces ?? []);
  const [editingFaces, setEditingFaces] = React.useState(false);
  useAutoSave({
    value: faces,
    valid: true,
    save: async (next) => {
      const res = await setWorldDieFaces(die.id, next);
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return false;
      }
      return true;
    },
  });

  // Une plage en cours de saisie, invalide, n'a pas de faces : celle du dé enregistré.
  const facesRange = parsed.success ? parsed.data : die;

  const n = index + 1;
  const label = draft.name.trim() || t("name", { n });
  const nameMissing = !draft.name.trim();
  const rangeInvalid =
    Number.isFinite(draft.min_value) && Number.isFinite(draft.max_value) && draft.min_value >= draft.max_value;
  const number = (v: number) => (Number.isFinite(v) ? v : "");

  return (
    <li className="space-y-1.5" onBlur={flush}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 @xl:flex-nowrap">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted/50 text-muted-foreground">
          <DieGlyph faces={standardFacesOf(draft)} />
        </span>
        <Input
          value={draft.name}
          maxLength={MAX_DIE_NAME_LENGTH}
          placeholder={t("namePlaceholder")}
          aria-label={t("name", { n })}
          aria-invalid={nameMissing || undefined}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className={cn("h-9 min-w-32 flex-1 rounded-md text-sm", FIELD)}
        />
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input
            type="number"
            step={1}
            value={number(draft.min_value)}
            placeholder={t("minPlaceholder")}
            aria-label={t("min", { n })}
            aria-invalid={rangeInvalid || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, min_value: e.target.valueAsNumber }))}
            className={cn("h-9 w-20 rounded-md text-sm tabular-nums", FIELD)}
          />
          <span aria-hidden>–</span>
          <Input
            type="number"
            step={1}
            value={number(draft.max_value)}
            placeholder={t("maxPlaceholder")}
            aria-label={t("max", { n })}
            aria-invalid={rangeInvalid || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, max_value: e.target.valueAsNumber }))}
            className={cn("h-9 w-20 rounded-md text-sm tabular-nums", FIELD)}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {draft.hidden && <Badge tone="outline">{t("hiddenBadge")}</Badge>}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-9 text-muted-foreground", faces.length > 0 && "text-foreground")}
            aria-label={t("faces", { name: label })}
            title={t("faces", { name: label })}
            onClick={() => setEditingFaces(true)}
          >
            <ImageIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground"
            aria-pressed={draft.hidden}
            aria-label={t("hide", { name: label })}
            title={t("hide", { name: label })}
            onClick={() => setDraft((d) => ({ ...d, hidden: !d.hidden }))}
          >
            {draft.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <DeleteConfirmDialog
            description={t("removeConfirm", { name: label })}
            onConfirm={() => onDelete(faces)}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 text-muted-foreground"
                aria-label={t("remove", { name: label })}
              >
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </div>
      </div>
      {nameMissing && <p className="text-xs text-destructive">{t("invalidName")}</p>}
      {rangeInvalid && <p className="text-xs text-destructive">{t("invalidRange")}</p>}
      <DieFacesDialog
        open={editingFaces}
        onOpenChange={setEditingFaces}
        worldId={worldId}
        die={facesRange}
        // Une plage resserrée laisse tomber les faces qui en sortent (la base fait de même).
        faces={faces.filter((f) => f.value >= facesRange.min_value && f.value <= facesRange.max_value)}
        onChange={setFaces}
      />
    </li>
  );
}

/** Le choix d'un nouveau dé : les dés standard en grille, ou sur mesure. */
function DiePickerDialog({
  open,
  onOpenChange,
  onPick,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (input: WorldDieInput) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("worlds.settings.dice");
  const tile = "flex flex-col items-center justify-center gap-2 px-3 py-4 text-sm font-medium disabled:opacity-60";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
          <DialogDescription>{t("pickHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STANDARD_DICE_FACES.map((faces) => (
            <InteractiveCard key={faces} disabled={disabled} className={tile} onClick={() => onPick(standardDie(faces))}>
              <DieGlyph faces={faces} className="size-8 text-muted-foreground" />
              {`d${faces}`}
            </InteractiveCard>
          ))}
          <InteractiveCard
            disabled={disabled}
            className={tile}
            onClick={() => onPick({ name: t("customName"), min_value: 1, max_value: 6, hidden: false })}
          >
            <Settings2 className="size-6 text-muted-foreground" aria-hidden />
            {t("custom")}
          </InteractiveCard>
        </div>
      </DialogContent>
    </Dialog>
  );
}
