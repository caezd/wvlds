import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Dernier monde visité (cookie posé par le middleware)
  const cookieStore = await cookies();
  const lastWorldId = cookieStore.get("last_world_id")?.value;
  if (lastWorldId) {
    redirect(`/w/${lastWorldId}`);
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
