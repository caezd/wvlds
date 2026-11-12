"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";

type Props = Omit<ComponentProps<typeof Link>, "prefetch">;

/**
 * Lien vers un salon (`/c/[id]`), préchargé à l'intention et non à l'affichage.
 *
 * Le préchargement par défaut de `<Link>` part dès que le lien entre dans le
 * viewport. Pour `/c/[id]`, il rend côté serveur tout ce qui précède le
 * `loading.tsx` du salon — dont son layout : lecture du salon ET barre latérale
 * du monde complète (une dizaine de requêtes). Une liste de vingt salons
 * déclenchait ainsi environ deux cents requêtes Supabase à chaque affichage,
 * pour des salons que l'on n'ouvrira pour la plupart jamais.
 *
 * Ici, le préchargement reste coupé jusqu'au premier survol, focus clavier ou
 * toucher : on rend alors à `<Link>` son comportement par défaut, qui précharge
 * aussitôt ce lien visible — une à quelques centaines de millisecondes avant
 * le clic, ce qui masque l'essentiel de la latence, pour le seul salon visé.
 * Passer par la prop `prefetch` plutôt que `router.prefetch()` garde le
 * composant indépendant du contexte du routeur.
 */
export function ChatroomLink({ children, onPointerEnter, onFocus, onTouchStart, ...rest }: Props) {
  const [intention, setIntention] = useState(false);
  const signaler = () => {
    if (!intention) setIntention(true);
  };

  return (
    <Link
      {...rest}
      // `null` = comportement par défaut de Next (« auto »).
      prefetch={intention ? null : false}
      onPointerEnter={(e) => {
        signaler();
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        signaler();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        signaler();
        onTouchStart?.(e);
      }}
    >
      {children}
    </Link>
  );
}
