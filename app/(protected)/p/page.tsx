// app/(protected)/personas/page.tsx
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/currentRequest";
import { getTranslations } from "next-intl/server";
import { PersonaCreateSheet } from "@/components/personas/PersonaCreateSheet";
import {
  PersonasView,
  type PersonaWorldGroup,
} from "@/components/personas/PersonasView";
import { fetchSectionsByPersona } from "@/lib/personaSections";
import { FREE_PERSONAS_PER_WORLD } from "@/lib/userQuota";
import type { MaritalStatus } from "@/types/db";

type PersonaRow = {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  avatar_config?: unknown;
  avatar_frame_id?: string | null;
  frame?: { asset_url?: string | null } | null;
  banner_url?: string | null;
  world_id?: string | null;
  faceclaim?: string | null;
  marital_status?: string | null;
  spouse_persona_id?: string | null;
};

type MemberWorld = {
  id: string;
  name: string | null;
  restrict_inventory?: boolean | null;
  restrict_skills?: boolean | null;
  enable_faceclaims?: boolean | null;
};

export default async function PersonasPage() {
  const [t, supabase] = await Promise.all([getTranslations("personas"), createClient()]);
  const userId = await getUserId(supabase);

  // 1) Personas, mondes accessibles et plan : tous ne dépendent que de `userId`.
  //    Les mondes et le plan attendaient jusqu'ici la liste des personas, alors
  //    qu'ils n'en ont aucun besoin — une vague réseau de perdue.
  const [personaList, memberWorlds, plan] = await Promise.all([
    (async (): Promise<PersonaRow[]> => {
      const { data, error } = await supabase
        .from("personas")
        .select(
          "id, name, avatar_url, avatar_config, banner_url, avatar_frame_id, world_id, faceclaim, marital_status, spouse_persona_id, frame:avatar_frame_id(asset_url)",
        )
        .eq("user_id", userId)
        .eq("is_template", false)
        .order("name", { ascending: true });

      if (!error) return (data ?? []) as PersonaRow[];

      const { data: basic } = await supabase
        .from("personas")
        .select("id, name, world_id")
        .eq("user_id", userId)
        .eq("is_template", false)
        .order("name", { ascending: true });
      return (basic ?? []) as PersonaRow[];
    })(),
    // Tous les mondes accessibles (même sans persona) : chacun devient une
    // section de la page, donc une cible de dépôt pour le drag & drop. Les
    // flags de restriction accompagnent chaque groupe pour que l'éditeur
    // ouvert depuis /p applique les mêmes règles que depuis la page du monde.
    (async (): Promise<MemberWorld[]> => {
      const { data } = await supabase
        .from("worlds")
        .select("id, name, restrict_inventory, restrict_skills, enable_faceclaims, world_members!inner(user_id)")
        .eq("world_members.user_id", userId)
        .is("deleted_at", null)
        .eq("is_archived", false)
        .order("name");
      return (data ?? []) as MemberWorld[];
    })(),
    // La limite de 5 personas par monde ne concerne que le plan gratuit
    // (has_persona_capacity côté DB) — inutile d'afficher « x / 5 » sinon.
    // `plan` fait déjà partie du profil mémoïsé de la requête (lib/currentRequest) —
    // aucune requête `profiles` supplémentaire nécessaire.
    getCurrentProfile().then((profile) => profile?.plan ?? "free"),
  ]);

  const personaIds = personaList.map((p) => p.id);

  // 2) Noms des mondes impliqués
  const worldIds = [
    ...new Set(
      personaList.map((p) => p.world_id).filter((w): w is string => !!w),
    ),
  ];

  // Seconde vague : tout ce qui dérive de la première (sections des personas,
  // noms des mondes cités, mondes dotés d'une fiche par défaut). `templates`
  // s'exécutait auparavant seul, APRÈS ce groupe — il n'attendait pourtant que
  // `memberWorlds`, désormais résolu.
  const [sectionsByPersona, worldNames, worldsWithTemplate] = await Promise.all([
    fetchSectionsByPersona(supabase, personaIds),
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
    (async (): Promise<Set<string>> => {
      const out = new Set<string>();
      if (memberWorlds.length === 0) return out;
      const { data: templates } = await supabase
        .from("personas")
        .select("world_id")
        .in("world_id", memberWorlds.map((w) => w.id))
        .eq("is_template", true);
      for (const row of templates ?? []) {
        if (row.world_id) out.add(row.world_id);
      }
      return out;
    })(),
  ]);

  // 3) Groupement — les mondes accessibles d'abord (sections toujours
  // présentes, même vides, pour servir de cibles de dépôt)
  const groupMap = new Map<string | null, PersonaWorldGroup>();

  for (const w of memberWorlds) {
    groupMap.set(w.id, {
      worldId: w.id,
      worldName: w.name ?? "Monde inconnu",
      restrictInventory: !!w.restrict_inventory,
      restrictSkills: !!w.restrict_skills,
      faceclaimsEnabled: w.enable_faceclaims !== false,
      hasDefaultTemplate: worldsWithTemplate.has(w.id),
      personas: [],
    });
  }

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
      id: p.id,
      name: p.name,
      avatar_url: p.avatar_url ?? null,
      avatar_config: p.avatar_config ?? null,
      avatar_frame_id: p.avatar_frame_id ?? null,
      frame_asset_url:
        (p.frame as { asset_url?: string | null } | null)?.asset_url ?? null,
      banner_url: p.banner_url ?? null,
      world_id: key,
      faceclaim: p.faceclaim ?? null,
      marital_status: (p.marital_status as MaritalStatus | null) ?? null,
      spouse_persona_id: p.spouse_persona_id ?? null,
      sections: sectionsByPersona.get(p.id) ?? [],
    });
  }

  // Mondes en premier, "Sans monde" à la fin
  const groups: PersonaWorldGroup[] = [
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

      {groups.length === 0 ? (
        // Ni persona ni monde rejoint : rien à afficher ni à cibler. Avec au
        // moins un monde (même sans persona), la vue s'affiche pour exposer
        // les zones de dépôt — cas du nouveau membre invité.
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3 rounded-2xl border border-dashed border-border">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <PersonasView
          groups={groups}
          personaLimit={plan === "free" ? FREE_PERSONAS_PER_WORLD : null}
        />
      )}
    </div>
  );
}
