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
  // On vérifie que l'utilisateur courant en est toujours MEMBRE avant de
  // rediriger — pas seulement que le monde existe et reste lisible via RLS
  // (un monde public reste lisible par n'importe quel compte même après
  // l'avoir quitté, ce qui redirigeait à tort vers un monde inaccessible).
  const cookieStore = await cookies();
  const lastWorldId = cookieStore.get("last_world_id")?.value;
  if (lastWorldId) {
    const { data: accessible } = await supabase
      .from("worlds")
      .select("id, world_members!inner(user_id)")
      .eq("id", lastWorldId)
      .eq("world_members.user_id", userId)
      .is("deleted_at", null)
      .eq("is_archived", false)
      .maybeSingle();
    if (accessible) redirect(`/w/${lastWorldId}`);
  }

  // Fallback : premier monde dont l'utilisateur est membre
  const { data: world } = await supabase
    .from("worlds")
    .select("id, world_members!inner(user_id)")
    .eq("world_members.user_id", userId)
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
