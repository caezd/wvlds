"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function InvitePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const handleInvite = async () => {
      // Supabase JS détecte automatiquement les tokens dans le fragment URL
      // (#access_token=...&type=invite) et établit la session
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setError("Lien d'invitation invalide ou expiré.");
        return;
      }

      const meta = data.session.user.user_metadata;
      const worldId = meta?.invited_world_id as string | undefined;
      const role = (meta?.invited_role as string | undefined) ?? "player";

      // Si l'invitation est liée à un monde, ajouter l'utilisateur comme membre
      if (worldId) {
        await supabase
          .from("world_members")
          .upsert(
            { world_id: worldId, user_id: data.session.user.id, role },
            { onConflict: "world_id,user_id" }
          );
      }

      router.replace("/auth/update-password");
    };

    void handleInvite();
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
