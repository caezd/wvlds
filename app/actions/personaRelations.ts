"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { RPC } from "@/lib/constants";
import { idSchema, longTextSchema, parseInput } from "@/lib/inputSchemas";
import {
  ERR_INTROUVABLE,
  ERR_NON_AUTHENTIFIE,
  ERR_NON_AUTORISE,
  ERR_VALEUR_NON_SUPPORTEE,
  echecEnregistrement,
} from "@/lib/actionErrors";
import type { PersonaRelation, PersonaRelationStatus } from "@/types/relations";

// ── Relations entre personas ──────────────────────────────────────────────────
// Le canevas et la fiche écrivaient directement dans `persona_relations`
// depuis le client. Les actions passent ici, comme celles du catalogue : une
// entrée vérifiée avant d'être écrite, et une décision — la relation naît-elle
// acceptée ou en attente ? — prise à un seul endroit, la même pour tous les
// écrans. La RLS (migration 173) refuse de toute façon ce qui la contredirait.

const RELATION_COLUMNS = "id, world_id, from_persona_id, to_persona_id, type, label, description, status, created_by, created_at";

const relationDescriptionSchema = longTextSchema.nullable().transform((v) => v || null);

/**
 * Une relation naît acceptée, sauf si son type engage l'autre joueur.
 *
 * Un type réciproque vers le persona d'un AUTRE joueur attend son accord,
 * quel que soit le rôle de qui la crée — un admin n'accepte pas à la place
 * d'un joueur (migration 174). Vers un persona à soi, il n'y a personne à
 * consulter. Un type à sens unique est toujours immédiat.
 */
async function decideStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  worldId: string,
  typeId: string,
  toPersonaId: string,
): Promise<{ ok: true; status: PersonaRelationStatus } | { ok: false; error: string }> {
  const { data: type } = await supabase
    .from("world_relation_types")
    .select("mutual")
    .eq("id", typeId)
    .eq("world_id", worldId)
    .maybeSingle();
  if (!type) return { ok: false, error: ERR_VALEUR_NON_SUPPORTEE };
  if (!(type as { mutual: boolean }).mutual) return { ok: true, status: "accepted" };

  const { data: target } = await supabase
    .from("personas")
    .select("user_id")
    .eq("id", toPersonaId)
    .eq("world_id", worldId)
    .maybeSingle();
  if (!target) return { ok: false, error: ERR_VALEUR_NON_SUPPORTEE };
  return { ok: true, status: (target as { user_id: string }).user_id === userId ? "accepted" : "pending" };
}

export async function createPersonaRelation(input: {
  worldId: string;
  fromPersonaId: string;
  toPersonaId: string;
  typeId: string;
  description?: string | null;
}) {
  const parsed = parseInput(
    z.strictObject({
      worldId: idSchema,
      fromPersonaId: idSchema,
      toPersonaId: idSchema,
      typeId: idSchema,
      description: relationDescriptionSchema.optional(),
    }),
    input,
  );
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const { worldId, fromPersonaId, toPersonaId, typeId, description } = parsed.data;
  if (fromPersonaId === toPersonaId) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };

  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) return { ok: false as const, error: ERR_NON_AUTHENTIFIE };

  const decided = await decideStatus(supabase, userId, worldId, typeId, toPersonaId);
  if (!decided.ok) return { ok: false as const, error: decided.error };

  const { data, error } = await supabase
    .from("persona_relations")
    .insert({
      world_id: worldId,
      from_persona_id: fromPersonaId,
      to_persona_id: toPersonaId,
      type: typeId,
      description: description ?? null,
      status: decided.status,
      created_by: userId,
    })
    .select(RELATION_COLUMNS)
    .single();
  if (error) return { ok: false as const, error: echecEnregistrement("createPersonaRelation", error) };
  return { ok: true as const, relation: data as unknown as PersonaRelation };
}

/**
 * Change le type ou la description d'une relation.
 *
 * Le type d'une relation réciproque ne se change pas : son miroir porterait
 * l'ancien, et l'accord de l'autre joueur valait pour CE type. On la rompt et
 * on en propose une autre. Changer vers un type réciproque est refusé pour la
 * même raison — ce serait une demande, pas une modification.
 */
export async function updatePersonaRelation(
  id: string,
  data: { typeId?: string; description?: string | null },
) {
  const parsed = parseInput(
    z.strictObject({
      id: idSchema,
      data: z.strictObject({ typeId: idSchema, description: relationDescriptionSchema }).partial(),
    }),
    { id, data },
  );
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (parsed.data.data.description !== undefined) patch.description = parsed.data.data.description;

  if (parsed.data.data.typeId !== undefined) {
    const { data: current } = await supabase
      .from("persona_relations")
      .select("world_id, type")
      .eq("id", id)
      .maybeSingle();
    if (!current) return { ok: false as const, error: ERR_INTROUVABLE };
    const row = current as { world_id: string; type: string };
    const { data: types } = await supabase
      .from("world_relation_types")
      .select("id, mutual")
      .eq("world_id", row.world_id)
      .in("id", [row.type, parsed.data.data.typeId]);
    const byId = new Map(((types ?? []) as { id: string; mutual: boolean }[]).map((t) => [t.id, t.mutual]));
    if (!byId.has(parsed.data.data.typeId)) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
    if (byId.get(row.type) || byId.get(parsed.data.data.typeId)) {
      return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
    }
    patch.type = parsed.data.data.typeId;
  }

  if (Object.keys(patch).length === 0) return { ok: true as const };

  // Un refus RLS ne lève pas : il ne met rien à jour. C'est l'absence de
  // ligne rendue qui le trahit — sans quoi l'écran annoncerait une réussite
  // que le rechargement démentirait (c'était le cas avant la migration 173).
  const { data: updated, error } = await supabase
    .from("persona_relations")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("updatePersonaRelation", error) };
  if (!updated || updated.length === 0) return { ok: false as const, error: ERR_NON_AUTORISE };
  return { ok: true as const };
}

/**
 * Supprime une relation — ou la refuse, ou la rompt : c'est le même geste.
 * Le miroir d'une relation réciproque acceptée part avec elle, et les fiches
 * d'un couple retrouvent leur liberté (déclencheur de la migration 173).
 */
export async function deletePersonaRelation(id: string) {
  const parsed = parseInput(idSchema, id);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.from("persona_relations").delete().eq("id", id).select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("deletePersonaRelation", error) };
  if (!data || data.length === 0) return { ok: false as const, error: ERR_NON_AUTORISE };
  return { ok: true as const };
}

/** Accepte une relation en attente, au nom du persona visé. */
export async function acceptPersonaRelation(id: string) {
  const parsed = parseInput(idSchema, id);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc(RPC.ACCEPT_PERSONA_RELATION, { p_relation_id: id });
  if (error) return { ok: false as const, error: echecEnregistrement("acceptPersonaRelation", error) };
  return { ok: true as const };
}

/** Les relations d'un monde, telles que le canevas et les fiches les lisent. */
export async function listPersonaRelations(worldId: string) {
  const parsed = parseInput(idSchema, worldId);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("persona_relations")
    .select(RELATION_COLUMNS)
    .eq("world_id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("listPersonaRelations", error) };
  return { ok: true as const, relations: (data ?? []) as unknown as PersonaRelation[] };
}
