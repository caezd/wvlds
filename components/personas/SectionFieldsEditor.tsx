"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { toWebP } from "@/lib/imageUtils";
import type { PersonaSectionField, PersonaFieldType, PersonaStat } from "@/types/personas";

import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { ParagraphBlockEditor } from "@/components/chatrooms/ParagraphBlockEditor";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { ArrowUp, ArrowDown, Plus, Trash2, Type, AlignLeft, BarChart3, Minus, X, ImageIcon, Loader2, Expand } from "lucide-react";
import { ImageLightbox } from "@/components/chatrooms/ImageLightbox";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";

function makeStatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function StatsField({
  initialItems,
  onSave,
}: {
  initialItems: PersonaStat[];
  onSave: (items: PersonaStat[]) => void;
}) {
  const [items, setItems] = useState<PersonaStat[]>(initialItems);

  function update(next: PersonaStat[]) {
    setItems(next);
    onSave(next);
  }

  function patch(id: string, key: keyof PersonaStat, val: string) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }

  function addStat() {
    update([...items, { id: makeStatId(), label: "", value: "", unit: "" }]);
  }

  function removeStat(id: string) {
    update(items.filter((it) => it.id !== id));
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
      {items.map((stat) => (
        <div
          key={stat.id}
          className="group/stat relative flex flex-col gap-1 rounded-lg border border-border-soft bg-muted/30 px-3 py-2"
        >
          <button
            type="button"
            onClick={() => removeStat(stat.id)}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover/stat:flex"
            aria-label="Supprimer la stat"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <input
            value={stat.label}
            onChange={(e) => patch(stat.id, "label", e.target.value)}
            placeholder="AGI"
            className="w-full bg-transparent text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          />
          <div className="flex items-baseline gap-1">
            <input
              value={stat.value}
              onChange={(e) => patch(stat.id, "value", e.target.value)}
              placeholder="10"
              className="min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40"
            />
            <input
              value={stat.unit ?? ""}
              onChange={(e) => patch(stat.id, "unit", e.target.value)}
              placeholder="cm"
              className="w-8 shrink-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addStat}
        className="flex min-h-[3.75rem] items-center justify-center gap-1 rounded-lg border border-dashed border-border-soft text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Stat
      </button>
    </div>
  );
}

function MarkdownTextField({
  initialText,
  onSave,
}: {
  initialText: string;
  onSave: (val: string) => void;
}) {
  const [value, setValue] = useState(initialText);

  return (
    <ParagraphBlockEditor
      value={value}
      onChange={(v) => {
        setValue(v);
        onSave(v);
      }}
      submitOnEnter={false}
      placeholder="Écris en markdown…"
      className="text-sm leading-relaxed font-mono pr-24"
    />
  );
}

export interface PersonaGridImage {
  id: string;
  url: string;
  caption?: string;
}

function ImageGridField({
  fieldId,
  initialImages,
  personaId,
  userId,
  onSave,
}: {
  fieldId: string;
  initialImages: PersonaGridImage[];
  personaId: string;
  userId: string | null;
  onSave: (images: PersonaGridImage[]) => void;
}) {
  const supabase = createClient();
  const [images, setImages] = useState<PersonaGridImage[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !userId) return;
    setUploading(true);
    setUploadError(null);
    const added: PersonaGridImage[] = [];
    let errored = false;
    for (const rawFile of Array.from(files)) {
      const file = await toWebP(rawFile);
      const path = `user-${userId}/section-images/${personaId}/${fieldId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("personas").upload(path, file, { upsert: false, contentType: file.type });
      if (error) { errored = true; continue; }
      const { data } = supabase.storage.from("personas").getPublicUrl(path);
      added.push({ id: path, url: data.publicUrl });
    }
    if (errored) setUploadError("Certaines images n'ont pas pu être uploadées.");
    const next = [...images, ...added];
    setImages(next);
    onSave(next);
    setUploading(false);
  }

  function removeImage(id: string) {
    const next = images.filter((img) => img.id !== id);
    setImages(next);
    onSave(next);
  }

  return (
    <div className="space-y-2 pr-24">
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {lightboxIndex !== null && (
        <ImageLightbox
          items={images.map((img) => ({ url: img.url, name: img.caption ?? "Image" }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
        {images.map((img, i) => (
          <div key={img.id} className="group/img relative aspect-square overflow-hidden rounded-md bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={supabaseThumb(img.url, 300) ?? img.url} onError={(e) => { e.currentTarget.src = img.url; e.currentTarget.onerror = null; }} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
            <div className="absolute inset-0 hidden group-hover/img:flex items-start justify-between p-1">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Agrandir"
              >
                <Expand className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive"
                aria-label="Supprimer l'image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !userId}
          className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border-soft text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
          aria-label="Ajouter des images"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}

type SectionFieldsEditorProps = {
  sectionId: string;
  personaId: string;
  userId: string | null;
  initialFields: PersonaSectionField[];
  /** Remonte l'état courant des champs au parent (source de vérité locale). */
  onFieldsChange?: (fields: PersonaSectionField[]) => void;
};

export function SectionFieldsEditor({ sectionId, personaId, userId, initialFields, onFieldsChange }: SectionFieldsEditorProps) {
  const supabase = createClient();
  const flags = useFeatureFlags();
  const fieldsEnabled = flags.persona_fields;
  const persona_field_title     = fieldsEnabled && flags.persona_field_title;
  const persona_field_text      = fieldsEnabled && flags.persona_field_text;
  const persona_field_stats     = fieldsEnabled && flags.persona_field_stats;
  const persona_field_separator = fieldsEnabled && flags.persona_field_separator;
  const persona_field_image_grid = fieldsEnabled && flags.persona_field_image_grid;
  const [fields, setFields] = useState<PersonaSectionField[]>(initialFields);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
              : { text: "", format: "markdown" };

    const { data, error } = await supabase
      .from("persona_section_fields")
      .insert({ section_id: sectionId, type, data: defaultData })
      .select("id, section_id, type, position, data")
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


  function AddFieldMenu({ insertAt }: { insertAt: number }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="cursor-pointer transition-opacity opacity-0 hover:opacity-100 group-hover/field:opacity-100 relative h-3 w-full flex justify-center before:absolute before:h-px before:w-full before:top-1/2 before:-translate-y-1/2 before:bg-border">
            <button className="w-4 h-4 bg-border rounded-full inline-flex items-center justify-center absolute top-1/2 -translate-y-1/2 z-10">
              <Plus size={10} />
            </button>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
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
          {persona_field_stats && (
            <DropdownMenuItem onClick={() => handleAddField("stats", insertAt)}>
              <BarChart3 className="mr-2 h-4 w-4" /> Stats
            </DropdownMenuItem>
          )}
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
          <p className="text-sm text-muted-foreground">Aucun champ. Ajoutes-en un pour commencer.</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" type="button" className="w-full">
                <Plus className="mr-2 h-4 w-4" /> Ajouter un champ
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44">
              {persona_field_title && (
                <DropdownMenuItem onClick={() => handleAddField("title", 0)}>
                  <Type className="mr-2 h-4 w-4" /> Titre
                </DropdownMenuItem>
              )}
              {persona_field_text && (
                <DropdownMenuItem onClick={() => handleAddField("text", 0)}>
                  <AlignLeft className="mr-2 h-4 w-4" /> Bloc de texte
                </DropdownMenuItem>
              )}
              {persona_field_stats && (
                <DropdownMenuItem onClick={() => handleAddField("stats", 0)}>
                  <BarChart3 className="mr-2 h-4 w-4" /> Stats
                </DropdownMenuItem>
              )}
              {persona_field_separator && (
                <DropdownMenuItem onClick={() => handleAddField("separator", 0)}>
                  <Minus className="mr-2 h-4 w-4" /> Séparateur
                </DropdownMenuItem>
              )}
              {persona_field_image_grid && (
                <DropdownMenuItem onClick={() => handleAddField("image-grid", 0)}>
                  <ImageIcon className="mr-2 h-4 w-4" /> Grille d&apos;images
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
                  {/* Actions flottantes */}
                  <div className="absolute right-1.5 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7" onClick={() => handleMoveField(field.id, "up")} disabled={isFirst}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7" onClick={() => handleMoveField(field.id, "down")} disabled={isLast}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    {field.type === "image-grid" ? (
                      <DeleteConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        description="Ce champ et toutes ses images hébergées seront supprimés définitivement."
                        onConfirm={() => handleDeleteField(field.id)}
                      />
                    ) : (
                      <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteField(field.id)}>
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
