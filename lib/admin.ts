import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

async function fetchIsAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .single();
  return data?.is_admin === true;
}

/** Vérifie que l'utilisateur courant est admin. Redirige sinon. */
export async function requireAdmin() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  if (!(await fetchIsAdmin(supabase, user.id))) redirect("/");

  return { user, supabase };
}

/** Retourne true/false sans redirect — utile pour afficher/masquer des liens. */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  return fetchIsAdmin(supabase, user.id);
}
