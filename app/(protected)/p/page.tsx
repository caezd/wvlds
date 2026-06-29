// app/(protected)/personas/page.tsx
import { Users } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { PersonaCard } from "@/components/personas/PersonaCard";
import { PersonaCreateSheet } from "@/components/personas/PersonaCreateSheet";
import type {
  PersonaSection,
  PersonaSectionField,
  PersonaSectionWithFields,
} from "@/types/personas";
import type { AvatarConfigV1 } from "@/components/personas/avatar/PersonaAvatarPicker";

type PersonaRow = {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  avatar_config?: unknown;
  avatar_frame_id?: string | null;
  frame?: { asset_url?: string | null } | null;
  banner_url?: string | null;
  world_id?: string | null;
};

type WorldGroup = {
  worldId: string | null;
  worldName: string | null;
  personas: (PersonaRow & { sections: PersonaSectionWithFields[] })[];
};

export default async function PersonasPage() {
  const t = await getTranslations("personas");
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // 1) Personas avec world_id
  let personaList: PersonaRow[] = [];
  {
    const { data, error } = await supabase
      .from("personas")
      .select(
        "id, name, avatar_url, avatar_config, banner_url, avatar_frame_id, world_id, frame:avatar_frame_id(asset_url)",
      )
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (!error) {
      personaList = (data ?? []) as PersonaRow[];
    } else {
      const { data: basic } = await supabase
        .from("personas")
        .select("id, name, world_id")
        .eq("user_id", userId)
        .order("name", { ascending: true });
      personaList = (basic ?? []) as PersonaRow[];
    }
  }

  const personaIds = personaList.map((p) => p.id);

  // 2) Noms des mondes impliqués
  const worldIds = [
    ...new Set(
      personaList.map((p) => p.world_id).filter((w): w is string => !!w),
    ),
  ];

  // Les sections/champs (dérivés de personaIds) et les noms de mondes (dérivés
  // de worldIds) sont indépendants → on les charge en parallèle au lieu de les
  // enchaîner séquentiellement.
  const [sectionsByPersona, worldNames] = await Promise.all([
    (async (): Promise<Map<string, PersonaSectionWithFields[]>> => {
      const sectionsByPersona = new Map<string, PersonaSectionWithFields[]>();
      if (personaIds.length === 0) return sectionsByPersona;

      const { data: sections } = await supabase
        .from("persona_sections")
        .select("id, persona_id, name, position")
        .in("persona_id", personaIds)
        .order("position", { ascending: true });

      const sectionsList = (sections ?? []) as PersonaSection[];
      const sectionIds = sectionsList.map((s) => s.id);
      let fieldsList: PersonaSectionField[] = [];

      if (sectionIds.length > 0) {
        const { data: fields } = await supabase
          .from("persona_section_fields")
          .select("id, section_id, type, position, data")
          .in("section_id", sectionIds)
          .order("position", { ascending: true });
        fieldsList = (fields ?? []) as PersonaSectionField[];
      }

      const fieldsBySection = new Map<string, PersonaSectionField[]>();
      for (const f of fieldsList) {
        const arr = fieldsBySection.get(f.section_id);
        if (arr) arr.push(f);
        else fieldsBySection.set(f.section_id, [f]);
      }

      for (const pid of personaIds) sectionsByPersona.set(pid, []);
      for (const s of sectionsList) {
        const entry: PersonaSectionWithFields = {
          ...s,
          fields: fieldsBySection.get(s.id) ?? [],
        };
        sectionsByPersona.get(s.persona_id)?.push(entry);
      }
      return sectionsByPersona;
    })(),
    (async (): Promise<Map<string, string>> => {
      const worldNames = new Map<string, string>();
      if (worldIds.length === 0) return worldNames;

      const { data: worlds } = await supabase
        .from("worlds")
        .select("id, name")
        .in("id", worldIds);
      for (const w of worlds ?? [])
        worldNames.set(w.id, w.name ?? "Monde inconnu");
      return worldNames;
    })(),
  ]);

  // 3) Groupement
  const groupMap = new Map<string | null, WorldGroup>();

  for (const p of personaList) {
    const key = p.world_id ?? null;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        worldId: key,
        worldName: key ? (worldNames.get(key) ?? "Monde inconnu") : null,
        personas: [],
      });
    }
    groupMap.get(key)!.personas.push({
      ...p,
      sections: sectionsByPersona.get(p.id) ?? [],
    });
  }

  // Mondes en premier, "Sans monde" à la fin
  const groups: WorldGroup[] = [
    ...[...groupMap.entries()]
      .filter(([k]) => k !== null)
      .map(([, g]) => g)
      .sort((a, b) => (a.worldName ?? "").localeCompare(b.worldName ?? "")),
    ...(groupMap.has(null) ? [groupMap.get(null)!] : []),
  ];

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto w-full">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("count", { count: personaList.length })}
            {groups.length > 1 && ` · ${t("groups", { count: groups.length })}`}
          </p>
        </div>
        <PersonaCreateSheet />
      </header>

      {personaList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3 rounded-2xl border border-dashed border-border">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.worldId ?? "__none__"}>
              <div className="flex items-center gap-2 mb-4">
                {group.worldId ? (
                  <Link
                    href={`/w/${group.worldId}`}
                    className="text-base font-semibold hover:underline underline-offset-2"
                  >
                    {group.worldName}
                  </Link>
                ) : (
                  <h2 className="text-base font-semibold text-muted-foreground">
                    {t("noWorld")}
                  </h2>
                )}
                <span className="text-xs text-muted-foreground">
                  {group.personas.length} / 5
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {group.personas.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    personaId={persona.id}
                    personaName={persona.name ?? "Sans nom"}
                    avatarUrl={persona.avatar_url}
                    avatarConfig={persona.avatar_config as AvatarConfigV1 | null}
                    bannerUrl={persona.banner_url}
                    initialFrameId={persona.avatar_frame_id ?? null}
                    initialFrameUrl={
                      (persona.frame as { asset_url?: string | null } | null)
                        ?.asset_url ?? null
                    }
                    initialSections={persona.sections}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
