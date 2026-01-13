// components/personas/SectionFieldsEditor.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PersonaSectionField, PersonaFieldType } from "@/types/personas";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Pencil, ArrowUp, ArrowDown, Plus } from "lucide-react";

type SectionFieldsEditorProps = {
  sectionId: string;
  initialFields: PersonaSectionField[];
};

export function SectionFieldsEditor({
  sectionId,
  initialFields,
}: SectionFieldsEditorProps) {
  const supabase = createClient();

  const [fields, setFields] = useState<PersonaSectionField[]>(initialFields);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editingField, setEditingField] = useState<PersonaSectionField | null>(
    null,
  );
  const [editingValue, setEditingValue] = useState<string>("");

  function computeWithPositions(list: PersonaSectionField[]) {
    return list.map((f, idx) => ({
      ...f,
      position: idx * 10,
    }));
  }

  async function persistPositions(list: PersonaSectionField[]) {
    const updates = list.map((f) =>
      supabase
        .from("persona_section_fields")
        .update({ position: f.position })
        .eq("id", f.id),
    );

    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      console.error("persistPositions error", firstError);
      setErrorMessage(
        firstError.message ?? "Erreur lors de la mise à jour des positions.",
      );
    }
  }

  // Ajout d’un champ (possibilité d’insertion à un index précis)
  async function handleAddField(type: PersonaFieldType, insertAt?: number) {
    setErrorMessage(null);

    const defaultData =
      type === "title" ? { text: "" } : { text: "", format: "markdown" };

    const { data, error } = await supabase
      .from("persona_section_fields")
      .insert({
        section_id: sectionId,
        type,
        data: defaultData,
      })
      .select("id, section_id, type, position, data")
      .single();

    if (error) {
      console.error("handleAddField error", error);
      setErrorMessage(error.message ?? "Erreur lors de l’ajout du champ.");
      return;
    }

    const newField = data as PersonaSectionField;

    const current = [...fields];
    const index = insertAt !== undefined ? insertAt : current.length;
    current.splice(index, 0, newField);

    const withPos = computeWithPositions(current);

    setFields(withPos);
    await persistPositions(withPos);
  }

  function openEditModal(field: PersonaSectionField) {
    const textValue =
      typeof field.data?.text === "string" ? field.data.text : "";

    setEditingField(field);
    setEditingValue(textValue);
  }

  function closeEditModal() {
    setEditingField(null);
    setEditingValue("");
  }

  async function saveEditModal() {
    if (!editingField) return;

    const newData = {
      ...(editingField.data || {}),
      text: editingValue,
    };

    const { error } = await supabase
      .from("persona_section_fields")
      .update({ data: newData })
      .eq("id", editingField.id);

    if (error) {
      console.error("saveEditModal error", error);
      setErrorMessage(
        error.message ?? "Erreur lors de la sauvegarde du champ.",
      );
      return;
    }

    setFields((prev) =>
      prev.map((f) => (f.id === editingField.id ? { ...f, data: newData } : f)),
    );

    closeEditModal();
  }

  async function handleMoveField(fieldId: string, direction: "up" | "down") {
    const index = fields.findIndex((f) => f.id === fieldId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;

    const newFields = [...fields];
    const temp = newFields[index];
    newFields[index] = newFields[targetIndex];
    newFields[targetIndex] = temp;

    const withPos = computeWithPositions(newFields);

    setFields(withPos);
    setErrorMessage(null);

    await persistPositions(withPos);
  }

  function AddFieldMenu({
    insertAt,
    variant = "outline",
    size = "sm",
    label = "+ Ajouter un champ",
  }: {
    insertAt: number;
    variant?: "outline" | "ghost" | "default";
    size?: "sm" | "xs";
    label?: string;
  }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="cursor-pointer transition-opacity opacity-0 hover:opacity-100 relative h-2.5 w-full flex justify-center before:absolute before:h-px before:w-full before:top-1/2 before:-translate-y-1/2 before:bg-border">
            <button className="w-4 h-4 bg-border rounded-full inline-flex items-center justify-center absolute top-1/2 -translate-y-1/2 z-10">
              <Plus size={12} />
            </button>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleAddField("title", insertAt)}>
            Titre
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAddField("text", insertAt)}>
            Texte
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header : bouton pour ajouter un champ (en haut, à la fin) */}

      {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}

      {fields.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Aucun champ pour cette section. Utilise “Ajouter un champ” pour
            commencer.
          </p>
          <AddFieldMenu insertAt={0} />
        </div>
      ) : (
        <div>
          {fields.map((field, index) => {
            const textValue =
              typeof field.data?.text === "string" ? field.data.text : "";

            return (
              <div key={field.id} className="space-y-2">
                {/* bouton "Ajouter ici" entre les champs */}
                {index === 0 ? null : (
                  <div className="flex justify-start">
                    <AddFieldMenu
                      insertAt={index}
                      variant="ghost"
                      size="xs"
                      label="+ Ajouter un champ ici"
                    />
                  </div>
                )}

                <div className="group relative p-.5">
                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => handleMoveField(field.id, "up")}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => handleMoveField(field.id, "down")}
                      disabled={index === fields.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => openEditModal(field)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>

                  {field.type === "title" && (
                    <h3 className="text-lg font-semibold">
                      {textValue || "Titre vide"}
                    </h3>
                  )}

                  {field.type === "text" && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {textValue || "Texte vide"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="pt-1 flex justify-start">
            <AddFieldMenu
              insertAt={fields.length}
              variant="ghost"
              size="xs"
              label="+ Ajouter un champ à la fin"
            />
          </div>
        </div>
      )}

      <Dialog
        open={!!editingField}
        onOpenChange={(open) => !open && closeEditModal()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingField?.type === "title"
                ? "Modifier le titre"
                : "Modifier le texte"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {editingField?.type === "title" && (
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                placeholder="Titre"
              />
            )}

            {editingField?.type === "text" && (
              <Textarea
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                placeholder="Texte, description, histoire, psychologie…"
                className="min-h-[160px]"
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={closeEditModal}>
              Annuler
            </Button>
            <Button type="button" onClick={saveEditModal}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
