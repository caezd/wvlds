import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { getUserId } from "@/lib/auth";

export default async function Home() {
  const supabase = await createClient();
  // Vérification locale des claims JWT (sans requête réseau), au lieu d'un
  // auth.getUser() qui revalide en plus auprès du serveur Supabase Auth.
  const userId = await getUserId(supabase);

  if (!userId) {
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
