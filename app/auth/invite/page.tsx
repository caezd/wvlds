"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function InvitePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const handle = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");

      // Flux PKCE : confirmation d'inscription ordinaire (?code=)
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(error.message);
          return;
        }
        router.replace("/");
        return;
      }

      // Flux implicite : invitation par email (#access_token=...)
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      const errorDescription = hashParams.get("error_description");

      if (errorDescription) {
        setError(errorDescription.replace(/\+/g, " "));
        return;
      }

      if (!access_token || !refresh_token) {
        setError("Lien d'invitation invalide ou expiré.");
        return;
      }

      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });

      if (error || !data.session) {
        setError(error?.message ?? "Impossible d'établir la session.");
        return;
      }

      window.history.replaceState(null, "", window.location.pathname);

      // L'adhésion au monde ne se décide plus ici : ce bloc lisait le monde
      // et le rôle dans `user_metadata`, que Supabase laisse l'utilisateur
      // réécrire lui-même, et l'écriture dans `world_members` était de toute
      // façon refusée par la RLS — silencieusement, l'erreur n'étant pas lue.
      // L'invitation vit désormais en base (cf. app/actions/invite.ts) et
      // s'accepte depuis les notifications.
      router.replace("/auth/update-password");
    };

    void handle();
  }, [router]);

  if (error) {
    return (
      <div>
        <h2 className="text-xl font-semibold md:text-2xl text-destructive">
          Lien invalide
        </h2>
        <p className="text-muted-foreground mt-2">{error}</p>
        <a href="/auth/login" className="underline text-sm mt-4 inline-block">
          Retour à la connexion
        </a>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold md:text-2xl">
        Vérification en cours…
      </h2>
      <p className="text-muted-foreground mt-2">
        Veuillez patienter pendant que nous établissons votre session.
      </p>
    </div>
  );
}
