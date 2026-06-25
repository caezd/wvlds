// app/(protected)/w/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { notFound } from "next/navigation";

import { WorldHome } from "@/components/worlds/WorldHome";
import { WorldMembershipGuard } from "@/components/worlds/WorldMembershipGuard";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import type {
  PersonaSection,
  PersonaSectionField,
  PersonaSectionWithFields,
} from "@/types/personas";

export default async function WorldPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const supabase = await createClient();

  // La requête `world` (RLS) et l'id utilisateur (vérification locale du JWT)
  // sont indépendants → on les résout en parallèle.
  const [{ data: world }, userId] = await Promise.all([
    supabase
      .from("worlds")
      .select(
        "id, name, description, owner_id, banner_url, icon_url, color, visibility, restrict_inventory, restrict_skills, timeline_enabled, timeline_config, world_members(user_id, role)",
      )
      .eq("id", id)
      .maybeSingle(),
    getUserId(supabase),
  ]);

  if (!world) {
    notFound();
  }

  // Only members (or the owner) can access the world page.
  // Invitees can read the world record (via RLS policy) but cannot enter.
  const members = world.world_members ?? [];
  const myRole =
    members.find((m) => m.user_id === userId)?.role ??
    (world.owner_id === userId ? "owner" : null);

  if (!myRole) {
    notFound();
  }

  type NavRoom = {
    id: string;
    title: string | null;
    name: string | null;
    icon_url: string | null;
    last_message_at: string | null;
    unread_count: number;
    timeline_date?: { year: number; month: number | null; day?: number | null } | null;
  };

  const isShared = true; // guaranteed by the myRole guard above
  const canEditTabs = ["owner", "admin", "editor"].includes(myRole);
  const canPost = ["owner", "admin", "editor", "player"].includes(myRole);

  // Ces quatre chargements (nav, droits admin, préférences UI, personas) sont
  // indépendants les uns des autres → on les exécute en parallèle plutôt que
  // d'enchaîner quatre allers-retours réseau séquentiels.
  const [initialRooms, canAdmin, worldPrefs, initialPersonas] =
    await Promise.all([
      (async (): Promise<NavRoom[]> => {
        const { data: navRooms } = await supabase.rpc("list_chatrooms_nav", {
          p_world_id: id,
        });
        const rooms = (navRooms as NavRoom[] | null) ?? [];
        if (!world?.timeline_enabled || rooms.length === 0) return rooms;
        const roomIds = rooms.map((r) => r.id);
        const { data: timelineDates } = await supabase
          .from("chatrooms")
          .select("id, timeline_date")
          .in("id", roomIds);
        if (!timelineDates) return rooms;
        const dateMap = new Map(timelineDates.map((r) => [r.id, r.timeline_date as NavRoom["timeline_date"]]));
        return rooms.map((r) => ({ ...r, timeline_date: dateMap.get(r.id) ?? null }));
      })(),
      (async (): Promise<boolean> => {
        const { data } = await supabase.rpc("is_world_admin", {
          wid: world.id,
          uid: userId ?? null,
        });
        return !!data;
      })(),
      (async (): Promise<{
        aside_width: number;
        main_expanded: boolean;
        is_favorite: boolean;
        wiki_sidebar_width: number;
      } | null> => {
        if (!userId) return null;
        const { data } = await supabase
          .from("world_user_preferences")
          .select(
            "aside_width, main_expanded, is_favorite, wiki_sidebar_width",
          )
          .eq("world_id", id)
          .eq("user_id", userId)
          .maybeSingle();
        return data as {
          aside_width: number;
          main_expanded: boolean;
          is_favorite: boolean;
          wiki_sidebar_width: number;
        } | null;
      })(),
      (async (): Promise<AsidePersona[]> => {
        if (!userId) return [];
        const { data: personaRows } = await supabase
          .from("personas")
          .select(
            "id, name, avatar_url, avatar_config, banner_url, avatar_frame_id, frame:avatar_frame_id(asset_url)",
          )
          .eq("user_id", userId)
          .eq("world_id", id)
          .order("name", { ascending: true });

        const rows = (personaRows ?? []) as Omit<AsidePersona, "sections">[];
        if (rows.length === 0) return [];

        const personaIds = rows.map((p) => p.id);

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

        const sectionsByPersona = new Map<
          string,
          PersonaSectionWithFields[]
        >();
        for (const pid of personaIds) sectionsByPersona.set(pid, []);
        for (const s of sectionsList) {
          const entry: PersonaSectionWithFields = {
            ...s,
            fields: fieldsBySection.get(s.id) ?? [],
          };
          sectionsByPersona.get(s.persona_id)?.push(entry);
        }

        return rows.map((p) => ({
          ...p,
          sections: sectionsByPersona.get(p.id) ?? [],
        }));
      })(),
    ]);

  return (
    <main className="composer-parent flex h-full flex-col focus-visible:outline-0">
      <WorldMembershipGuard
        worldId={world.id}
        selfId={userId ?? null}
      />
      <div className="flex min-h-0 w-full flex-1 flex-row gap-3">
        <WorldHome
          world={world}
          worldId={id}
          userId={userId ?? null}
          canAdmin={!!canAdmin}
          isShared={isShared}
          canEditTabs={canEditTabs}
          canPost={canPost}
          initialRooms={initialRooms}
          initialPersonas={initialPersonas}
          initialPrefs={worldPrefs}
        />
      </div>
    </main>
  );
}
