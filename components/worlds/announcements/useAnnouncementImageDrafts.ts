"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { storagePathFromUrl } from "@/lib/storage";

/**
 * Les images d'en-tête téléversées pendant qu'on rédige une annonce, tant
 * qu'aucun envoi ne les a retenues. L'image part dans le stockage dès qu'on
 * la choisit : remplacée, retirée, ou laissée dans un brouillon qu'on quitte,
 * elle ne servirait plus à rien — on l'efface aussitôt.
 *
 * - `track(url)` : une image vient d'être téléversée pour ce formulaire ;
 * - `keep(url)` : l'envoi (ou l'enregistrement) a réussi avec cette image,
 *   elle reste ; les autres en attente partent ;
 * - `discardAll()` : brouillon abandonné (dialogue annulé), tout part.
 *
 * Seules les images téléversées ici sont concernées : celle d'une annonce déjà
 * envoyée, ou reprise de l'historique, peut servir ailleurs et n'est jamais
 * effacée par le formulaire. Ce qui échappe (onglet fermé net) est rattrapé
 * par le ménage quotidien (migration 236).
 */
export function useAnnouncementImageDrafts(currentUrl: string | null) {
  const pending = React.useRef(new Set<string>());

  const drop = React.useCallback((urls: string[]) => {
    const paths = urls
      .map((u) => storagePathFromUrl(u, "worlds"))
      .filter((p): p is string => !!p && /^user-[^/]+\/announcements\//.test(p));
    if (paths.length === 0) return;
    void createClient()
      .storage.from("worlds")
      .remove(paths)
      .then(({ error }: { error: unknown }) => {
        if (error) console.error("[announcements] image abandonnée", error);
      });
  }, []);

  const track = React.useCallback((url: string) => {
    pending.current.add(url);
  }, []);

  const keep = React.useCallback(
    (url: string | null) => {
      const others = [...pending.current].filter((u) => u !== url);
      pending.current.clear();
      drop(others);
    },
    [drop],
  );

  const discardAll = React.useCallback(() => keep(null), [keep]);

  // L'image affichée a changé (remplacée, retirée, annonce reprise) : celles
  // téléversées ici et qui ne sont plus affichées sont abandonnées.
  React.useEffect(() => {
    const others = [...pending.current].filter((u) => u !== currentUrl);
    if (others.length === 0) return;
    others.forEach((u) => pending.current.delete(u));
    drop(others);
  }, [currentUrl, drop]);

  // Formulaire quitté sans envoi.
  React.useEffect(() => () => discardAll(), [discardAll]);

  return { track, keep, discardAll };
}
