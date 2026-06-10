"use client";

import { useRef, useState } from "react";
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
import type { PersonaSectionWithFields } from "@/types/personas";

export function PersonaCreateSheet() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"name" | "edit">("name");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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
    const result = await createPersona(undefined, fd);
    setPending(false);
    if (!result.ok) { setError(result.error ?? "Erreur."); return; }
    setCreatedId(result.id!);
    setCreatedName(name);
    setPhase("edit");
  }

  const emptyInitialSections: PersonaSectionWithFields[] = [];

  return (
    <>
      <Button onClick={() => setOpen(true)}>Nouveau persona</Button>

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
              initialSections={emptyInitialSections}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
