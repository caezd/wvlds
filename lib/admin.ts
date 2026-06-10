import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/** Vérifie que l'utilisateur courant est admin. Redirige sinon. */
export async function requireAdmin() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  return { user, supabase };
}

/** Retourne true/false sans redirect — utile pour afficher/masquer des liens. */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return data?.is_admin === true;
}
