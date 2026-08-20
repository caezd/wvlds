"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonaEditorContent } from "./PersonaEditSheet";
import { createPersona } from "@/app/(protected)/p/actions";
import { createClient } from "@/lib/supabase/client";
import { fetchPersonaSections } from "@/lib/personaSections";
import type { PersonaSectionWithFields } from "@/types/personas";

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
      setSections(await fetchPersonaSections(createClient(), result.id!));
    }
    setCreatedId(result.id!);
    setCreatedName(name);
    setPhase("edit");
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

      <Drawer open={open} onOpenChange={handleOpen} swipeDirection="right">
        <DrawerContent className="inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg p-0 w-[min(calc(100%_-_var(--drawer-inset)*2),_460px)]">
          <DrawerClose
            aria-label="Fermer"
            className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="size-4" />
          </DrawerClose>
          <DrawerHeader className="sr-only">
            <DrawerTitle>
              {phase === "name" ? "Nouveau persona" : `Éditer — ${createdName}`}
            </DrawerTitle>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
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
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
