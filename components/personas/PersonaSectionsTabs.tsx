// components/personas/PersonaSectionsTabs.tsx
"use client";

import React, { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Layers, Lock, MoreHorizontal, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { afterMenuClose } from "@/components/ui/after-menu-close";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { PersonaSectionWithFields } from "@/types/personas";
import { SectionFieldsEditor } from "./SectionFieldsEditor";

/** Noms proposés pour un premier onglet — traduits, et modifiables ensuite.
 *  Le but n'est pas d'imposer une structure mais d'éviter la page blanche. */
const TAB_SUGGESTIONS = ["identity", "appearance", "story"] as const;

type PersonaSectionsTabsProps = {
  personaId: string;
  userId: string | null;
  sections: PersonaSectionWithFields[];
  onSectionsChange: (sections: PersonaSectionWithFields[]) => void;
  worldId?: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  /** Édition de la fiche modèle d'un monde : permet de verrouiller des champs. */
  isTemplate?: boolean;
};

export function PersonaSectionsTabs({
  personaId,
  userId,
  sections,
  onSectionsChange,
  worldId,
  restrictInventory,
  restrictSkills,
  isTemplate,
}: PersonaSectionsTabsProps) {
  const supabase = createClient();
  const t = useTranslations("personas.tabs");
  const tCommon = useTranslations("common");

  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    sections[0]?.id ?? null,
  );

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  function handleFieldsChange(
    sectionId: string,
    fields: PersonaSectionWithFields["fields"],
  ) {
    onSectionsChange(
      sections.map((s) => (s.id === sectionId ? { ...s, fields } : s)),
    );
  }

  /** Création d'un onglet, extraite du formulaire : l'état vide s'en sert
   *  aussi pour créer en un clic depuis une suggestion. */
  async function createSection(nom: string) {
    const trimmed = nom.trim();
    if (!trimmed) return;
    setSaving(true);
    const lastPosition = sections.length ? sections[sections.length - 1].position : 0;
    const { data, error } = await supabase
      .from("persona_sections")
      .insert({ persona_id: personaId, name: trimmed, position: lastPosition + 10 })
      .select("id, persona_id, name, position")
      .single();
    setSaving(false);
    // Un échec ne laissait jusqu'ici qu'une trace en console : rien à l'écran,
    // alors que renommer et supprimer signalent tous deux leur erreur.
    if (error) { toast.error(error.message); return; }
    const newSection: PersonaSectionWithFields = { ...(data as PersonaSectionWithFields), fields: [] };
    onSectionsChange([...sections, newSection]);
    setActiveSectionId(newSection.id);
    setName("");
    setAddDialogOpen(false);
  }

  async function handleAddSection(e: React.FormEvent) {
    e.preventDefault();
    await createSection(name);
  }

  async function handleRenameSection(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !activeSectionId) return;
    setSaving(true);
    const { error } = await supabase
      .from("persona_sections")
      .update({ name: trimmed })
      .eq("id", activeSectionId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSectionsChange(sections.map((s) => s.id === activeSectionId ? { ...s, name: trimmed } : s));
    setRenameDialogOpen(false);
  }

  async function handleMoveSection(direction: "left" | "right") {
    if (!activeSectionId) return;
    const idx = sections.findIndex((s) => s.id === activeSectionId);
    const target = direction === "left" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    const withPos = next.map((s, i) => ({ ...s, position: i * 10 }));
    onSectionsChange(withPos);
    // L'ordre était appliqué à l'écran sans que le résultat des écritures ne
    // soit lu : un refus le laissait affiché jusqu'au rechargement, où il
    // revenait en arrière sans explication.
    const results = await Promise.all(
      withPos.map((s) => supabase.from("persona_sections").update({ position: s.position }).eq("id", s.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      onSectionsChange(sections);
      toast.error(failed.error.message);
    }
  }

  async function handleDeleteSection() {
    if (!activeSectionId) return;
    const { error } = await supabase.from("persona_sections").delete().eq("id", activeSectionId);
    if (error) { toast.error(error.message); return; }
    const next = sections.filter((s) => s.id !== activeSectionId);
    onSectionsChange(next);
    setActiveSectionId(next[0]?.id ?? null);
  }

  const value = activeSectionId ?? sections[0]?.id;
  const activeIndex = sections.findIndex((s) => s.id === value);
  // Une section contenant un champ verrouillé (requis par la fiche du monde)
  // ne peut pas être supprimée — hors édition de la fiche modèle elle-même.
  const activeHasLockedFields =
    !isTemplate &&
    (sections.find((s) => s.id === value)?.fields ?? []).some((f) => f.locked);

  return (
    <>
      {!sections.length ? (
        // Même forme que les autres états vides de l'application (bordure
        // douce, centré, généreusement espacé) — celui-ci était le seul à
        // s'aligner à gauche dans une boîte à bordure dure.
        <div className="mx-4 mb-4 rounded-lg border border-border-soft p-8 text-center">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">{t("empty")}</p>

          {/* Créer en un clic depuis une suggestion : devant une fiche vierge,
              devoir inventer un nom avant même d'avoir vu à quoi sert un onglet
              est une marche de plus. Le nom se change ensuite d'un « Renommer ». */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {TAB_SUGGESTIONS.map((clé) => (
              <Button
                key={clé}
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void createSection(t(`suggestions.${clé}`))}
              >
                + {t(`suggestions.${clé}`)}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => { setName(""); setAddDialogOpen(true); }}
            >
              {t("customName")}
            </Button>
          </div>
        </div>
      ) : (
        <Tabs
          value={value}
          onValueChange={(val) => setActiveSectionId(val)}
          className="space-y-4"
        >
          <TabBar action={
            <Button type="button" variant="ghost" size="sm" onClick={() => { setName(""); setAddDialogOpen(true); }}>
              + {t("add")}
            </Button>
          }>
            {sections.map((section) => (
              <div key={section.id} className="flex shrink-0 items-center gap-1">
                <TabBarTrigger value={section.id}>
                  {section.name}
                </TabBarTrigger>
                {value === section.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={t("options")}>
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem onClick={() => handleMoveSection("left")} disabled={activeIndex <= 0}>
                        <ChevronLeft className="mr-2 h-4 w-4" /> {t("moveLeft")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleMoveSection("right")} disabled={activeIndex >= sections.length - 1}>
                        <ChevronRight className="mr-2 h-4 w-4" /> {t("moveRight")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={afterMenuClose(() => { setName(sections.find((s) => s.id === value)?.name ?? ""); setRenameDialogOpen(true); })}>
                        <Pencil className="mr-2 h-4 w-4" /> {t("rename")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {activeHasLockedFields ? (
                        <DropdownMenuItem disabled title={t("lockedTitle")}>
                          <Lock className="mr-2 h-4 w-4" /> {t("lockedLabel")}
                        </DropdownMenuItem>
                      ) : (
                        <DeleteConfirmDialog
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" /> {tCommon("delete")}
                            </DropdownMenuItem>
                          }
                          description={t("deleteDescription")}
                          onConfirm={handleDeleteSection}
                        />
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </TabBar>

          {sections.map((section) => (
            <TabsContent
              key={section.id}
              value={section.id}
              forceMount
              className="px-6 space-y-3 data-[state=inactive]:hidden"
            >
              <SectionFieldsEditor
                key={section.id}
                sectionId={section.id}
                personaId={personaId}
                userId={userId}
                initialFields={section.fields ?? []}
                onFieldsChange={(fields) => handleFieldsChange(section.id, fields)}
                worldId={worldId}
                restrictInventory={restrictInventory}
                restrictSkills={restrictSkills}
                isTemplate={isTemplate}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Dialog : ajouter un onglet */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleAddSection} className="grid gap-4">
            <div className="grid gap-3">
              <DialogTitle asChild>
                <Label htmlFor="section-name">{t("nameLabel")}</Label>
              </DialogTitle>
              <Input
                id="section-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                autoFocus
                maxLength={60}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={!name.trim() || saving}>
                {saving ? t("creating") : tCommon("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog : renommer un onglet */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleRenameSection} className="grid gap-4">
            <div className="grid gap-3">
              <DialogTitle asChild>
                <Label htmlFor="rename-section">{t("renameTitle")}</Label>
              </DialogTitle>
              <Input
                id="rename-section"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("nameLabel")}
                autoFocus
                maxLength={60}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameDialogOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={!name.trim() || saving}>
                {saving ? t("renaming") : t("rename")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
