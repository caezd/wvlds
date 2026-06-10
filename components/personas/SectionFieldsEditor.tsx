"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PersonaSectionField, PersonaFieldType } from "@/types/personas";

import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { ArrowUp, ArrowDown, Plus, Trash2, Type, AlignLeft } from "lucide-react";

function MarkdownTextField({
  fieldId,
  initialText,
  onSave,
}: {
  fieldId: string;
  initialText: string;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    setEditing(true);
    setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      el.focus();
    }, 0);
  }

  function handleBlur() {
    setEditing(false);
    onSave(value);
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = el.scrollHeight + "px";
        }}
        onBlur={handleBlur}
        placeholder="Écris en markdown…"
        rows={3}
        className="w-full bg-transparent text-sm leading-relaxed text-foreground pr-20 outline-none placeholder:text-muted-foreground/40 focus:ring-0 border-none resize-none font-mono"
      />
    );
  }

  return (
    <div
      onClick={startEdit}
      className="min-h-[2rem] cursor-text pr-20"
      title="Cliquer pour éditer"
    >
      {value ? (
        <MarkdownRenderer content={value} className="text-sm prose-sm" />
      ) : (
        <span className="text-sm text-muted-foreground/40 italic">Écris en markdown…</span>
      )}
    </div>
  );
}

type SectionFieldsEditorProps = {
  sectionId: string;
  initialFields: PersonaSectionField[];
};

export function SectionFieldsEditor({ sectionId, initialFields }: SectionFieldsEditorProps) {
  const supabase = createClient();
  const [fields, setFields] = useState<PersonaSectionField[]>(initialFields);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);



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

    const defaultData: Record<string, string> =
      type === "title" ? { text: "" } : { text: "", format: "markdown" };

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
    const { error } = await supabase.from("persona_section_fields").delete().eq("id", fieldId);
    if (error) { setErrorMessage(error.message ?? "Erreur suppression."); return; }
    const next = computeWithPositions(fields.filter((f) => f.id !== fieldId));
    setFields(next);
  }


  function AddFieldMenu({ insertAt }: { insertAt: number }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="cursor-pointer transition-opacity opacity-0 hover:opacity-100 relative h-3 w-full flex justify-center before:absolute before:h-px before:w-full before:top-1/2 before:-translate-y-1/2 before:bg-border">
            <button className="w-4 h-4 bg-border rounded-full inline-flex items-center justify-center absolute top-1/2 -translate-y-1/2 z-10">
              <Plus size={10} />
            </button>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          <DropdownMenuItem onClick={() => handleAddField("title", insertAt)}>
            <Type className="mr-2 h-4 w-4" /> Titre
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAddField("text", insertAt)}>
            <AlignLeft className="mr-2 h-4 w-4" /> Bloc de texte
          </DropdownMenuItem>
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
              <DropdownMenuItem onClick={() => handleAddField("title", 0)}>
                <Type className="mr-2 h-4 w-4" /> Titre
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddField("text", 0)}>
                <AlignLeft className="mr-2 h-4 w-4" /> Bloc de texte
              </DropdownMenuItem>
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
              <div key={field.id}>
                <div className="group relative rounded-md py-1 px-1 hover:bg-muted/30 transition-colors">
                  {/* Actions flottantes */}
                  <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Button variant="ghost" size="icon-sm" type="button" onClick={() => handleMoveField(field.id, "up")} disabled={isFirst}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" type="button" onClick={() => handleMoveField(field.id, "down")} disabled={isLast}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" type="button" onClick={() => handleDeleteField(field.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Rendu du champ */}
                  {field.type === "title" && (
                    <input
                      defaultValue={field.data?.text ?? ""}
                      placeholder="Titre…"
                      onBlur={(e) => saveFieldValue(field.id, "text", e.target.value)}
                      className="w-full bg-transparent text-base font-semibold pr-20 outline-none placeholder:text-muted-foreground/40 focus:ring-0 border-none"
                    />
                  )}

                  {field.type === "text" && (
                    <MarkdownTextField
                      fieldId={field.id}
                      initialText={field.data?.text ?? ""}
                      onSave={(val) => saveFieldValue(field.id, "text", val)}
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
