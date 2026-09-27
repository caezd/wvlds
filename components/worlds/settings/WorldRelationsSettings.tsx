"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ArrowLeftRight, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorPickerButton } from "./ColorPickerButton";
import { FIELD, FeaturePage, SURFACE, SettingsSection } from "./FeatureLayout";
import type { RelationMaritalStatus, WorldRelationType as RelationType } from "@/types/relations";

type RelationGroup = { id: string; name: string; color: string; sort_index: number };

const RT_COLUMNS = "id, world_id, name, color, dash, sort_index, mutual, marital_status";

/** Les traits d'une relation sur le graphe (`dash` : un motif SVG ; vide, continu). */
function getDashOptions(t: ReturnType<typeof useTranslations<"relations">>) {
  return [
    { label: t("dash.solid"), value: "" },
    { label: t("dash.dashed"), value: "5 3" },
    { label: t("dash.dotted"), value: "2 3" },
    { label: t("dash.long"), value: "8 4" },
    { label: t("dash.mixed"), value: "8 3 2 3" },
  ];
}
/** Radix n'accepte pas de valeur vide pour une option : le trait continu. */
const SOLID = "solid";

/** La réciprocité d'un type : non, oui, ou oui et liée au statut marital des fiches. */
type Reciprocity = "none" | "mutual" | RelationMaritalStatus;

/** Une ligne d'une liste : bordée, sur le fond des cartes. */
const ROW = cn("flex min-h-12 flex-wrap items-center gap-3 rounded-md py-1.5 pl-3 pr-1.5", SURFACE);
/** Un champ sans cadre, dans une ligne. */
const BARE_INPUT = "h-8 min-w-32 flex-1 border-0 bg-transparent px-1.5 text-sm font-medium shadow-none focus-visible:ring-0 dark:bg-transparent";
/** La pastille de couleur, carrée comme sur la maquette. */
const SWATCH = "size-6 rounded-md border-0 shadow-none";

/**
 * L'onglet Relations des réglages d'un monde : les groupes de personas et
 * les types de relation, en sections (voir FeatureLayout). Chaque ligne se
 * modifie sur place — couleur, nom, trait, réciprocité — et s'enregistre à
 * la sortie du champ (la couleur, un instant après le dernier réglage : le
 * sélecteur HSV change à chaque mouvement).
 */
