import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // Invitation dans un monde : ajouter le membre avant de poursuivre
      if (type === "invite" && data.user) {
        const meta = data.user.user_metadata;
        const worldId = meta?.invited_world_id as string | undefined;
        const role = (meta?.invited_role as string | undefined) ?? "player";
        if (worldId) {
          await supabase
            .from("world_members")
            .upsert(
              { world_id: worldId, user_id: data.user.id, role },
              { onConflict: "world_id,user_id" }
            );
        }
      }
      // redirect user to specified redirect URL or root of app
      redirect(next);
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${error?.message}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No token hash or type`);
}
