import type { SupabaseClient } from "@supabase/supabase-js";
import { RPC } from "@/lib/constants";

export type WorldMemberPersona = {
    id: string;
    name: string;
    avatar_url: string | null;
};

type Row = {
    user_id: string | null;
    persona_id: string | null;
    name: string | null;
    avatar_url: string | null;
};

/**
 * Personas jouées par chaque membre d'un monde, indexées par `user_id`.
 *
 * `WorldMembersPanel` et `WorldMembersSheet` dérivaient cette information en
 * ramenant jusqu'à 2000 lignes de `chat_messages` (avec la persona jointe) puis
 * en dédupliquant en JavaScript — plusieurs centaines de Ko sur un monde actif,
 * pour quelques dizaines de couples utiles. Et le `.limit(2000)` tronquait
 * silencieusement, sans `ORDER BY` : au-delà, des personas disparaissaient de
 * la liste de façon arbitraire.
 *
 * Le `DISTINCT ON` vit maintenant dans Postgres (RPC `get_world_member_personas`,
 * migration 118) et seul le résultat transite. La fonction est SECURITY INVOKER :
 * la RLS s'applique au rôle appelant, comme pour la requête qu'elle remplace.
 */
export async function fetchPersonasByMember(
    supabase: SupabaseClient,
    worldId: string,
): Promise<Map<string, WorldMemberPersona[]>> {
    const byUser = new Map<string, WorldMemberPersona[]>();

    const { data, error } = await supabase.rpc(RPC.GET_WORLD_MEMBER_PERSONAS, {
        p_world_id: worldId,
    });
    if (error || !data) return byUser;

    for (const row of data as Row[]) {
        if (!row.user_id || !row.persona_id) continue;
        const list = byUser.get(row.user_id);
        const persona: WorldMemberPersona = {
            id: row.persona_id,
            name: row.name ?? "",
            avatar_url: row.avatar_url ?? null,
        };
        if (list) list.push(persona);
        else byUser.set(row.user_id, [persona]);
    }
    return byUser;
}
