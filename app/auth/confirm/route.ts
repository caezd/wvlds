import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/";
  // Only allow relative paths to prevent open redirect attacks
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // L'adhésion au monde ne se décide plus ici. Ce bloc lisait le monde et
      // le rôle dans `user_metadata` pour écrire dans `world_members` — deux
      // problèmes : Supabase laisse l'utilisateur réécrire ses propres
      // métadonnées, et l'écriture était de toute façon refusée par la RLS
      // (seul un administrateur du monde peut insérer un membre), sans que
      // personne ne lise l'erreur. L'invité n'a donc jamais rejoint quoi que
      // ce soit par ce chemin.
      //
      // L'invitation est désormais enregistrée en base au moment de l'envoi
      // (cf. app/actions/invite.ts) ; l'invité la retrouve dans ses
      // notifications et l'accepte via `accept_world_invitation`, qui applique
      // la vérification d'âge et le rôle prévu.
      redirect(next);
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${error?.message}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No token hash or type`);
}
