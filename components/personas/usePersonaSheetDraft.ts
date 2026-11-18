"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_DRAFT, applyPatch, isDirty, noteOrphan, noteUpload, storagePathOf, type PersonaPatch } from "@/lib/personaDraft";
import { diffSections, hasOps, savePersonaSheet } from "@/lib/personaSectionsDiff";
import { fetchPersonaSections } from "@/lib/personaSections";
import { notifyPersonasChanged } from "@/hooks/usePersonasChanged";
import type { PersonaSectionWithFields } from "@/types/personas";

type Fichiers = { uploaded?: string | null; orphan?: string | null };

/**
 * Brouillon d'une fiche de persona, partagé par l'édition et la création.
 *
 * Rien ne part en base avant « Enregistrer » : les modifications de la fiche
 * s'empilent dans `draft` (avec les fichiers qu'elles envoient ou rendent
 * inutiles), celles des onglets et champs dans `sections` — l'écart avec
 * l'arbre chargé dira quoi écrire. `save` écrit le tout en UNE requête,
 * tout ou rien (migration 223).
 */
export function usePersonaSheetDraft({
  personaId,
  initialSections,
  initialValues,
}: {
  /** Nul tant que la fiche n'existe pas (création, avant le nom). */
  personaId: string | null;
  initialSections: PersonaSectionWithFields[];
  /** Valeurs chargées : un retour à l'identique retire la clé du brouillon. */
  initialValues: PersonaPatch;
}) {
  const tPersonas = useTranslations("personas");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [sections, setSections] = useState(initialSections);
  // L'arbre tel qu'il a été chargé : l'écart avec `sections` dira quoi écrire.
  const [savedSections, setSavedSections] = useState(initialSections);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const sectionOps = useMemo(() => diffSections(savedSections, sections), [savedSections, sections]);
  const dirty = isDirty(draft) || hasOps(sectionOps);

  function patchDraft(patch: PersonaPatch, files?: Fichiers) {
    setDraft((prev) => {
      let next = applyPatch(prev, patch, initialValues);
      if (files?.uploaded) next = noteUpload(next, files.uploaded);
      // Un fichier de la fiche, remplacé ou retiré : effacé une fois la
      // nouvelle version enregistrée, pas avant.
      if (files?.orphan && !next.uploaded.includes(storagePathOf(files.orphan) ?? "")) {
        next = noteOrphan(next, files.orphan);
      }
      return next;
    });
  }

  /** Repart d'un arbre chargé (création : la fiche par défaut du monde). */
  function reset(next: PersonaSectionWithFields[]) {
    setSections(next);
    setSavedSections(next);
    setDraft(EMPTY_DRAFT);
  }

  /** Écrit la fiche en une requête, puis efface les fichiers qu'elle ne porte plus. */
  async function save(): Promise<boolean> {
    if (!personaId || !dirty || saving) return true;
    setSaving(true);
    const avecOnglets = hasOps(sectionOps);
    const { error } = await savePersonaSheet(supabase, personaId, isDirty(draft) ? draft.patch : {}, sectionOps);
    if (error) {
      setSaving(false);
      toast.error(tPersonas("saveFailed"), { description: error });
      return false;
    }
    if (avecOnglets) {
      // Les identifiants provisoires n'ont plus cours : on repart de la base.
      const frais = await fetchPersonaSections(supabase, personaId);
      setSections(frais);
      setSavedSections(frais);
    }
    if (draft.orphans.length > 0) await supabase.storage.from("personas").remove(draft.orphans);
    setDraft(EMPTY_DRAFT);
    setSaving(false);
    toast.success(tPersonas("saved"));
    notifyPersonasChanged();
    router.refresh();
    return true;
  }

  /** Abandonne : les fichiers envoyés pour rien ne restent pas au stockage. */
  async function discard() {
    if (draft.uploaded.length > 0) await supabase.storage.from("personas").remove(draft.uploaded);
    setDraft(EMPTY_DRAFT);
    setSections(savedSections);
  }

  return { sections, setSections, patchDraft, dirty, saving, save, discard, reset };
}
