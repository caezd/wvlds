import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Dernier monde visité (cookie posé par le middleware).
  // On vérifie que l'utilisateur courant y a toujours accès (RLS) avant de
  // rediriger : un autre compte connecté après déconnexion ne doit pas
  // atterrir sur un monde inaccessible.
  const cookieStore = await cookies();
  const lastWorldId = cookieStore.get("last_world_id")?.value;
  if (lastWorldId) {
    const { data: accessible } = await supabase
      .from("worlds")
      .select("id")
      .eq("id", lastWorldId)
      .is("deleted_at", null)
      .eq("is_archived", false)
      .maybeSingle();
    if (accessible) redirect(`/w/${lastWorldId}`);
  }

  // Fallback : premier monde accessible de l'utilisateur
  const { data: world } = await supabase
    .from("worlds")
    .select("id")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .limit(1)
    .single();

  if (world) {
    redirect(`/w/${world.id}`);
  }

  // Aucun monde : vers l'exploration
  redirect("/explore");
}
