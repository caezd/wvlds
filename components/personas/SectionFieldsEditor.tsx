"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUp, ArrowDown, Plus, Trash2, Type, AlignLeft, BarChart3, Minus, ImageIcon,
  Backpack, Swords, Gauge, Quote, Tag, CalendarDays, Lock, LockOpen, List,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import type {
  PersonaSectionField, PersonaFieldType, PersonaStat, PersonaGridImage, InventoryItem,
  SkillItem, GaugeItem, TraitItem, TimelineItem, DlItem,
} from "@/types/personas";
import type { WorldInventoryItem, WorldSkill } from "@/types/worlds";

// Les dix éditeurs de champ vivent dans `./fields`. Ce fichier faisait
// 1 569 lignes, dont 890 de composants sans lien entre eux : chacun gère un
// type de champ, aucun n'appelle les autres. Ici ne reste que l'orchestration —
// l'ordre des champs, leur ajout, leur suppression, leur verrouillage.
import { DlField } from "./fields/DlField";
import { GaugesField } from "./fields/GaugesField";
import { ImageGridField } from "./fields/ImageGridField";
import { InventoryField } from "./fields/InventoryField";
import { MarkdownTextField } from "./fields/MarkdownTextField";
import { QuoteField } from "./fields/QuoteField";
import { SkillsField } from "./fields/SkillsField";
import { StatsField } from "./fields/StatsField";
import { TimelineField } from "./fields/TimelineField";
import { TraitsField } from "./fields/TraitsField";

type SectionFieldsEditorProps = {
  sectionId: string;
  personaId: string;
  userId: string | null;
  initialFields: PersonaSectionField[];
  /** Remonte l'état courant des champs au parent (source de vérité locale). */
  onFieldsChange?: (fields: PersonaSectionField[]) => void;
  worldId?: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  /** Édition de la fiche modèle d'un monde : permet de verrouiller des champs. */
  isTemplate?: boolean;
};

