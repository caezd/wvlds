"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PersonaSectionsTabs } from "@/components/personas/PersonaSectionsTabs";
import {
  getWorldPersonaTemplate,
  setWorldPersonaTemplate,
} from "@/app/actions/worldCatalog";
import { fetchPersonaSections } from "@/lib/personaSections";
import type { PersonaSectionWithFields } from "@/types/personas";

/**
 * Réglage « Fiche de persona par défaut » d'un monde.
 * La fiche est un persona modèle (personas.is_template) : l'activer crée le
 * modèle, l'éditer ouvre l'éditeur de sections standard, la désactiver le
 * supprime. La structure du modèle est copiée sur chaque persona créé dans
 * le monde (voir createPersona).
 */
export function WorldPersonaTemplateSection({
  worldId,
  restrictInventory,
  restrictSkills,
}: {
  worldId: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [confirmDisable, setConfirmDisable] = React.useState(false);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [sections, setSections] = React.useState<PersonaSectionWithFields[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getWorldPersonaTemplate(worldId);
      if (!cancelled) {
        setTemplateId(res.ok ? res.templateId : null);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  async function handleToggle(enabled: boolean) {
    if (!enabled) {
      setConfirmDisable(true);
      return;
    }
    setToggling(true);
    const res = await setWorldPersonaTemplate(worldId, true);
    setToggling(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTemplateId(res.templateId ?? null);
  }

  async function confirmDisableTemplate() {
    setConfirmDisable(false);
    setToggling(true);
    const res = await setWorldPersonaTemplate(worldId, false);
    setToggling(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTemplateId(null);
    setSections(null);
  }

  async function openEditor() {
    if (!templateId) return;
    setEditorOpen(true);
    if (sections !== null) return; // déjà chargées

    const [{ data: auth }, loadedSections] = await Promise.all([
      supabase.auth.getUser(),
      fetchPersonaSections(supabase, templateId),
    ]);
    setUserId(auth.user?.id ?? null);
    setSections(loadedSections);
  }

  return (
    <div className="space-y-5 pt-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Personas
      </p>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Fiche par défaut</p>
            <p className="text-xs text-muted-foreground leading-snug">
              Chaque persona créé dans ce monde démarre avec une copie de
              cette fiche (sections et champs).
            </p>
          </div>
          <Switch
            checked={!!templateId}
            disabled={!loaded || toggling}
            onCheckedChange={(v) => void handleToggle(v)}
            className="shrink-0 mt-0.5"
          />
        </div>

        {templateId && (
          <div className="ml-4 flex items-center justify-between gap-4 rounded-xl border border-border-soft bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground leading-snug">
              Définis les sections et champs que tous les nouveaux personas
              auront au départ.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => void openEditor()}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Éditer la fiche
            </Button>
          </div>
        )}
      </div>

      {/* Confirmation de désactivation */}
      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver la fiche par défaut ?</AlertDialogTitle>
            <AlertDialogDescription>
              La fiche modèle et tout son contenu seront supprimés
              définitivement. Les personas déjà créés ne sont pas modifiés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDisableTemplate()}>
              Désactiver et supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Éditeur de la fiche modèle */}
      <Drawer open={editorOpen} onOpenChange={setEditorOpen} swipeDirection="right">
        <DrawerContent className="inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg p-0 w-[min(calc(100%_-_var(--drawer-inset)*2),_768px)]">
          <DrawerClose
            aria-label="Fermer"
            className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="size-4" />
          </DrawerClose>
          <DrawerHeader>
            <DrawerTitle>Fiche par défaut des personas</DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-2">
            {templateId && sections !== null ? (
              <PersonaSectionsTabs
                personaId={templateId}
                userId={userId}
                sections={sections}
                onSectionsChange={setSections}
                worldId={worldId}
                restrictInventory={restrictInventory}
                restrictSkills={restrictSkills}
                isTemplate
              />
            ) : (
              <div className="grid place-items-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
