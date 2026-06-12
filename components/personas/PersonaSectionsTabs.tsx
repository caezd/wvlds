// components/personas/PersonaSectionsTabs.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { PersonaSectionWithFields } from "@/types/personas";
import { SectionFieldsEditor } from "./SectionFieldsEditor";

type PersonaSectionsTabsProps = {
  personaId: string;
  initialSections: PersonaSectionWithFields[];
};

export function PersonaSectionsTabs({
  personaId,
  initialSections,
}: PersonaSectionsTabsProps) {
  const supabase = createClient();

  const [sections, setSections] =
    useState<PersonaSectionWithFields[]>(initialSections);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    initialSections[0]?.id ?? null,
  );

  async function handleAddSection() {
    const name = window.prompt(
      "Nom de la nouvelle section (ex: Informations) ?",
    );
    if (!name) return;

    const lastPosition = sections.length
      ? sections[sections.length - 1].position
      : 0;

    const { data, error } = await supabase
      .from("persona_sections")
      .insert({
        persona_id: personaId,
        name,
        position: lastPosition + 10,
      })
      .select("id, persona_id, name, position")
      .single();

    if (error) {
      console.error("handleAddSection error", error);
      return;
    }

    const newSection: PersonaSectionWithFields = {
      ...(data as any),
      fields: [],
    };

    setSections((prev) => [...prev, newSection]);
    setActiveSectionId(newSection.id);
  }

  if (!sections.length) {
    return (
      <div className="border rounded-md p-4 mx-4 mb-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Aucune section pour ce personnage.
        </p>
        <Button variant="outline" size="sm" onClick={handleAddSection}>
          + Créer une première section
        </Button>
      </div>
    );
  }

  const value = activeSectionId ?? sections[0].id;

  return (
    <Tabs
      value={value}
      onValueChange={(val) => setActiveSectionId(val)}
      className="space-y-4"
    >
      <div className="flex items-center justify-between border-y">
        <TabsList className="rounded-none bg-transparent">
          {sections.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="px-3 rounded-xs"
            >
              {section.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddSection}
        >
          + Ajouter une section
        </Button>
      </div>

      {sections.map((section) => (
        <TabsContent
          key={section.id}
          value={section.id}
          forceMount
          className="p-4 space-y-3 data-[state=inactive]:hidden"
        >
          <SectionFieldsEditor
            sectionId={section.id}
            initialFields={section.fields ?? []}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
