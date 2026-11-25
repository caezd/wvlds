"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { echecEnregistrement } from "@/lib/actionErrors";
import { idSchema, parseInput } from "@/lib/inputSchemas";
import { taxSettingsSchema, type TaxSettings } from "@/lib/worldTax";

/**
 * Les réglages de la taxe d'un monde (migration 255). La permission est
 * celle de la mise à jour du monde (RLS) ; la base borne les valeurs.
 */
export async function setWorldTax(worldId: string, settings: TaxSettings) {
  const input = parseInput(z.strictObject({ worldId: idSchema, settings: taxSettingsSchema }), { worldId, settings });
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update(input.data.settings).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldTax", error) };
  return { ok: true as const };
}
