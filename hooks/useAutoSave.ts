"use client";

import * as React from "react";

import { DELAY } from "@/lib/constants";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Enregistre une saisie d'elle-même, après `delay` ms sans changement :
 * seulement si elle est valide et diffère de la dernière version enregistrée
 * (comparée en JSON). Un envoi à la fois : ce qui change pendant un envoi part
 * juste après, la dernière valeur gagne. `flush` (perte du focus) et le
 * démontage envoient tout de suite ce qui attend encore.
 *
 * `save` rend `true` si l'enregistrement a réussi ; il signale lui-même
 * l'échec (toast). Un échec ne se relance pas : la prochaine saisie le fera.
 */
export function useAutoSave<T>({
  value,
  valid,
  save,
  delay = DELAY.AUTOSAVE,
}: {
  value: T;
  valid: boolean;
  save: (value: T) => Promise<boolean>;
  delay?: number;
}): { status: AutoSaveStatus; flush: () => void } {
  const key = JSON.stringify(value);
  const [status, setStatus] = React.useState<AutoSaveStatus>("idle");
  const savedKey = React.useRef(key);
  const latest = React.useRef({ value, key, valid, save });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = React.useRef(false);
  const again = React.useRef(false);

  // Avant les effets ci-dessous (layout avant passifs) : le minuteur lit toujours la dernière saisie.
  React.useLayoutEffect(() => {
    latest.current = { value, key, valid, save };
  });

  const run = React.useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    for (;;) {
      again.current = false;
      const current = latest.current;
      if (!current.valid || current.key === savedKey.current) break;
      setStatus("saving");
      let ok = false;
      try {
        ok = await current.save(current.value);
      } catch {
        ok = false;
      }
      if (!ok) {
        setStatus("error");
        break;
      }
      savedKey.current = current.key;
      setStatus("saved");
      if (!again.current) break;
    }
    inFlight.current = false;
  }, []);

  const flush = React.useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    void run();
  }, [run]);

  // Le minuteur repart à chaque changement ; pas de nettoyage ici, sinon le
  // démontage l'effacerait avant que l'effet suivant ne l'envoie.
  React.useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!valid || key === savedKey.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, delay);
  }, [key, valid, delay, run]);

  React.useEffect(() => flush, [flush]);

  return { status, flush };
}
