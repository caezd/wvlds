"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Drawer,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { PersonaEditorContent } from "./PersonaEditSheet";
import { createPersona } from "@/app/(protected)/p/actions";
import { createClient } from "@/lib/supabase/client";
import { fetchPersonaSections } from "@/lib/personaSections";
import type { PersonaSectionWithFields } from "@/types/personas";
import { useTranslations } from "next-intl";

export function PersonaCreateSheet({
  worldId,
  trigger,
  restrictInventory,
  restrictSkills,
  defaultNpc = false,
}: {
  worldId?: string | null;
  trigger?: ReactNode;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  /** Précoche « PNJ partagé » (bouton « Nouveau PNJ » de la section PNJ). */
  defaultNpc?: boolean;
}) {
  const t = useTranslations("personas");
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"name" | "edit">("name");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sections, setSections] = useState<PersonaSectionWithFields[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  // PNJ partagé (migration 182) : proposé à qui gère les PNJ du monde ;
  // `defaultNpc` précoche la case (bouton « Nouveau PNJ »).
  const tNpc = useTranslations("personas.npc");
  const { can } = useWorldMembership();
  const canManageNpc = can("npc.manage");
  const [asNpc, setAsNpc] = useState(!!defaultNpc);
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
      setAsNpc(!!defaultNpc);
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
    if (worldId && asNpc) fd.set("is_npc", "1");
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
        <Button onClick={() => setOpen(true)}>{t("newPersona")}</Button>
      )}

      <Drawer open={open} onOpenChange={handleOpen} swipeDirection="right">
        <SideSheetContent closeClassName="z-10">
          <DrawerHeader className="sr-only">
            <DrawerTitle>
              {phase === "name" ? t("newPersona") : `Éditer — ${createdName}`}
            </DrawerTitle>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
          {phase === "name" ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-6 p-6">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">{t("newPersona")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("newPersonaHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="persona-name">Nom</Label>
                <Input
                  id="persona-name"
                  ref={nameRef}
                  autoFocus
                  placeholder={t("namePlaceholderExample")}
                  maxLength={40}
                  required
                />
              </div>

              {worldId && canManageNpc && (
                <label className="flex items-start gap-3 rounded-lg border border-border-soft px-3 py-2.5 text-sm">
                  <Checkbox checked={asNpc} onCheckedChange={(v) => setAsNpc(v === true)} className="mt-0.5" aria-label={tNpc("createLabel")} />
                  <span className="space-y-0.5">
                    <span className="block font-medium">{tNpc("createLabel")}</span>
                    <span className="block text-xs text-muted-foreground">{tNpc("createHelp")}</span>
                  </span>
                </label>
              )}

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
        </SideSheetContent>
      </Drawer>
    </>
  );
}
