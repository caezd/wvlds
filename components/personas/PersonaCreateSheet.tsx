"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonaEditorContent } from "./PersonaEditSheet";
import { createPersona } from "@/app/(protected)/p/actions";
import { createClient } from "@/lib/supabase/client";
import type {
  PersonaSection,
  PersonaSectionField,
  PersonaSectionWithFields,
} from "@/types/personas";

export function PersonaCreateSheet({
  worldId,
  trigger,
  restrictInventory,
  restrictSkills,
}: {
  worldId?: string | null;
  trigger?: ReactNode;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"name" | "edit">("name");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sections, setSections] = useState<PersonaSectionWithFields[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) {
      // reset à la fermeture
      setPhase("name");
      setCreatedId(null);
      setCreatedName("");
      setError(null);
      setSections([]);
      if (createdId) router.refresh();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = nameRef.current?.value.trim();
    if (!name) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    if (worldId) fd.set("world_id", worldId);
    const result = await createPersona(undefined, fd);
    setPending(false);
    if (!result.ok) { setError(result.error ?? "Erreur."); return; }
    // La fiche par défaut du monde a pu être copiée côté serveur : recharge
    // les sections du persona créé avant d'ouvrir l'éditeur.
    if (worldId) {
      setSections(await fetchSections(result.id!));
    }
    setCreatedId(result.id!);
    setCreatedName(name);
    setPhase("edit");
  }

  async function fetchSections(personaId: string): Promise<PersonaSectionWithFields[]> {
    const supabase = createClient();
    const { data: sectionRows } = await supabase
      .from("persona_sections")
      .select("id, persona_id, name, position")
      .eq("persona_id", personaId)
      .order("position", { ascending: true });
    const sectionsList = (sectionRows ?? []) as PersonaSection[];
    if (sectionsList.length === 0) return [];

    const { data: fields } = await supabase
      .from("persona_section_fields")
      .select("id, section_id, type, position, data, locked")
      .in("section_id", sectionsList.map((s) => s.id))
      .order("position", { ascending: true });
    const fieldsList = (fields ?? []) as PersonaSectionField[];
    return sectionsList.map((s) => ({
      ...s,
      fields: fieldsList.filter((f) => f.section_id === s.id),
    }));
  }

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} style={{ display: "contents" }}>
          {trigger}
        </span>
      ) : (
        <Button onClick={() => setOpen(true)}>Nouveau persona</Button>
      )}

      <Sheet open={open} onOpenChange={handleOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>
              {phase === "name" ? "Nouveau persona" : `Éditer — ${createdName}`}
            </SheetTitle>
          </SheetHeader>

          {phase === "name" ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-6 p-6">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Nouveau persona</h2>
                <p className="text-sm text-muted-foreground">
                  Donne un nom à ton personnage pour commencer. Tu pourras tout configurer ensuite.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="persona-name">Nom</Label>
                <Input
                  id="persona-name"
                  ref={nameRef}
                  autoFocus
                  placeholder="Ex. Kaori, Lyra, Théo…"
                  maxLength={40}
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Création…" : "Créer et configurer →"}
                </Button>
              </div>
            </form>
          ) : createdId ? (
            <PersonaEditorContent
              personaId={createdId}
              personaName={createdName}
              sections={sections}
              worldId={worldId ?? undefined}
              restrictInventory={restrictInventory}
              restrictSkills={restrictSkills}
              onSectionsChange={setSections}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