export function WorldRelationsSettings({ worldId }: { worldId: string }) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const dashOptions = getDashOptions(t);
  const supabase = React.useMemo(() => createClient(), []);

  const [groups, setGroups] = React.useState<RelationGroup[] | null>(null);
  const [relTypes, setRelTypes] = React.useState<RelationType[]>([]);

  React.useEffect(() => {
    void (async () => {
      const [{ data: gRows }, { data: rtRows }] = await Promise.all([
        supabase.from("world_persona_groups").select("id, name, color, sort_index").eq("world_id", worldId).order("sort_index"),
        supabase.from("world_relation_types").select(RT_COLUMNS).eq("world_id", worldId).order("sort_index"),
      ]);
      setGroups((gRows ?? []) as RelationGroup[]);
      setRelTypes((rtRows ?? []) as RelationType[]);
    })();
  }, [supabase, worldId]);

  // Les nouveaux : un groupe, un type.
  const [gName, setGName] = React.useState("");
  const [gColor, setGColor] = React.useState("#6366f1");
  const [rtName, setRtName] = React.useState("");
  const [rtColor, setRtColor] = React.useState("#22c55e");

  // La couleur s'enregistre un instant après le dernier réglage.
  const colorTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  React.useEffect(() => {
    const timers = colorTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);
  function persistColorSoon(key: string, save: () => void) {
    const timers = colorTimers.current;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); save(); }, 400));
  }

  // ── Groupes ─────────────────────────────────────────────────────────────────

  async function addGroup() {
    if (!gName.trim() || !groups) return;
    const { data, error } = await supabase
      .from("world_persona_groups")
      .insert({ world_id: worldId, name: gName.trim(), color: gColor, sort_index: groups.length })
      .select("id, name, color, sort_index")
      .single();
    if (error) { toast.error(error.message); return; }
    setGroups([...groups, data as RelationGroup]);
    setGName("");
  }

  async function deleteGroup(id: string) {
    const { error } = await supabase.from("world_persona_groups").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setGroups((prev) => prev?.filter((g) => g.id !== id) ?? null);
  }

  async function saveGroup(id: string, patch: Partial<Pick<RelationGroup, "name" | "color">>) {
    const { error } = await supabase.from("world_persona_groups").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
  }

  function editGroup(id: string, patch: Partial<Pick<RelationGroup, "name" | "color">>) {
    setGroups((prev) => prev?.map((g) => (g.id === id ? { ...g, ...patch } : g)) ?? null);
  }

  // ── Types de relation ──────────────────────────────────────────────────────

  async function addRelType() {
    if (!rtName.trim()) return;
    const { data, error } = await supabase
      .from("world_relation_types")
      .insert({ world_id: worldId, name: rtName.trim(), color: rtColor, dash: "", sort_index: relTypes.length, mutual: false })
      .select(RT_COLUMNS)
      .single();
    if (error) { toast.error(error.message); return; }
    setRelTypes([...relTypes, data as RelationType]);
    setRtName("");
  }

  async function deleteRelType(id: string) {
    const { error } = await supabase.from("world_relation_types").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRelTypes((prev) => prev.filter((rt) => rt.id !== id));
  }

  type TypePatch = Partial<Pick<RelationType, "name" | "color" | "dash" | "mutual" | "marital_status">>;
  async function saveRelType(id: string, patch: TypePatch) {
    const { error } = await supabase.from("world_relation_types").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return false; }
    return true;
  }

  function editRelType(id: string, patch: TypePatch) {
    setRelTypes((prev) => prev.map((rt) => (rt.id === id ? { ...rt, ...patch } : rt)));
  }

  /** Changer la réciprocité : un type marital l'est d'office (contrainte de la migration 173). */
  async function setReciprocity(rt: RelationType, value: Reciprocity) {
    const patch: TypePatch = value === "none"
      ? { mutual: false, marital_status: null }
      : value === "mutual"
        ? { mutual: true, marital_status: null }
        : { mutual: true, marital_status: value };
    if (await saveRelType(rt.id, patch)) editRelType(rt.id, patch);
  }

  if (groups === null) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Un seul type par statut marital et par monde (migration 173).
  const maritalTakenBy = (status: RelationMaritalStatus) => relTypes.find((rt) => rt.marital_status === status)?.id ?? null;
  const reciprocityLabel = (value: Reciprocity) =>
    value === "married" ? t("maritalMarried") : value === "in_relationship" ? t("maritalInRelationship") : t("mutual");

  return (
    <FeaturePage title={t("settingsTitle")}>
      {/* ── Groupes ── */}
      <SettingsSection
        title={t("groups")}
        help={t("groupsHelp")}
        meta={t("groupsCount", { count: groups.length })}
      >
        {groups.length === 0 && <p className="text-xs italic text-muted-foreground">{t("noGroupsDefined")}</p>}
        <ul className="space-y-2" aria-label={t("groups")}>
          {groups.map((g) => (
            <li key={g.id} className={ROW} data-group-id={g.id}>
              <ColorPickerButton
                color={g.color}
                className={SWATCH}
                onChange={(color) => {
                  editGroup(g.id, { color });
                  persistColorSoon(`g:${g.id}`, () => void saveGroup(g.id, { color }));
                }}
              />
              <Input
                value={g.name}
                aria-label={t("groupName")}
                className={BARE_INPUT}
                onChange={(e) => editGroup(g.id, { name: e.target.value })}
                onBlur={(e) => { if (e.target.value.trim()) void saveGroup(g.id, { name: e.target.value.trim() }); }}
              />
              <DeleteButton label={t("deleteGroup", { name: g.name })} onClick={() => void deleteGroup(g.id)} />
            </li>
          ))}
        </ul>
        <AddRow disabled={!gName.trim()} addLabel={t("addGroup")} buttonText={tCommon("add")} onAdd={() => void addGroup()}>
          <ColorPickerButton color={gColor} onChange={setGColor} className={SWATCH} />
          <Input
            value={gName}
            onChange={(e) => setGName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addGroup(); }}
            placeholder={t("groupNamePlaceholder")}
            aria-label={t("groupNamePlaceholder")}
            className={cn(BARE_INPUT, "font-normal")}
          />
        </AddRow>
      </SettingsSection>

      {/* ── Types de relation ── */}
      <SettingsSection
        title={t("relTypes")}
        help={t("relTypesHelp")}
        meta={t("typesCount", { count: relTypes.length })}
      >
        {relTypes.length === 0 && <p className="text-xs italic text-muted-foreground">{t("noTypesDefined")}</p>}
        <ul className="space-y-2" aria-label={t("relTypes")}>
          {relTypes.map((rt) => {
            const reciprocity: Reciprocity = rt.marital_status ?? (rt.mutual ? "mutual" : "none");
            return (
              <li key={rt.id} className={ROW} data-type-id={rt.id}>
                <ColorPickerButton
                  color={rt.color}
                  className={SWATCH}
                  onChange={(color) => {
                    editRelType(rt.id, { color });
                    persistColorSoon(`t:${rt.id}`, () => void saveRelType(rt.id, { color }));
                  }}
                />
                {/* Le trait tel qu'il paraît sur le graphe des relations. */}
                <svg width="28" height="8" className="shrink-0" aria-hidden data-testid="relation-line">
                  <line x1="0" y1="4" x2="28" y2="4" stroke={rt.color} strokeWidth={1.5} strokeDasharray={rt.dash || undefined} />
                </svg>
                <Input
                  value={rt.name}
                  aria-label={t("typeName")}
                  className={BARE_INPUT}
                  onChange={(e) => editRelType(rt.id, { name: e.target.value })}
                  onBlur={(e) => { if (e.target.value.trim()) void saveRelType(rt.id, { name: e.target.value.trim() }); }}
                />
                <Select
                  value={rt.dash || SOLID}
                  onValueChange={(v) => {
                    const dash = v === SOLID ? "" : v;
                    editRelType(rt.id, { dash });
                    void saveRelType(rt.id, { dash });
                  }}
                >
                  <SelectTrigger aria-label={t("dashFor", { name: rt.name })} className={cn("h-8 w-32 rounded-md px-2.5 text-xs data-[size=default]:h-8", FIELD)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dashOptions.map((o) => (
                      <SelectItem key={o.value || SOLID} value={o.value || SOLID}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Réciproque : la relation attend l'accord de l'autre joueur et
                    existe dans les deux sens ; un type marital l'est d'office.
                    Éteint quand le type ne l'est pas. */}
                <Select value={reciprocity} onValueChange={(v) => void setReciprocity(rt, v as Reciprocity)}>
                  <SelectTrigger
                    aria-label={t("reciprocityFor", { name: rt.name })}
                    className={cn(
                      "h-8 w-auto gap-1.5 rounded-md px-2.5 text-xs shadow-none data-[size=default]:h-8 [&>svg:last-child]:hidden",
                      reciprocity === "none"
                        ? "border-border-soft bg-transparent text-muted-foreground dark:bg-transparent"
                        : "border-border bg-card text-foreground dark:bg-card",
                    )}
                    data-reciprocity={reciprocity}
                  >
                    <ArrowLeftRight className="size-3.5" aria-hidden />
                    <span>{reciprocityLabel(reciprocity)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("notMutual")}</SelectItem>
                    <SelectItem value="mutual">{t("mutual")}</SelectItem>
                    {(["in_relationship", "married"] as const).map((status) => {
                      const takenBy = maritalTakenBy(status);
                      return (
                        <SelectItem key={status} value={status} disabled={takenBy !== null && takenBy !== rt.id}>
                          {reciprocityLabel(status)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {/* Le type marital d'un monde ne se supprime pas : c'est lui
                    que la fiche choisit quand on désigne un·e conjoint·e. */}
                <DeleteButton
                  label={t("deleteType", { name: rt.name })}
                  disabled={rt.marital_status !== null}
                  title={rt.marital_status !== null ? t("maritalUndeletable") : undefined}
                  onClick={() => void deleteRelType(rt.id)}
                />
              </li>
            );
          })}
        </ul>
        <AddRow disabled={!rtName.trim()} addLabel={t("addRelType")} buttonText={tCommon("add")} onAdd={() => void addRelType()}>
          <ColorPickerButton color={rtColor} onChange={setRtColor} className={SWATCH} />
          <Input
            value={rtName}
            onChange={(e) => setRtName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addRelType(); }}
            placeholder={t("typeNamePlaceholder")}
            aria-label={t("typeNamePlaceholder")}
            className={cn(BARE_INPUT, "font-normal")}
          />
        </AddRow>
      </SettingsSection>
    </FeaturePage>
  );
}

/** La corbeille d'une ligne. */
function DeleteButton({ label, disabled, title, onClick }: { label: string; disabled?: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted-foreground"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

/** La ligne d'ajout qui ferme une liste, en pointillés : ses champs, puis « + Ajouter ». */
function AddRow({
  disabled,
  addLabel,
  buttonText,
  onAdd,
  children,
}: {
  disabled: boolean;
  addLabel: string;
  buttonText: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-3 rounded-md border border-dashed border-border-soft py-1.5 pl-3 pr-1.5">
      {children}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0 gap-1 rounded-md border-border-soft bg-card font-normal dark:bg-card"
        disabled={disabled}
        aria-label={addLabel}
        onClick={onAdd}
      >
        <Plus className="size-3.5" aria-hidden />
        {buttonText}
      </Button>
    </div>
  );
}
