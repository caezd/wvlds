"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function InvitePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // INITIAL_SESSION : Supabase a détecté et traité le fragment URL au chargement
        // SIGNED_IN : token échangé avec succès
        if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
          const meta = session.user.user_metadata;
          const worldId = meta?.invited_world_id as string | undefined;
          const role = (meta?.invited_role as string | undefined) ?? "player";

          if (worldId) {
            await supabase
              .from("world_members")
              .upsert(
                { world_id: worldId, user_id: session.user.id, role },
                { onConflict: "world_id,user_id" }
              );
          }

          subscription.unsubscribe();
          router.replace("/auth/update-password");
          return;
        }

        if (event === "INITIAL_SESSION" && !session) {
          setError("Lien d'invitation invalide ou expiré.");
        }
      }
    );

    return () => subscription.unsubscribe();
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
