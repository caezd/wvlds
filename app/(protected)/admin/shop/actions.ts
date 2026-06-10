"use server";

import { requireAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const ItemSchema = z.object({
  key:         z.string().trim().min(1).max(64).regex(/^[a-z0-9_-]+$/, "Clé : minuscules, chiffres, - ou _"),
  name:        z.string().trim().min(1).max(80),
  slot:        z.enum(["avatar_frame"]),
  price_coins: z.coerce.number().int().min(0),
  asset_url:   z.string().trim().url("URL d'asset invalide"),
  preview_url: z.string().trim().url("URL de preview invalide").optional().or(z.literal("")).transform(v => v || null),
  active:      z.coerce.boolean().default(true),
});

export async function createItem(prevState: unknown, formData: FormData) {
  const { supabase } = await requireAdmin();

  const parsed = ItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join(" · ") };
  }

  const { error } = await supabase.from("cosmetic_items").insert(parsed.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/shop");
  redirect("/admin/shop");
}

export async function updateItem(id: string, prevState: unknown, formData: FormData) {
  const { supabase } = await requireAdmin();

  const parsed = ItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join(" · ") };
  }

  const { error } = await supabase
    .from("cosmetic_items")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/shop");
  redirect("/admin/shop");
}

export async function toggleItem(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.from("cosmetic_items").update({ active }).eq("id", id);
  revalidatePath("/admin/shop");
}

export async function deleteItem(id: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("cosmetic_items").delete().eq("id", id);
  revalidatePath("/admin/shop");
}
