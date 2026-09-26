"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Drawer,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
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
import { useTranslations } from "next-intl";
import { setWorldReviewActiveCache } from "@/hooks/useWorldReviewActive";
import { messageErreurAction } from "@/lib/actionErrors";

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
  reviewEnabled = false,
  onReviewEnabledChange,
}: {
  worldId: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  /** Validation des fiches (migration 184) : option complémentaire de la fiche par défaut. */
  reviewEnabled?: boolean;
  onReviewEnabledChange?: (enabled: boolean) => void;
}) {
  const t = useTranslations("worlds");
  const tSettings = useTranslations("worlds.settings");
  const [togglingReview, setTogglingReview] = React.useState(false);
  const tCommun = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [confirmDisable, setConfirmDisable] = React.useState(false);

  const [editorOpen, setEditorOpen] = React.useState(false);
  // L'id sert aux envois d'images de la fiche (préfixe `user-{id}/…`). Pris
  // dans le contexte plutôt que par `auth.getUser()` : cet appel passait par
  // le verrou de session de supabase-js (navigator.locks), qu'un autre onglet
  // peut retenir sous Firefox.
  const { userId } = useCurrentUser();
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
      toast.error(messageErreurAction(res.error, tCommun));
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
      toast.error(messageErreurAction(res.error, tCommun));
      return;
    }
    setTemplateId(null);
    setSections(null);
  }

  // L'option n'a d'effet qu'avec un modèle (`world_persona_review_active`) ;
  // la bascule reste donc sous la fiche par défaut, et la mémoire du client
  // (useWorldReviewActive) apprend la nouvelle valeur sans repasser par la base.
  async function handleReviewToggle(enabled: boolean) {
    setTogglingReview(true);
    const { error } = await supabase.from("worlds").update({ persona_review_enabled: enabled }).eq("id", worldId);
    setTogglingReview(false);
    if (error) { toast.error(error.message); return; }
    setWorldReviewActiveCache(worldId, enabled && !!templateId);
    onReviewEnabledChange?.(enabled);
  }

  async function openEditor() {
    if (!templateId) return;
    setEditorOpen(true);
    if (sections !== null) return; // déjà chargées

    setSections(await fetchPersonaSections(supabase, templateId));
  }

  return (
    <div className="space-y-5 pt-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("nav.personas")}
      </p>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t("defaultSheet")}</p>
            <p className="text-xs text-muted-foreground leading-snug">
              {tSettings("defaultSheetHelp")}
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
              {tSettings("editSheetHelp")}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => void openEditor()}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {tSettings("editSheet")}
            </Button>
          </div>
        )}

        {templateId && (
          <div className="ml-4 flex items-start justify-between gap-4 rounded-xl border border-border-soft bg-muted/20 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t("personaReview.label")}</p>
              <p className="text-xs text-muted-foreground leading-snug">{t("personaReview.help")}</p>
            </div>
            <Switch
              checked={reviewEnabled}
              disabled={togglingReview}
              onCheckedChange={(v) => void handleReviewToggle(v)}
              aria-label={t("personaReview.label")}
              className="shrink-0 mt-0.5"
            />
          </div>
        )}
      </div>

      {/* Confirmation de désactivation */}
      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disableDefaultSheetTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tSettings("disableDefaultSheetHelp")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommun("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDisableTemplate()}>
              {tSettings("disableAndDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Éditeur de la fiche modèle */}
      <Drawer open={editorOpen} onOpenChange={setEditorOpen} swipeDirection="right">
        <SideSheetContent>
          <DrawerHeader>
            <DrawerTitle>{t("defaultSheetPersonas")}</DrawerTitle>
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
        </SideSheetContent>
      </Drawer>
    </div>
  );
}
