"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { setWorldPersonaTemplate } from "@/app/actions/worldCatalog";
import type {
  PersonaSection,
  PersonaSectionField,
  PersonaSectionWithFields,
} from "@/types/personas";

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
      const { data } = await supabase
        .from("personas")
        .select("id")
        .eq("world_id", worldId)
        .eq("is_template", true)
        .maybeSingle();
      if (!cancelled) {
        setTemplateId((data?.id as string | undefined) ?? null);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId]);

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

    const [{ data: auth }, { data: sectionRows }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("persona_sections")
        .select("id, persona_id, name, position")
        .eq("persona_id", templateId)
        .order("position", { ascending: true }),
    ]);
    setUserId(auth.user?.id ?? null);

    const sectionsList = (sectionRows ?? []) as PersonaSection[];
    const sectionIds = sectionsList.map((s) => s.id);
    let fieldsList: PersonaSectionField[] = [];
    if (sectionIds.length > 0) {
      const { data: fields } = await supabase
        .from("persona_section_fields")
        .select("id, section_id, type, position, data, locked")
        .in("section_id", sectionIds)
        .order("position", { ascending: true });
      fieldsList = (fields ?? []) as PersonaSectionField[];
    }
    setSections(
      sectionsList.map((s) => ({
        ...s,
        fields: fieldsList.filter((f) => f.section_id === s.id),
      })),
    );
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
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Fiche par défaut des personas</SheetTitle>
          </SheetHeader>
          <div className="p-6 pt-2">
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
