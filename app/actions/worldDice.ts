"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { echecEnregistrement, ERR_INTROUVABLE } from "@/lib/actionErrors";
import { idSchema, parseInput } from "@/lib/inputSchemas";
import {
  diceRulesSchema,
  worldDieInputSchema,
  type DiceRules,
  type WorldDie,
  type WorldDieInput,
} from "@/lib/worldDice";

// Les dés d'un monde (migration 270). Les policies de `world_dice` réservent
// l'écriture à `world.settings` et cachent les dés masqués aux joueurs ; ces
// actions valident la saisie, la base tranche le reste.

const DIE_COLUMNS = "id, world_id, name, min_value, max_value, hidden, position";

/** Les dés du monde que l'on peut voir, dans leur ordre. */
export async function listWorldDice(worldId: string) {
  const input = parseInput(idSchema, worldId);
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("world_dice")
    .select(DIE_COLUMNS)
    .eq("world_id", input.data)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { ok: false as const, error: echecEnregistrement("listWorldDice", error) };
  return { ok: true as const, dice: (data ?? []) as WorldDie[] };
}

export async function createWorldDie(worldId: string, die: WorldDieInput) {
  const input = parseInput(z.strictObject({ worldId: idSchema, die: worldDieInputSchema }), { worldId, die });
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  // À la suite des autres : la position suit le plus grand rang connu.
  const { data: last } = await supabase
    .from("world_dice")
    .select("position")
    .eq("world_id", input.data.worldId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("world_dice")
    .insert({ world_id: input.data.worldId, ...input.data.die, position: (last?.position ?? -1) + 1 })
    .select(DIE_COLUMNS)
    .single();
  if (error || !data) return { ok: false as const, error: echecEnregistrement("createWorldDie", error) };
  return { ok: true as const, die: data as WorldDie };
}

export async function updateWorldDie(dieId: string, die: WorldDieInput) {
  const input = parseInput(z.strictObject({ dieId: idSchema, die: worldDieInputSchema }), { dieId, die });
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("world_dice")
    .update(input.data.die)
    .eq("id", input.data.dieId)
    .select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("updateWorldDie", error) };
  if (!data?.length) return { ok: false as const, error: ERR_INTROUVABLE };
  return { ok: true as const };
}

export async function deleteWorldDie(dieId: string) {
  const input = parseInput(idSchema, dieId);
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("world_dice").delete().eq("id", input.data).select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("deleteWorldDie", error) };
  if (!data?.length) return { ok: false as const, error: ERR_INTROUVABLE };
  return { ok: true as const };
}

/** Les règles des lancers du monde : dés permis, modification d'un lancer. */
export async function setWorldDiceRules(worldId: string, rules: DiceRules) {
  const input = parseInput(z.strictObject({ worldId: idSchema, rules: diceRulesSchema }), { worldId, rules });
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("worlds")
    .update(input.data.rules)
    .eq("id", input.data.worldId)
    .select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldDiceRules", error) };
  if (!data?.length) return { ok: false as const, error: ERR_INTROUVABLE };
  return { ok: true as const };
}