export function SectionFieldsEditor({ sectionId, personaId, userId, initialFields, onFieldsChange, worldId, restrictInventory, restrictSkills, isTemplate }: SectionFieldsEditorProps) {
  const tCommon = useTranslations("common");
  const tPersonas = useTranslations("personas");
  const supabase = createClient();
  const flags = useFeatureFlags();
  const fieldsEnabled = flags.persona_fields;
  const persona_field_title = fieldsEnabled && flags.persona_field_title;
  const persona_field_text = fieldsEnabled && flags.persona_field_text;
  const persona_field_stats = fieldsEnabled && flags.persona_field_stats;
  const persona_field_separator = fieldsEnabled && flags.persona_field_separator;
  const persona_field_image_grid = fieldsEnabled && flags.persona_field_image_grid;
  const persona_field_inventory = fieldsEnabled && flags.persona_field_inventory;
  const persona_field_skills = fieldsEnabled && flags.persona_field_skills;
  const persona_field_gauges = fieldsEnabled && flags.persona_field_gauges;
  const persona_field_quote = fieldsEnabled && flags.persona_field_quote;
  const persona_field_traits = fieldsEnabled && flags.persona_field_traits;
  const persona_field_timeline = fieldsEnabled && flags.persona_field_timeline;
  const persona_field_dl = fieldsEnabled && flags.persona_field_dl;
  const [fields, setFields] = useState<PersonaSectionField[]>(initialFields);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inventoryCatalog, setInventoryCatalog] = useState<WorldInventoryItem[] | undefined>(undefined);
  const [skillsCatalog, setSkillsCatalog] = useState<WorldSkill[] | undefined>(undefined);

  useEffect(() => {
    if (!worldId) return;
    async function fetchCatalog() {
      if (restrictInventory) {
        const { data } = await (supabase as ReturnType<typeof createClient>)
          .from("world_inventory_items")
          .select("id, world_id, name, description, icon, sort_index")
          .eq("world_id", worldId!)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true });
        setInventoryCatalog((data as WorldInventoryItem[] | null) ?? []);
      }
      if (restrictSkills) {
        const { data } = await (supabase as ReturnType<typeof createClient>)
          .from("world_skills")
          .select("id, world_id, name, description, icon, sort_index")
          .eq("world_id", worldId!)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true });
        setSkillsCatalog((data as WorldSkill[] | null) ?? []);
      }
    }
    void fetchCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, restrictInventory, restrictSkills]);

  // Synchronise l'état local vers le parent à chaque changement (sauf au montage
  // initial, où les données sont déjà identiques à celles du parent).
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    onFieldsChange?.(fields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);



  function computeWithPositions(list: PersonaSectionField[]) {
    return list.map((f, idx) => ({ ...f, position: idx * 10 }));
  }

  async function persistPositions(list: PersonaSectionField[]) {
    const results = await Promise.all(
      list.map((f) =>
        supabase.from("persona_section_fields").update({ position: f.position }).eq("id", f.id),
      ),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) setErrorMessage(err.message ?? "Erreur positions.");
  }

  async function handleAddField(type: PersonaFieldType, insertAt: number) {
    setErrorMessage(null);

    const defaultData: Record<string, unknown> =
      type === "title"
        ? { text: "" }
        : type === "stats"
          ? { items: [] }
          : type === "separator"
            ? {}
            : type === "image-grid"
              ? { images: [] }
              : type === "inventory"
                ? { inventoryItems: [] }
                : type === "skills"
                  ? { skillItems: [] }
                  : type === "gauges"
                    ? { gaugeItems: [] }
                    : type === "quote"
                      ? { quoteText: "", quoteSource: "" }
                      : type === "traits"
                        ? { traitItems: [] }
                        : type === "timeline"
                          ? { timelineItems: [] }
                          : type === "dl"
                            ? { dlItems: [] }
                            : { text: "", format: "markdown" };

    const { data, error } = await supabase
      .from("persona_section_fields")
      .insert({ section_id: sectionId, type, data: defaultData })
      .select("id, section_id, type, position, data, locked")
      .single();

    if (error) {
      setErrorMessage(error.message ?? "Erreur ajout.");
      return;
    }

    const current = [...fields];
    current.splice(insertAt, 0, data as PersonaSectionField);
    const withPos = computeWithPositions(current);
    setFields(withPos);
    await persistPositions(withPos);
  }


  // Sauvegarde inline (blur) pour les champs input/textarea
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveFieldValue = useCallback(
    async (fieldId: string, key: "value" | "text", newValue: string) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, [key]: newValue } } : f,
        ),
      );
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const field = fields.find((f) => f.id === fieldId);
        if (!field) return;
        const newData = { ...field.data, [key]: newValue };
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: newData })
          .eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields],
  );

  const saveImageGrid = useCallback(
    async (fieldId: string, images: PersonaGridImage[]) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, images } } : f,
        ),
      );
      const { error } = await supabase
        .from("persona_section_fields")
        .update({ data: { images } })
        .eq("id", fieldId);
      if (error) setErrorMessage(error.message ?? "Erreur sauvegarde images.");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const saveStatsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveFieldItems = useCallback(
    (fieldId: string, items: PersonaStat[]) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, items } } : f,
        ),
      );
      if (saveStatsTimer.current) clearTimeout(saveStatsTimer.current);
      saveStatsTimer.current = setTimeout(async () => {
        const field = fields.find((f) => f.id === fieldId);
        const newData = { ...(field?.data ?? {}), items };
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: newData })
          .eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields],
  );

  const inventoryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveInventoryItems = useCallback(
    (fieldId: string, inventoryItems: InventoryItem[]) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, inventoryItems } } : f,
        ),
      );
      if (inventoryTimer.current) clearTimeout(inventoryTimer.current);
      inventoryTimer.current = setTimeout(async () => {
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: { inventoryItems } })
          .eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde inventaire.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const skillsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveSkillItems = useCallback(
    (fieldId: string, skillItems: SkillItem[]) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, skillItems } } : f,
        ),
      );
      if (skillsTimer.current) clearTimeout(skillsTimer.current);
      skillsTimer.current = setTimeout(async () => {
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: { skillItems } })
          .eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde compétences.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const gaugesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGaugeItems = useCallback(
    (fieldId: string, gaugeItems: GaugeItem[]) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, gaugeItems } } : f),
      );
      if (gaugesTimer.current) clearTimeout(gaugesTimer.current);
      gaugesTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { gaugeItems } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde jauges.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQuote = useCallback(
    (fieldId: string, quoteText: string, quoteSource: string) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, quoteText, quoteSource } } : f),
      );
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
      quoteTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { quoteText, quoteSource } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde citation.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const traitsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTraitItems = useCallback(
    (fieldId: string, traitItems: TraitItem[]) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, traitItems } } : f),
      );
      if (traitsTimer.current) clearTimeout(traitsTimer.current);
      traitsTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { traitItems } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde traits.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const timelineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimelineItems = useCallback(
    (fieldId: string, timelineItems: TimelineItem[]) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, timelineItems } } : f),
      );
      if (timelineTimer.current) clearTimeout(timelineTimer.current);
      timelineTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { timelineItems } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde timeline.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const dlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDlItems = useCallback(
    (fieldId: string, dlItems: DlItem[]) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, dlItems } } : f),
      );
      if (dlTimer.current) clearTimeout(dlTimer.current);
      dlTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { dlItems } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde liste.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function handleMoveField(fieldId: string, direction: "up" | "down") {
    const index = fields.findIndex((f) => f.id === fieldId);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    const withPos = computeWithPositions(next);
    setFields(withPos);
    await persistPositions(withPos);
  }

  // Verrouille/déverrouille un champ de la fiche modèle (le trigger DB
  // n'autorise ce changement que sur un persona modèle).
  async function toggleFieldLock(field: PersonaSectionField) {
    const next = !field.locked;
    const { error } = await supabase
      .from("persona_section_fields")
      .update({ locked: next })
      .eq("id", field.id);
    if (error) { setErrorMessage(error.message ?? "Erreur de verrouillage."); return; }
    setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, locked: next } : f)));
  }

  async function handleDeleteField(fieldId: string) {
    const field = fields.find((f) => f.id === fieldId);
    if (field?.type === "image-grid") {
      // Lire depuis la DB pour avoir les chemins à jour (état local peut être désynchronisé)
      const { data: dbField } = await supabase
        .from("persona_section_fields")
        .select("data")
        .eq("id", fieldId)
        .single();
      const paths = ((dbField?.data?.images ?? []) as PersonaGridImage[])
        .map((img) => img.id)
        .filter(Boolean);
      if (paths.length) await supabase.storage.from("personas").remove(paths);
    }
    const { error } = await supabase.from("persona_section_fields").delete().eq("id", fieldId);
    if (error) { setErrorMessage(error.message ?? "Erreur suppression."); return; }
    const next = computeWithPositions(fields.filter((f) => f.id !== fieldId));
    setFields(next);
  }


  function AddFieldMenu({ insertAt, trigger }: { insertAt: number; trigger?: ReactNode }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <div className="cursor-pointer transition-opacity opacity-0 hover:opacity-100 focus-within:opacity-100 group-hover/field:opacity-100 relative h-6 w-full flex justify-center before:absolute before:h-px before:w-full before:top-1/2 before:-translate-y-1/2 before:bg-border">
              <button className="w-4 h-4 bg-accent/50 text-primary rounded-full inline-flex items-center justify-center absolute top-1/2 -translate-y-1/2 z-10" aria-label={tCommon("add")}>
                <Plus size={12} />
              </button>
            </div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48">
          {persona_field_title && (
            <DropdownMenuItem onClick={() => handleAddField("title", insertAt)}>
              <Type className="mr-2 h-4 w-4" /> Titre
            </DropdownMenuItem>
          )}
          {persona_field_text && (
            <DropdownMenuItem onClick={() => handleAddField("text", insertAt)}>
              <AlignLeft className="mr-2 h-4 w-4" /> Bloc de texte
            </DropdownMenuItem>
          )}
          {persona_field_dl && (
            <DropdownMenuItem onClick={() => handleAddField("dl", insertAt)}>
              <List className="mr-2 h-4 w-4" /> Liste descriptive
            </DropdownMenuItem>
          )}
          {persona_field_quote && (
            <DropdownMenuItem onClick={() => handleAddField("quote", insertAt)}>
              <Quote className="mr-2 h-4 w-4" /> Citation
            </DropdownMenuItem>
          )}
          {(persona_field_stats || persona_field_gauges || persona_field_inventory || persona_field_skills) && <DropdownMenuSeparator />}
          {persona_field_stats && (
            <DropdownMenuItem onClick={() => handleAddField("stats", insertAt)}>
              <BarChart3 className="mr-2 h-4 w-4" /> Stats
            </DropdownMenuItem>
          )}
          {persona_field_gauges && (
            <DropdownMenuItem onClick={() => handleAddField("gauges", insertAt)}>
              <Gauge className="mr-2 h-4 w-4" /> Jauges
            </DropdownMenuItem>
          )}
          {persona_field_inventory && (
            <DropdownMenuItem onClick={() => handleAddField("inventory", insertAt)}>
              <Backpack className="mr-2 h-4 w-4" /> Inventaire
            </DropdownMenuItem>
          )}
          {persona_field_skills && (
            <DropdownMenuItem onClick={() => handleAddField("skills", insertAt)}>
              <Swords className="mr-2 h-4 w-4" /> Compétences
            </DropdownMenuItem>
          )}
          {(persona_field_traits || persona_field_timeline) && <DropdownMenuSeparator />}
          {persona_field_traits && (
            <DropdownMenuItem onClick={() => handleAddField("traits", insertAt)}>
              <Tag className="mr-2 h-4 w-4" /> Traits
            </DropdownMenuItem>
          )}
          {persona_field_timeline && (
            <DropdownMenuItem onClick={() => handleAddField("timeline", insertAt)}>
              <CalendarDays className="mr-2 h-4 w-4" /> Timeline
            </DropdownMenuItem>
          )}
          {(persona_field_separator || persona_field_image_grid) && <DropdownMenuSeparator />}
          {persona_field_separator && (
            <DropdownMenuItem onClick={() => handleAddField("separator", insertAt)}>
              <Minus className="mr-2 h-4 w-4" /> Séparateur
            </DropdownMenuItem>
          )}
          {persona_field_image_grid && (
            <DropdownMenuItem onClick={() => handleAddField("image-grid", insertAt)}>
              <ImageIcon className="mr-2 h-4 w-4" /> Grille d&apos;images
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-1">
      {errorMessage && <p className="text-xs text-red-500 mb-2">{errorMessage}</p>}

      {fields.length === 0 ? (
        <div className="py-4 space-y-3">
          <p className="text-sm text-muted-foreground">{tPersonas("noField")}</p>
          <AddFieldMenu
            insertAt={0}
            trigger={
              <Button variant="outline" size="sm" type="button" className="w-full">
                <Plus className="mr-2 h-4 w-4" /> Ajouter un champ
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-0">
          <AddFieldMenu insertAt={0} />

          {fields.map((field, index) => {
            const isFirst = index === 0;
            const isLast = index === fields.length - 1;

            return (
              <div key={field.id} className="group/field">
                <div className="group relative rounded-md border border-transparent py-1.5 px-2 hover:border-border-soft transition-colors">
                  {/* Badge permanent : champ requis par la fiche du monde */}
                  {!isTemplate && field.locked && (
                    <span
                      className="absolute right-2.5 top-2 text-muted-foreground/50 group-hover:opacity-0 transition-opacity z-10"
                      title={tPersonas("fieldRequiredByWorld")}
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </span>
                  )}

                  {/* Actions flottantes */}
                  <div className="absolute right-1.5 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10">
                    <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7" onClick={() => handleMoveField(field.id, "up")} disabled={isFirst} aria-label={tCommon("moveUp")}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7" onClick={() => handleMoveField(field.id, "down")} disabled={isLast} aria-label={tCommon("moveDown")}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    {isTemplate && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        className={cn("h-7 w-7", field.locked ? "text-primary" : "text-muted-foreground")}
                        title={field.locked
                          ? "Champ verrouillé (requis sur les fiches des joueurs) — cliquer pour déverrouiller"
                          : "Verrouiller ce champ : il sera requis sur les fiches des joueurs"}
                        onClick={() => void toggleFieldLock(field)}
                      >
                        {field.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {!isTemplate && field.locked ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        disabled
                        className="h-7 w-7 text-muted-foreground"
                        title={tPersonas("fieldRequiredLocked")}
                      >
                        <Lock className="h-3.5 w-3.5" />
                      </Button>
                    ) : field.type === "image-grid" ? (
                      <DeleteConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={tPersonas("deleteField")}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        description={tPersonas("fieldDeleteDescription")}
                        onConfirm={() => handleDeleteField(field.id)}
                      />
                    ) : (
                      <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteField(field.id)} aria-label={tPersonas("deleteField")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Rendu du champ */}
                  {field.type === "title" && (
                    <input
                      defaultValue={field.data?.text ?? ""}
                      placeholder="Titre…"
                      onBlur={(e) => saveFieldValue(field.id, "text", e.target.value)}
                      className="w-full bg-transparent text-base font-semibold pr-24 outline-none placeholder:text-muted-foreground/40 focus:ring-0 border-none"
                    />
                  )}

                  {field.type === "text" && (
                    <MarkdownTextField
                      initialText={field.data?.text ?? ""}
                      onSave={(val) => saveFieldValue(field.id, "text", val)}
                    />
                  )}

                  {field.type === "stats" && (
                    <div className="pr-24">
                      <StatsField
                        initialItems={field.data?.items ?? []}
                        onSave={(items) => saveFieldItems(field.id, items)}
                      />
                    </div>
                  )}

                  {field.type === "separator" && (
                    <div className="flex h-6 items-center pr-24">
                      <div className="h-px w-full bg-border" />
                    </div>
                  )}

                  {field.type === "image-grid" && (
                    <ImageGridField
                      fieldId={field.id}
                      initialImages={field.data?.images ?? []}
                      personaId={personaId}
                      userId={userId}
                      onSave={(images) => saveImageGrid(field.id, images)}
                    />
                  )}

                  {field.type === "inventory" && (
                    <InventoryField
                      initialItems={field.data?.inventoryItems ?? []}
                      onSave={(items) => saveInventoryItems(field.id, items)}
                      catalogItems={inventoryCatalog}
                    />
                  )}

                  {field.type === "skills" && (
                    <SkillsField
                      initialItems={field.data?.skillItems ?? []}
                      onSave={(items) => saveSkillItems(field.id, items)}
                      catalogItems={skillsCatalog}
                    />
                  )}

                  {field.type === "gauges" && (
                    <GaugesField
                      initialItems={field.data?.gaugeItems ?? []}
                      onSave={(items) => saveGaugeItems(field.id, items)}
                    />
                  )}

                  {field.type === "quote" && (
                    <QuoteField
                      initialText={field.data?.quoteText ?? ""}
                      initialSource={field.data?.quoteSource ?? ""}
                      onSave={(text, source) => saveQuote(field.id, text, source)}
                    />
                  )}

                  {field.type === "traits" && (
                    <TraitsField
                      initialItems={field.data?.traitItems ?? []}
                      onSave={(items) => saveTraitItems(field.id, items)}
                    />
                  )}

                  {field.type === "timeline" && (
                    <TimelineField
                      initialItems={field.data?.timelineItems ?? []}
                      onSave={(items) => saveTimelineItems(field.id, items)}
                    />
                  )}

                  {field.type === "dl" && (
                    <DlField
                      initialItems={field.data?.dlItems ?? []}
                      onSave={(items) => saveDlItems(field.id, items)}
                    />
                  )}

                </div>

                <AddFieldMenu insertAt={index + 1} />
              </div>
            );
          })}
        </div>
      )}


    </div>
  );
}
