"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function InvitePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // INITIAL_SESSION null = normal (pas de session préexistante)
    // SIGNED_IN = Supabase a échangé le token du fragment avec succès
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session) {
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
        }
      }
    );

    // Timeout de sécurité : si après 8 secondes aucune session n'est établie,
    // le token est probablement expiré ou invalide
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      setError("Lien d'invitation invalide ou expiré.");
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
